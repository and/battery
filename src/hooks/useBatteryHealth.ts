import {useState, useEffect} from 'react';
import {Platform, NativeModules} from 'react-native';

export type HealthStatus = 'good' | 'fair' | 'poor' | 'unknown';

export interface BatteryHealth {
  status: HealthStatus;
  label: string;
}

const IOS_HEALTH: BatteryHealth = {
  status: 'unknown',
  label: 'Check Settings',
};

export function useBatteryHealth(): BatteryHealth {
  const [health, setHealth] = useState<BatteryHealth>(
    Platform.OS === 'ios' ? IOS_HEALTH : {status: 'unknown', label: 'Unknown'},
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    NativeModules.BatteryHealth.getHealthStatus()
      .then((result: BatteryHealth) => setHealth(result))
      .catch(() => setHealth({status: 'unknown', label: 'Unknown'}));
  }, []);

  return health;
}
