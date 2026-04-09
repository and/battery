import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_SLEEP_START_HOUR,
  DEFAULT_SLEEP_END_HOUR,
} from '../utils/constants';

const THRESHOLD_KEY = '@battery_threshold';
const MONITORING_KEY = '@monitoring_enabled';
const STATUS_ICON_KEY = '@status_icon_enabled';
const BATTERY_OPT_ASKED_KEY = '@battery_opt_asked';
const NOTHING_BG_ASKED_KEY = '@nothing_bg_asked';
const OVERCHARGE_ALERT_KEY = '@overcharge_alert_enabled';
const SLEEP_ENABLED_KEY = '@sleep_enabled';
const SLEEP_START_HOUR_KEY = '@sleep_start_hour';
const SLEEP_END_HOUR_KEY = '@sleep_end_hour';
const CHARGING_SESSIONS_KEY = '@charging_sessions';

export async function getThreshold(): Promise<number> {
  const value = await AsyncStorage.getItem(THRESHOLD_KEY);
  return value != null ? parseInt(value, 10) : DEFAULT_THRESHOLD;
}

export async function setThreshold(threshold: number): Promise<void> {
  await AsyncStorage.setItem(THRESHOLD_KEY, threshold.toString());
}

export async function getMonitoringEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(MONITORING_KEY);
  return value != null ? value === 'true' : true;
}

export async function setMonitoringEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(MONITORING_KEY, enabled.toString());
}

export async function getShowStatusIcon(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STATUS_ICON_KEY);
  return value != null ? value === 'true' : true;
}

export async function setShowStatusIcon(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STATUS_ICON_KEY, enabled.toString());
}

export async function getBatteryOptAsked(): Promise<boolean> {
  const value = await AsyncStorage.getItem(BATTERY_OPT_ASKED_KEY);
  return value === 'true';
}

export async function setBatteryOptAsked(): Promise<void> {
  await AsyncStorage.setItem(BATTERY_OPT_ASKED_KEY, 'true');
}

export async function getNothingBgAsked(): Promise<boolean> {
  const value = await AsyncStorage.getItem(NOTHING_BG_ASKED_KEY);
  return value === 'true';
}

export async function setNothingBgAsked(): Promise<void> {
  await AsyncStorage.setItem(NOTHING_BG_ASKED_KEY, 'true');
}

// --- Overcharge alert ---

export async function getOverchargeAlertEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(OVERCHARGE_ALERT_KEY);
  return value != null ? value === 'true' : true; // default: on
}

export async function setOverchargeAlertEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(OVERCHARGE_ALERT_KEY, enabled.toString());
}

// --- Sleep hours ---

export async function getSleepEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(SLEEP_ENABLED_KEY);
  return value === 'true'; // default: off
}

export async function setSleepEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SLEEP_ENABLED_KEY, enabled.toString());
}

export async function getSleepStartHour(): Promise<number> {
  const value = await AsyncStorage.getItem(SLEEP_START_HOUR_KEY);
  return value != null ? parseInt(value, 10) : DEFAULT_SLEEP_START_HOUR;
}

export async function setSleepStartHour(hour: number): Promise<void> {
  await AsyncStorage.setItem(SLEEP_START_HOUR_KEY, hour.toString());
}

export async function getSleepEndHour(): Promise<number> {
  const value = await AsyncStorage.getItem(SLEEP_END_HOUR_KEY);
  return value != null ? parseInt(value, 10) : DEFAULT_SLEEP_END_HOUR;
}

export async function setSleepEndHour(hour: number): Promise<void> {
  await AsyncStorage.setItem(SLEEP_END_HOUR_KEY, hour.toString());
}

// --- Charging sessions ---

export interface ChargingSession {
  startLevel: number;
  endLevel: number;
  startTime: number; // Unix ms
  endTime: number;   // Unix ms
}

export async function getChargingSessions(): Promise<ChargingSession[]> {
  const value = await AsyncStorage.getItem(CHARGING_SESSIONS_KEY);
  if (!value) {
    return [];
  }
  try {
    return JSON.parse(value) as ChargingSession[];
  } catch {
    return [];
  }
}

export async function saveChargingSessions(
  sessions: ChargingSession[],
): Promise<void> {
  await AsyncStorage.setItem(CHARGING_SESSIONS_KEY, JSON.stringify(sessions));
}
