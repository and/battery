import {useState, useEffect, useCallback, useRef} from 'react';
import DeviceInfo from 'react-native-device-info';
import {AppState, NativeEventEmitter, NativeModules} from 'react-native';

interface BatteryStatus {
  level: number; // 0-100
  isCharging: boolean; // plugged in, including when full
  isFull: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function useBatteryStatus(): BatteryStatus {
  const [level, setLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      // isBatteryCharging() is false once the battery is full, even while
      // plugged in, so read the battery state instead.
      const {batteryLevel = -1, batteryState} = await DeviceInfo.getPowerState();
      if (mounted.current) {
        // batteryLevel returns -1 on simulators/unsupported devices
        const clamped = batteryLevel < 0 ? 1 : batteryLevel;
        setLevel(Math.round(clamped * 100));
        setIsCharging(batteryState === 'charging' || batteryState === 'full');
        setIsFull(batteryState === 'full');
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
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        fetchStatus();
      }
    });

    // Instant update when charger is connected/disconnected
    const emitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
    const powerSub = emitter.addListener(
      'RNDeviceInfo_powerStateDidChange',
      fetchStatus,
    );

    // Light polling for UI updates only (every 30s)
    const interval = setInterval(fetchStatus, 30_000);

    return () => {
      mounted.current = false;
      appStateSub.remove();
      powerSub.remove();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  return {level, isCharging, isFull, refreshing, refresh};
}
