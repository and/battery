import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Platform,
  StatusBar,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useBatteryStatus} from '../hooks/useBatteryStatus';
import {
  getThreshold,
  setThreshold as saveThreshold,
  getMonitoringEnabled,
  setMonitoringEnabled as saveMonitoringEnabled,
} from '../storage/settings';
import {
  startMonitoring,
  stopMonitoring,
  forceCheck,
} from '../services/BatteryMonitor';
import {requestNotificationPermission} from '../services/NotificationService';
import {
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  DEFAULT_THRESHOLD,
} from '../utils/constants';

function getBatteryColor(level: number, threshold: number): string {
  if (level <= threshold) {
    return '#FF3B30';
  }
  if (level <= 30) {
    return '#FF9500';
  }
  return '#34C759';
}

function getChargingText(isCharging: boolean): string {
  return isCharging ? 'Charging' : 'Not Charging';
}

export default function HomeScreen(): React.JSX.Element {
  const {level, isCharging} = useBatteryStatus();
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [monitoring, setMonitoring] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // Request notification permission first (required on Android 13+)
      await requestNotificationPermission();

      const [savedThreshold, savedMonitoring] = await Promise.all([
        getThreshold(),
        getMonitoringEnabled(),
      ]);
      setThreshold(savedThreshold);
      setMonitoring(savedMonitoring);
      setLoaded(true);
      if (savedMonitoring) {
        startMonitoring();
      }
    })();
  }, []);

  const handleThresholdChange = useCallback(
    async (value: number) => {
      const rounded = Math.round(value);
      setThreshold(rounded);
      await saveThreshold(rounded);
      forceCheck();
    },
    [],
  );

  const handleMonitoringToggle = useCallback(
    async (enabled: boolean) => {
      setMonitoring(enabled);
      await saveMonitoringEnabled(enabled);
      if (enabled) {
        startMonitoring();
      } else {
        stopMonitoring();
      }
    },
    [],
  );

  if (!loaded) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
      </View>
    );
  }

  const batteryColor = getBatteryColor(level, threshold);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Battery Display */}
      <View style={styles.batterySection}>
        <Text style={[styles.batteryLevel, {color: batteryColor}]}>
          {level}%
        </Text>
        <View style={styles.batteryBar}>
          <View
            style={[
              styles.batteryFill,
              {width: `${level}%`, backgroundColor: batteryColor},
            ]}
          />
        </View>
        <Text style={[styles.chargingStatus, {color: isCharging ? '#34C759' : '#8E8E93'}]}>
          {isCharging ? '\u26A1 ' : ''}{getChargingText(isCharging)}
        </Text>
      </View>

      {/* Threshold Setting */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Alert Threshold</Text>
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdValue}>{threshold}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={MIN_THRESHOLD}
          maximumValue={MAX_THRESHOLD}
          step={1}
          value={threshold}
          onSlidingComplete={handleThresholdChange}
          minimumTrackTintColor="#FF3B30"
          maximumTrackTintColor="#3A3A3C"
          thumbTintColor="#FF3B30"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{MIN_THRESHOLD}%</Text>
          <Text style={styles.sliderLabel}>{MAX_THRESHOLD}%</Text>
        </View>
      </View>

      {/* Monitoring Toggle */}
      <View style={styles.toggleSection}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Battery Monitoring</Text>
            <Text style={styles.toggleDescription}>
              Alert when battery drops below {threshold}%
            </Text>
          </View>
          <Switch
            value={monitoring}
            onValueChange={handleMonitoringToggle}
            trackColor={{false: '#3A3A3C', true: '#34C75980'}}
            thumbColor={monitoring ? '#34C759' : '#636366'}
            ios_backgroundColor="#3A3A3C"
          />
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>
          The alert will only stop when you plug in your charger.
        </Text>
        <Text style={styles.infoText}>
          This app uses minimal battery by listening to system events.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
  },
  batterySection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  batteryLevel: {
    fontSize: 72,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  batteryBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 4,
  },
  chargingStatus: {
    fontSize: 16,
    marginTop: 12,
  },
  settingsSection: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  thresholdRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  thresholdValue: {
    color: '#FF3B30',
    fontSize: 32,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  toggleSection: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleDescription: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
    maxWidth: 240,
  },
  infoSection: {
    marginTop: 'auto',
    marginBottom: 40,
    alignItems: 'center',
  },
  infoText: {
    color: '#48484A',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
});
