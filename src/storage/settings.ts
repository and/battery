import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules, Platform} from 'react-native';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_QUIET_START,
  DEFAULT_QUIET_END,
} from '../utils/constants';

const THRESHOLD_KEY = '@battery_threshold';
const MONITORING_KEY = '@monitoring_enabled';
const STATUS_ICON_KEY = '@status_icon_enabled';
const FULL_CHARGE_ALERT_KEY = '@full_charge_alert_enabled';
const QUIET_START_KEY = '@quiet_start_minutes';
const QUIET_END_KEY = '@quiet_end_minutes';
const BATTERY_OPT_ASKED_KEY = '@battery_opt_asked';
const NOTHING_BG_ASKED_KEY = '@nothing_bg_asked';

export async function getThreshold(): Promise<number> {
  const value = await AsyncStorage.getItem(THRESHOLD_KEY);
  return value != null ? parseInt(value, 10) : DEFAULT_THRESHOLD;
}

export async function setThreshold(threshold: number): Promise<void> {
  await AsyncStorage.setItem(THRESHOLD_KEY, threshold.toString());
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.setThreshold(threshold);
  }
}

export async function getMonitoringEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(MONITORING_KEY);
  return value != null ? value === 'true' : true;
}

export async function setMonitoringEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(MONITORING_KEY, enabled.toString());
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.setMonitoringEnabled(enabled);
  }
}

export async function getFullChargeAlertEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(FULL_CHARGE_ALERT_KEY);
  return value === 'true';
}

export async function setFullChargeAlertEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(FULL_CHARGE_ALERT_KEY, enabled.toString());
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.setFullChargeAlertEnabled(enabled);
  }
}

export interface QuietHours {
  start: number; // minutes after midnight
  end: number;
}

export async function getQuietHours(): Promise<QuietHours> {
  const [start, end] = await Promise.all([
    AsyncStorage.getItem(QUIET_START_KEY),
    AsyncStorage.getItem(QUIET_END_KEY),
  ]);
  return {
    start: start != null ? parseInt(start, 10) : DEFAULT_QUIET_START,
    end: end != null ? parseInt(end, 10) : DEFAULT_QUIET_END,
  };
}

export async function setQuietHours({start, end}: QuietHours): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(QUIET_START_KEY, start.toString()),
    AsyncStorage.setItem(QUIET_END_KEY, end.toString()),
  ]);
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.setQuietHours(start, end);
  }
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
