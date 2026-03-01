import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_THRESHOLD} from '../utils/constants';

const THRESHOLD_KEY = '@battery_threshold';
const MONITORING_KEY = '@monitoring_enabled';

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
