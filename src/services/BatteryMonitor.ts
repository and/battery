import DeviceInfo from 'react-native-device-info';
import {AppState, AppStateStatus, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {
  showLowBatteryAlert,
  dismissLowBatteryAlert,
} from './NotificationService';
import {startAlarm, stopAlarm} from './AlarmService';
import {
  getThreshold,
  getMonitoringEnabled,
  getFullChargeAlertEnabled,
  getQuietHours,
} from '../storage/settings';
import {BATTERY_CHECK_INTERVAL_MS, SNOOZE_DURATION_MS} from '../utils/constants';
import {isInQuietHours} from '../utils/quietHours';

const isAndroid = Platform.OS === 'android';

let intervalId: ReturnType<typeof setInterval> | null = null;
let isAlerting = false;
let isSnoozed = false;
let snoozeTimerId: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: {remove: () => void} | null = null;
let powerStateSubscription: {remove: () => void} | null = null;
let deviceInfoEmitter: NativeEventEmitter | null = null;

async function checkBattery(): Promise<void> {
  if (isAndroid) {
    return;
  }

  try {
    const enabled = await getMonitoringEnabled();
    if (!enabled) {
      if (isAlerting) {
        await dismissLowBatteryAlert();
        isAlerting = false;
      }
      return;
    }

    const {batteryLevel = -1, batteryState} = await DeviceInfo.getPowerState();
    const isCharging =
      batteryState === 'charging' ||
      (batteryState === 'full' && batteryLevel >= 0.99);

    const batteryPercent =
      batteryLevel < 0 ? 100 : Math.round(batteryLevel * 100);
    const [threshold, quietHours] = await Promise.all([
      getThreshold(),
      getQuietHours(),
    ]);
    const inQuiet = isInQuietHours(quietHours);

    if (isCharging) {
      if (isAlerting) {
        await dismissLowBatteryAlert();
        stopAlarm();
        isAlerting = false;
      }
      clearSnooze();
      return;
    }

    if (batteryPercent <= threshold) {
      if (inQuiet) {
        if (isAlerting) {
          await dismissLowBatteryAlert();
          stopAlarm();
          isAlerting = false;
        }
        return;
      }
      await showLowBatteryAlert(batteryPercent);
      if (!isSnoozed) {
        startAlarm();
      }
      isAlerting = true;
    } else if (isAlerting) {
      await dismissLowBatteryAlert();
      stopAlarm();
      isAlerting = false;
    }
  } catch (e) {
    console.warn('[BatteryMonitor] checkBattery error:', e);
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    checkBattery();
  }
}

/** Legacy JS monitor (non-Android). On Android use {@link startBackgroundService}. */
export function startMonitoring(): void {
  if (isAndroid) {
    return;
  }
  if (intervalId) {
    return;
  }

  checkBattery();

  if (!deviceInfoEmitter) {
    deviceInfoEmitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
  }
  powerStateSubscription = deviceInfoEmitter.addListener(
    'RNDeviceInfo_powerStateDidChange',
    () => {
      checkBattery();
    },
  );

  intervalId = setInterval(checkBattery, BATTERY_CHECK_INTERVAL_MS);
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
}

export async function stopMonitoring(): Promise<void> {
  if (isAndroid) {
    return;
  }
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
  clearSnooze();
}

export function forceCheck(): void {
  if (isAndroid) {
    NativeModules.NativeSettings?.recheckBattery();
    return;
  }
  checkBattery();
}

export function getAlertingState(): boolean {
  return isAlerting;
}

export async function fetchAlertingState(): Promise<boolean> {
  if (isAndroid) {
    return NativeModules.NativeSettings?.getLowBatteryAlerting() ?? false;
  }
  return isAlerting;
}

function clearSnooze(): void {
  if (snoozeTimerId) {
    clearTimeout(snoozeTimerId);
    snoozeTimerId = null;
  }
  isSnoozed = false;
  if (isAndroid) {
    NativeModules.NativeSettings?.setSnoozeUntil(0);
  }
}

export function snoozeAlarm(): void {
  if (isAndroid) {
    NativeModules.NativeSettings?.stopAlarm();
    const snoozeUntil = Date.now() + SNOOZE_DURATION_MS;
    NativeModules.NativeSettings?.setSnoozeUntil(snoozeUntil);
    snoozeTimerId = setTimeout(() => {
      snoozeTimerId = null;
      NativeModules.NativeSettings?.setSnoozeUntil(0);
      NativeModules.NativeSettings?.recheckBattery();
    }, SNOOZE_DURATION_MS);
    return;
  }

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

export async function fetchSnoozedState(): Promise<boolean> {
  if (isAndroid) {
    return NativeModules.NativeSettings?.getSnoozed() ?? false;
  }
  return isSnoozed;
}

/** Push all settings from AsyncStorage to native prefs and (re)start monitoring. */
export async function syncNativeSettings(): Promise<void> {
  if (!isAndroid) {
    return;
  }
  const [threshold, fullChargeAlert, quietHours, monitoring] = await Promise.all([
    getThreshold(),
    getFullChargeAlertEnabled(),
    getQuietHours(),
    getMonitoringEnabled(),
  ]);
  NativeModules.NativeSettings?.setThreshold(threshold);
  NativeModules.NativeSettings?.setFullChargeAlertEnabled(fullChargeAlert);
  NativeModules.NativeSettings?.setQuietHours(quietHours.start, quietHours.end);
  NativeModules.NativeSettings?.setMonitoringEnabled(monitoring);
  NativeModules.NativeSettings?.scheduleQuietHours();
  if (monitoring) {
    NativeModules.NativeSettings?.startMonitoring();
  } else {
    NativeModules.NativeSettings?.stopMonitoring();
  }
}

/** @deprecated Use {@link syncNativeSettings} */
export async function startBackgroundService(): Promise<void> {
  await syncNativeSettings();
}

export async function stopBackgroundService(): Promise<void> {
  await syncNativeSettings();
}
