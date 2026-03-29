import DeviceInfo from 'react-native-device-info';
import {AppState, AppStateStatus, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import BackgroundService from 'react-native-background-actions';
import {
  showLowBatteryAlert,
  dismissLowBatteryAlert,
  showOverchargeAlert,
  dismissOverchargeAlert,
} from './NotificationService';
import {startAlarm, stopAlarm} from './AlarmService';
import {
  getThreshold,
  getMonitoringEnabled,
  getOverchargeAlertEnabled,
  getSleepEnabled,
  getSleepStartHour,
  getSleepEndHour,
  getChargingSessions,
  saveChargingSessions,
  ChargingSession,
} from '../storage/settings';
import {
  BATTERY_CHECK_INTERVAL_MS,
  SNOOZE_DURATION_MS,
  OVERCHARGE_DELAY_MS,
} from '../utils/constants';
import {isInSleepHours} from '../utils/timeUtils';

let intervalId: ReturnType<typeof setInterval> | null = null;
let isAlerting = false;
let isSnoozed = false;
let snoozeTimerId: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: {remove: () => void} | null = null;
let powerStateSubscription: {remove: () => void} | null = null;
let deviceInfoEmitter: NativeEventEmitter | null = null;

// Overcharge tracking
let overchargeTimerId: ReturnType<typeof setTimeout> | null = null;
let isOverchargeAlerting = false;

// Charging session tracking
let currentSession: {startLevel: number; startTime: number} | null = null;
const MAX_SESSIONS = 30;

async function checkBattery(): Promise<void> {
  const enabled = await getMonitoringEnabled();
  if (!enabled) {
    if (isAlerting) {
      await dismissLowBatteryAlert();
      isAlerting = false;
    }
    clearOverchargeTimer();
    return;
  }

  const [level, isCharging] = await Promise.all([
    DeviceInfo.getBatteryLevel(),
    DeviceInfo.isBatteryCharging(),
  ]);

  // level returns -1 on simulators/unsupported devices — treat as full
  const batteryPercent = level < 0 ? 100 : Math.round(level * 100);
  const threshold = await getThreshold();

  if (isCharging) {
    // Dismiss low-battery alert if charger was just plugged in
    if (isAlerting) {
      await dismissLowBatteryAlert();
      stopAlarm();
      isAlerting = false;
    }
    clearSnooze();

    // Overcharge detection: start timer when battery hits 100%
    await checkOvercharge(batteryPercent);

    // Session tracking: record session start if this is a new charge
    if (currentSession === null) {
      currentSession = {startLevel: batteryPercent, startTime: Date.now()};
    }
    return;
  }

  // Not charging — clear overcharge timer and dismiss any overcharge alert
  if (overchargeTimerId || isOverchargeAlerting) {
    clearOverchargeTimer();
    await dismissOverchargeAlert();
    isOverchargeAlerting = false;
  }

  // Session tracking: record session end when charger is unplugged
  if (currentSession !== null) {
    await recordSessionEnd(batteryPercent);
  }

  // Not charging and battery is at or below threshold
  if (batteryPercent <= threshold) {
    await showLowBatteryAlert(batteryPercent);
    if (!isSnoozed) {
      const inSleep = await shouldSuppressAlarm();
      if (!inSleep) {
        startAlarm();
      }
    }
    isAlerting = true;
  }
}

async function checkOvercharge(batteryPercent: number): Promise<void> {
  const overchargeEnabled = await getOverchargeAlertEnabled();
  if (!overchargeEnabled) {
    clearOverchargeTimer();
    return;
  }

  if (batteryPercent >= 100) {
    // Start the overcharge timer if not already running
    if (overchargeTimerId === null && !isOverchargeAlerting) {
      overchargeTimerId = setTimeout(async () => {
        overchargeTimerId = null;
        isOverchargeAlerting = true;
        await showOverchargeAlert();
      }, OVERCHARGE_DELAY_MS);
    }
  } else {
    // Battery below 100% while charging — clear any pending overcharge timer
    clearOverchargeTimer();
    if (isOverchargeAlerting) {
      await dismissOverchargeAlert();
      isOverchargeAlerting = false;
    }
  }
}

function clearOverchargeTimer(): void {
  if (overchargeTimerId) {
    clearTimeout(overchargeTimerId);
    overchargeTimerId = null;
  }
}

async function shouldSuppressAlarm(): Promise<boolean> {
  const sleepEnabled = await getSleepEnabled();
  if (!sleepEnabled) {
    return false;
  }
  const [startHour, endHour] = await Promise.all([
    getSleepStartHour(),
    getSleepEndHour(),
  ]);
  return isInSleepHours(startHour, endHour);
}

async function recordSessionEnd(endLevel: number): Promise<void> {
  if (!currentSession) {
    return;
  }
  const session: ChargingSession = {
    startLevel: currentSession.startLevel,
    endLevel,
    startTime: currentSession.startTime,
    endTime: Date.now(),
  };
  currentSession = null;

  const sessions = await getChargingSessions();
  sessions.push(session);
  // Keep only the most recent MAX_SESSIONS
  const trimmed = sessions.slice(-MAX_SESSIONS);
  await saveChargingSessions(trimmed);
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    checkBattery();
  }
}

export function startMonitoring(): void {
  if (intervalId) {
    return;
  }

  // Initial check
  checkBattery();

  // Listen for power state changes (charger connect/disconnect)
  // This is event-driven and fires instantly when charging state changes
  if (!deviceInfoEmitter) {
    deviceInfoEmitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
  }
  powerStateSubscription = deviceInfoEmitter.addListener(
    'RNDeviceInfo_powerStateDidChange',
    () => {
      checkBattery();
    },
  );

  // Fallback polling interval (safety net)
  intervalId = setInterval(checkBattery, BATTERY_CHECK_INTERVAL_MS);

  // Check when app returns to foreground
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

export async function stopMonitoring(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (powerStateSubscription) {
    powerStateSubscription.remove();
    powerStateSubscription = null;
  }
  if (isAlerting) {
    try {
      await dismissLowBatteryAlert();
    } catch (error) {
      console.error('[BatteryMonitor] Failed to dismiss alert:', error);
    }
    stopAlarm();
    isAlerting = false;
  }
  clearOverchargeTimer();
  clearSnooze();
}

export function forceCheck(): void {
  checkBattery();
}

export function getAlertingState(): boolean {
  return isAlerting;
}

function clearSnooze(): void {
  if (snoozeTimerId) {
    clearTimeout(snoozeTimerId);
    snoozeTimerId = null;
  }
  isSnoozed = false;
}

export function snoozeAlarm(): void {
  stopAlarm();
  isSnoozed = true;
  snoozeTimerId = setTimeout(() => {
    isSnoozed = false;
    snoozeTimerId = null;
    checkBattery();
  }, SNOOZE_DURATION_MS);
}

export function getSnoozedState(): boolean {
  return isSnoozed;
}

// --- Background service ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function backgroundTaskFn(): Promise<void> {
  console.log('[BatteryMonitor] Background task started');
  while (BackgroundService.isRunning()) {
    try {
      await checkBattery();
    } catch (error) {
      console.error('[BatteryMonitor] checkBattery error:', error);
    }
    await sleep(BATTERY_CHECK_INTERVAL_MS);
  }
  console.log('[BatteryMonitor] Background task stopped');
}

export async function headlessTask(): Promise<void> {
  const enabled = await getMonitoringEnabled();
  if (!enabled) {
    return;
  }
  await backgroundTaskFn();
}

const BACKGROUND_SERVICE_OPTIONS = {
  taskName: 'BatteryMonitor',
  taskTitle: 'Battery Alert',
  taskDesc: 'Monitoring battery...',
  taskIcon: {name: 'ic_stat_battery_monitor', type: 'drawable' as const},
};

export async function startBackgroundService(): Promise<void> {
  if (Platform.OS !== 'android' || BackgroundService.isRunning()) {
    return;
  }
  await BackgroundService.start(backgroundTaskFn, BACKGROUND_SERVICE_OPTIONS);
}

export async function stopBackgroundService(): Promise<void> {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) {
    return;
  }
  await BackgroundService.stop();
}
