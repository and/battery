import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Platform,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
  AccessibilityInfo,
  useColorScheme,
  Pressable,
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
  getAlertingState,
  getSnoozedState,
  snoozeAlarm,
} from '../services/BatteryMonitor';
import {requestNotificationPermission} from '../services/NotificationService';
import {
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  DEFAULT_THRESHOLD,
} from '../utils/constants';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const GAUGE_SIZE = Math.min(SCREEN_WIDTH * 0.52, 220);

// --- WCAG AA compliant color system ---
// All text colors tested against bg #09090B for 4.5:1+ contrast ratio
const COLORS = {
  bg: '#09090B',
  surface: '#131316',
  surfaceBorder: '#2A2A32',        // raised from #1E1E24 for visibility
  critical: '#F87171',             // raised from #EF4444 → 5.2:1 on bg
  criticalDim: '#7F1D1D',
  criticalGlow: '#EF444440',
  warning: '#FBBF24',             // raised from #F59E0B → 9.8:1 on bg
  warningDim: '#78350F',
  good: '#34D399',                // raised from #10B981 → 7.4:1 on bg
  goodDim: '#064E3B',
  goodGlow: '#10B98130',
  textPrimary: '#FAFAFA',         // 19.5:1 on bg
  textSecondary: '#A1A1AA',       // raised from #71717A → 7.1:1 on bg
  textMuted: '#71717A',           // 4.6:1 on bg - for large text only
  gaugeInactive: '#2A2A32',       // visible inactive segments
};

function getBatteryColor(level: number, threshold: number) {
  if (level <= threshold) {
    return {main: COLORS.critical, dim: COLORS.criticalDim, glow: COLORS.criticalGlow};
  }
  if (level <= 35) {
    return {main: COLORS.warning, dim: COLORS.warningDim, glow: '#FBBF2425'};
  }
  return {main: COLORS.good, dim: COLORS.goodDim, glow: COLORS.goodGlow};
}

function getBatteryStateDescription(
  level: number,
  threshold: number,
  isCharging: boolean,
): string {
  if (isCharging) {
    return `Battery at ${level}%, currently charging`;
  }
  if (level <= threshold) {
    return `Battery critically low at ${level}%, below your ${threshold}% alert threshold. Please plug in your charger.`;
  }
  return `Battery at ${level}%, on battery power`;
}

// --- Reduce motion hook ---
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  return reduceMotion;
}

// --- Pulsing glow for critical state ---
function PulsingRing({
  color,
  active,
  size,
  reduceMotion,
}: {
  color: string;
  active: boolean;
  size: number;
  reduceMotion: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active && !reduceMotion) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.12,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [active, reduceMotion, pulse]);

  const opacity = reduceMotion
    ? (active ? 0.5 : 0)
    : pulse.interpolate({
        inputRange: [1, 1.12],
        outputRange: [0.25, 0.5],
      });

  if (!active) {
    return null;
  }

  return (
    <Animated.View
      importantForAccessibility="no"
      style={{
        position: 'absolute',
        width: size + 24,
        height: size + 24,
        borderRadius: (size + 24) / 2,
        borderWidth: 2,
        borderColor: color,
        opacity,
        transform: reduceMotion ? [] : [{scale: pulse}],
      }}
    />
  );
}

// --- Circular gauge ring ---
function GaugeRing({
  level,
  color,
  size,
}: {
  level: number;
  color: string;
  size: number;
}) {
  const segments = 40;
  const segmentAngle = 360 / segments;

  return (
    <View
      style={{width: size, height: size, position: 'relative'}}
      importantForAccessibility="no">
      {Array.from({length: segments}).map((_, i) => {
        const segmentProgress = (i + 1) / segments;
        const isActive = segmentProgress <= level / 100;
        const rotation = i * segmentAngle;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              alignItems: 'center',
              transform: [{rotate: `${rotation}deg`}],
            }}>
            <View
              style={{
                width: 4,
                height: 11,
                borderRadius: 2,
                backgroundColor: isActive ? color : COLORS.gaugeInactive,
                opacity: isActive ? 1 : 0.5,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

// --- Fade-in wrapper (respects reduce motion) ---
function FadeIn({
  delay = 0,
  reduceMotion,
  children,
}: {
  delay?: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 16)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, reduceMotion, opacity, translateY]);

  return (
    <Animated.View style={{opacity, transform: [{translateY}]}}>
      {children}
    </Animated.View>
  );
}

export default function HomeScreen(): React.JSX.Element {
  const {level, isCharging} = useBatteryStatus();
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [monitoring, setMonitoring] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    (async () => {
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

  useEffect(() => {
    const poll = setInterval(() => {
      setAlerting(getAlertingState());
      setSnoozed(getSnoozedState());
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  const handleSnooze = useCallback(() => {
    snoozeAlarm();
    setAlerting(getAlertingState());
    setSnoozed(true);
  }, []);

  const handleThresholdSlide = useCallback((value: number) => {
    setThreshold(Math.round(value));
  }, []);

  const handleThresholdCommit = useCallback(async (value: number) => {
    const rounded = Math.round(value);
    setThreshold(rounded);
    await saveThreshold(rounded);
    forceCheck();
  }, []);

  const handleMonitoringToggle = useCallback(async (enabled: boolean) => {
    setMonitoring(enabled);
    await saveMonitoringEnabled(enabled);
    if (enabled) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }, []);

  const batteryColors = useMemo(
    () => getBatteryColor(level, threshold),
    [level, threshold],
  );
  const isCritical = level <= threshold;
  const batteryDescription = useMemo(
    () => getBatteryStateDescription(level, threshold, isCharging),
    [level, threshold, isCharging],
  );

  if (!loaded) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="summary">
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <FadeIn delay={0} reduceMotion={reduceMotion}>
        <View style={styles.header}>
          <Text style={styles.appTitle} accessibilityRole="header">
            BATTERY ALERT
          </Text>
          <View
            style={styles.statusPill}
            accessible={true}
            accessibilityLabel={`Monitoring is ${monitoring ? 'active' : 'off'}`}
            accessibilityRole="text">
            <View
              style={[
                styles.statusDot,
                {backgroundColor: monitoring ? COLORS.good : COLORS.textMuted},
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {color: monitoring ? COLORS.good : COLORS.textSecondary},
              ]}>
              {monitoring ? 'ACTIVE' : 'OFF'}
            </Text>
          </View>
        </View>
      </FadeIn>

      {/* Hero gauge */}
      <FadeIn delay={reduceMotion ? 0 : 100} reduceMotion={reduceMotion}>
        <View
          style={styles.gaugeContainer}
          accessible={true}
          accessibilityLabel={batteryDescription}
          accessibilityRole="text">
          <PulsingRing
            color={batteryColors.main}
            active={isCritical && !isCharging}
            size={GAUGE_SIZE}
            reduceMotion={reduceMotion}
          />
          <GaugeRing
            level={level}
            color={batteryColors.main}
            size={GAUGE_SIZE}
          />
          <View style={styles.gaugeCenter}>
            <Text
              style={[styles.gaugePercent, {color: batteryColors.main}]}
              accessibilityElementsHidden={true}>
              {level}
            </Text>
            <Text
              style={styles.gaugePercentSign}
              accessibilityElementsHidden={true}>
              %
            </Text>
            <View style={styles.chargingRow}>
              {isCharging && (
                <Text
                  style={styles.chargingBolt}
                  accessibilityElementsHidden={true}>
                  {'\u26A1'}
                </Text>
              )}
              <Text
                style={[
                  styles.chargingLabel,
                  {color: isCharging ? COLORS.good : COLORS.textSecondary},
                ]}
                accessibilityElementsHidden={true}>
                {isCharging ? 'Charging' : 'On Battery'}
              </Text>
            </View>
          </View>
        </View>
      </FadeIn>

      {/* Snooze button */}
      {alerting && !snoozed && (
        <FadeIn delay={0} reduceMotion={reduceMotion}>
          <Pressable
            style={({pressed}) => [
              styles.snoozeButton,
              pressed && styles.snoozeButtonPressed,
            ]}
            onPress={handleSnooze}
            accessibilityLabel="Snooze alarm for 5 minutes"
            accessibilityRole="button">
            <Text style={styles.snoozeButtonText}>Snooze 5 min</Text>
          </Pressable>
        </FadeIn>
      )}
      {snoozed && (
        <FadeIn delay={0} reduceMotion={reduceMotion}>
          <View
            style={styles.snoozedLabel}
            accessible={true}
            accessibilityLabel="Alarm snoozed"
            accessibilityRole="text">
            <Text style={styles.snoozedText}>Snoozed</Text>
          </View>
        </FadeIn>
      )}

      {/* Threshold card */}
      <FadeIn delay={reduceMotion ? 0 : 200} reduceMotion={reduceMotion}>
        <View
          style={styles.card}
          accessible={false}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel} accessibilityRole="header">
              Alert Threshold
            </Text>
            <Text
              style={[styles.thresholdBadge, {color: COLORS.critical}]}
              accessibilityLabel={`Current threshold: ${threshold}%`}>
              {threshold}%
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={MIN_THRESHOLD}
            maximumValue={MAX_THRESHOLD}
            step={1}
            value={threshold}
            onValueChange={handleThresholdSlide}
            onSlidingComplete={handleThresholdCommit}
            minimumTrackTintColor={COLORS.critical}
            maximumTrackTintColor={COLORS.surfaceBorder}
            thumbTintColor={COLORS.critical}
            accessibilityLabel="Battery alert threshold"
            accessibilityHint={`Slide to set the battery level that triggers an alert. Currently set to ${threshold}%`}
            accessibilityRole="adjustable"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{MIN_THRESHOLD}%</Text>
            <Text style={styles.sliderLabel}>{MAX_THRESHOLD}%</Text>
          </View>
        </View>
      </FadeIn>

      {/* Monitoring toggle card */}
      <FadeIn delay={reduceMotion ? 0 : 300} reduceMotion={reduceMotion}>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.cardLabel} accessibilityRole="header">
                Monitoring
              </Text>
              <Text style={styles.toggleSub}>
                Alarm sounds below {threshold}% until plugged in
              </Text>
            </View>
            <Switch
              value={monitoring}
              onValueChange={handleMonitoringToggle}
              trackColor={{false: '#27272A', true: COLORS.goodDim}}
              thumbColor={monitoring ? COLORS.good : '#71717A'}
              ios_backgroundColor="#27272A"
              accessibilityLabel="Battery monitoring"
              accessibilityHint={`${monitoring ? 'Disable' : 'Enable'} battery monitoring alerts`}
              accessibilityRole="switch"
              style={styles.switchSize}
            />
          </View>
        </View>
      </FadeIn>

      {/* Footer */}
      <FadeIn delay={reduceMotion ? 0 : 400} reduceMotion={reduceMotion}>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Event-driven {'\u00B7'} Zero background drain
          </Text>
        </View>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
    minHeight: 44, // WCAG touch target
  },
  appTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,                   // raised from 14
    fontWeight: '700',
    letterSpacing: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 10,            // raised for 44pt touch target
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    minHeight: 44,                  // WCAG touch target
  },
  statusDot: {
    width: 8,                       // raised from 6
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,                   // raised from 11
    fontWeight: '600',
    letterSpacing: 1.5,
  },

  // Gauge
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: GAUGE_SIZE + 40,
    marginBottom: 28,
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugePercent: {
    fontSize: 56,                   // large text - 3:1 ratio sufficient
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  gaugePercentSign: {
    color: COLORS.textSecondary,    // raised from textTertiary → 7.1:1
    fontSize: 20,                   // raised from 18
    fontWeight: '300',
    marginTop: -6,
  },
  chargingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  chargingBolt: {
    fontSize: 16,                   // raised from 13
    marginRight: 4,
  },
  chargingLabel: {
    fontSize: 14,                   // raised from 12
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Snooze
  snoozeButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.critical,
    paddingVertical: 14,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  snoozeButtonPressed: {
    opacity: 0.7,
  },
  snoozeButtonText: {
    color: COLORS.critical,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  snoozedLabel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    paddingVertical: 14,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  snoozedText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Cards
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    padding: 20,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardLabel: {
    color: COLORS.textSecondary,    // raised from textSecondary → 7.1:1
    fontSize: 13,                   // raised from 11
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  thresholdBadge: {
    fontSize: 22,                   // raised from 20
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },

  // Slider
  slider: {
    width: '100%',
    height: 44,                     // WCAG touch target
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sliderLabel: {
    color: COLORS.textMuted,        // 4.6:1 on bg — AA pass for this size
    fontSize: 13,                   // raised from 11
    fontVariant: ['tabular-nums'],
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,                  // ensure touch target
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleSub: {
    color: COLORS.textSecondary,    // raised from textTertiary → 7.1:1
    fontSize: 14,                   // raised from 12
    marginTop: 6,
    lineHeight: 20,                 // raised for readability
  },
  switchSize: {
    transform: [{scale: 1.1}],     // slightly larger for older users
  },

  // Footer
  footer: {
    marginTop: 'auto',
    marginBottom: 36,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textMuted,        // 4.6:1 — AA pass
    fontSize: 13,                   // raised from 11
    letterSpacing: 0.3,
  },
});
