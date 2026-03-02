import DeviceInfo from 'react-native-device-info';
import {AppState, AppStateStatus, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import BackgroundService from 'react-native-background-actions';
import {
  showLowBatteryAlert,
  dismissLowBatteryAlert,
} from './NotificationService';
import {startAlarm, stopAlarm} from './AlarmService';
import {getThreshold, getMonitoringEnabled} from '../storage/settings';
import {BATTERY_CHECK_INTERVAL_MS, SNOOZE_DURATION_MS} from '../utils/constants';

let intervalId: ReturnType<typeof setInterval> | null = null;
let isAlerting = false;
let isSnoozed = false;
let snoozeTimerId: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: {remove: () => void} | null = null;
let powerStateSubscription: {remove: () => void} | null = null;

async function checkBattery(): Promise<void> {
  const enabled = await getMonitoringEnabled();
  if (!enabled) {
    if (isAlerting) {
      await dismissLowBatteryAlert();
      isAlerting = false;
    }
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
    if (isAlerting) {
      await dismissLowBatteryAlert();
      stopAlarm();
      isAlerting = false;
    }
    clearSnooze();
    return;
  }

  // Not charging and battery is at or below threshold
  if (batteryPercent <= threshold) {
    await showLowBatteryAlert(batteryPercent);
    if (!isAlerting && !isSnoozed) {
      startAlarm();
    }
    isAlerting = true;
  }
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
  const deviceInfoEmitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
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

export function stopMonitoring(): void {
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
    dismissLowBatteryAlert();
    stopAlarm();
    isAlerting = false;
  }
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
  while (BackgroundService.isRunning()) {
    await checkBattery();
    await sleep(BATTERY_CHECK_INTERVAL_MS);
  }
}

const BACKGROUND_SERVICE_OPTIONS = {
  taskName: 'BatteryMonitor',
  taskTitle: 'Battery Alert',
  taskDesc: 'Monitoring battery...',
  taskIcon: {name: 'ic_launcher', type: 'mipmap' as const},
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
