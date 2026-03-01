import DeviceInfo from 'react-native-device-info';
import {AppState, AppStateStatus, NativeEventEmitter, NativeModules} from 'react-native';
import {
  showLowBatteryAlert,
  dismissLowBatteryAlert,
} from './NotificationService';
import {startAlarm, stopAlarm} from './AlarmService';
import {getThreshold, getMonitoringEnabled} from '../storage/settings';
import {BATTERY_CHECK_INTERVAL_MS} from '../utils/constants';

let intervalId: ReturnType<typeof setInterval> | null = null;
let isAlerting = false;
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

  const batteryPercent = Math.round(level * 100);
  const threshold = await getThreshold();

  if (isCharging) {
    if (isAlerting) {
      await dismissLowBatteryAlert();
      stopAlarm();
      isAlerting = false;
    }
    return;
  }

  // Not charging and battery is at or below threshold
  if (batteryPercent <= threshold) {
    await showLowBatteryAlert(batteryPercent);
    if (!isAlerting) {
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
}

export function forceCheck(): void {
  checkBattery();
}

export function getAlertingState(): boolean {
  return isAlerting;
}
