import {useState, useEffect, useCallback, useRef} from 'react';
import DeviceInfo from 'react-native-device-info';
import {AppState} from 'react-native';

interface BatteryStatus {
  level: number; // 0-100
  isCharging: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function useBatteryStatus(): BatteryStatus {
  const [level, setLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const [batteryLevel, charging] = await Promise.all([
        DeviceInfo.getBatteryLevel(),
        DeviceInfo.isBatteryCharging(),
      ]);
      if (mounted.current) {
        setLevel(Math.round(batteryLevel * 100));
        setIsCharging(charging);
      }
    } catch {
      // Silently handle — battery info may be unavailable in simulator
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStatus();
    if (mounted.current) {
      setRefreshing(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    mounted.current = true;
    fetchStatus();

    // Refresh when app comes to foreground
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        fetchStatus();
      }
    });

    // Light polling for UI updates only (every 30s)
    const interval = setInterval(fetchStatus, 30_000);

    return () => {
      mounted.current = false;
      sub.remove();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  return {level, isCharging, refreshing, refresh};
}
