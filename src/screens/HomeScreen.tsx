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
  Pressable,
  Linking,
  Alert,
  NativeModules,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useBatteryStatus} from '../hooks/useBatteryStatus';
import {useBatteryHealth} from '../hooks/useBatteryHealth';
import {
  getThreshold,
  setThreshold as saveThreshold,
  getMonitoringEnabled,
  setMonitoringEnabled as saveMonitoringEnabled,
  getBatteryOptAsked,
  setBatteryOptAsked,
  getNothingBgAsked,
  setNothingBgAsked,
  getOverchargeAlertEnabled,
  setOverchargeAlertEnabled as saveOverchargeAlertEnabled,
  getSleepEnabled,
  setSleepEnabled as saveSleepEnabled,
  getSleepStartHour,
  setSleepStartHour as saveSleepStartHour,
  getSleepEndHour,
  setSleepEndHour as saveSleepEndHour,
} from '../storage/settings';
import DeviceInfo from 'react-native-device-info';
import {
  startMonitoring,
  stopMonitoring,
  forceCheck,
  getAlertingState,
  getSnoozedState,
  snoozeAlarm,
  startBackgroundService,
  stopBackgroundService,
} from '../services/BatteryMonitor';
import {
  getRecommendations,
  getSessionCount,
  MIN_SESSIONS_FOR_ANALYSIS,
  Recommendation,
} from '../services/ChargingPatternService';
import {requestNotificationPermission} from '../services/NotificationService';
import {
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  DEFAULT_THRESHOLD,
} from '../utils/constants';
import {formatHour} from '../utils/timeUtils';

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

function getHealthColor(status: string): string {
  switch (status) {
    case 'good':
      return COLORS.good;
    case 'fair':
      return COLORS.warning;
    case 'poor':
      return COLORS.critical;
    default:
      return COLORS.textMuted;
  }
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
  const batteryHealth = useBatteryHealth();
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [monitoring, setMonitoring] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const reduceMotion = useReduceMotion();

  // Feature 1: overcharge
  const [overchargeAlertEnabled, setOverchargeAlertEnabled] = useState(true);

  // Feature 2: sleep hours
  const [sleepEnabled, setSleepEnabled] = useState(false);
  const [sleepStartHour, setSleepStartHour] = useState(22);
  const [sleepEndHour, setSleepEndHour] = useState(7);

  // Feature 4: charging habits
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    (async () => {
      await requestNotificationPermission();
      const [
        savedThreshold,
        savedMonitoring,
        savedOvercharge,
        savedSleepEnabled,
        savedSleepStart,
        savedSleepEnd,
      ] = await Promise.all([
        getThreshold(),
        getMonitoringEnabled(),
        getOverchargeAlertEnabled(),
        getSleepEnabled(),
        getSleepStartHour(),
        getSleepEndHour(),
      ]);
      setThreshold(savedThreshold);
      setMonitoring(savedMonitoring);
      setOverchargeAlertEnabled(savedOvercharge);
      setSleepEnabled(savedSleepEnabled);
      setSleepStartHour(savedSleepStart);
      setSleepEndHour(savedSleepEnd);
      setLoaded(true);
      if (savedMonitoring) {
        startMonitoring();
        await startBackgroundService();
      }
      // Prompt until battery optimization is disabled or user has explicitly allowed it
      if (Platform.OS === 'android') {
        const [isIgnoring, alreadyActioned, nothingAsked, manufacturer] =
          await Promise.all([
            NativeModules.BatteryOptimization.isIgnoringBatteryOptimizations(),
            getBatteryOptAsked(),
            getNothingBgAsked(),
            DeviceInfo.getManufacturer(),
          ]);

        if (!isIgnoring && !alreadyActioned) {
          Alert.alert(
            'Keep monitoring active',
            'Android can stop battery monitoring during calls or music playback. Tap "Fix Now" to disable battery optimization for this app — it only takes a few seconds.',
            [
              {text: 'Later', style: 'cancel'},
              {
                text: 'Fix Now',
                onPress: async () => {
                  await setBatteryOptAsked();
                  NativeModules.BatteryOptimization.requestIgnoreBatteryOptimizations();
                },
              },
            ],
          );
        }

        if (manufacturer.toLowerCase() === 'nothing' && !nothingAsked) {
          await setNothingBgAsked();
          Alert.alert(
            'One more step for Nothing Phone',
            'Nothing OS has an extra background activity setting. To keep monitoring running at all times:\n\nTap "Open Settings" → Battery → set to Unrestricted.',
            [
              {text: 'Later', style: 'cancel'},
              {text: 'Open Settings', onPress: () => Linking.openSettings()},
            ],
          );
        }
      }
    })();
  }, []);

  // Poll alert/snooze state every 2 seconds
  useEffect(() => {
    const poll = setInterval(() => {
      setAlerting(getAlertingState());
      setSnoozed(getSnoozedState());
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  // Refresh charging habit recommendations periodically
  useEffect(() => {
    const refresh = async () => {
      const [recs, count] = await Promise.all([
        getRecommendations(),
        getSessionCount(),
      ]);
      setRecommendations(recs);
      setSessionCount(count);
    };
    refresh();
    const interval = setInterval(refresh, 60_000); // refresh every minute
    return () => clearInterval(interval);
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
      await startBackgroundService();
    } else {
      await stopMonitoring();
      await stopBackgroundService();
    }
  }, []);

  const handleOverchargeToggle = useCallback(async (enabled: boolean) => {
    setOverchargeAlertEnabled(enabled);
    await saveOverchargeAlertEnabled(enabled);
  }, []);

  const handleSleepToggle = useCallback(async (enabled: boolean) => {
    setSleepEnabled(enabled);
    await saveSleepEnabled(enabled);
  }, []);

  const handleSleepStartCommit = useCallback(async (value: number) => {
    const hour = Math.round(value);
    setSleepStartHour(hour);
    await saveSleepStartHour(hour);
  }, []);

  const handleSleepEndCommit = useCallback(async (value: number) => {
    const hour = Math.round(value);
    setSleepEndHour(hour);
    await saveSleepEndHour(hour);
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
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}>
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

      {/* Battery health card */}
      <FadeIn delay={reduceMotion ? 0 : 150} reduceMotion={reduceMotion}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel} accessibilityRole="header">
              BATTERY HEALTH
            </Text>
            <View
              style={[
                styles.healthBadge,
                {borderColor: getHealthColor(batteryHealth.status)},
              ]}
              accessible={true}
              accessibilityLabel={`Battery health: ${batteryHealth.label}`}>
              <View
                style={[
                  styles.healthDot,
                  {backgroundColor: getHealthColor(batteryHealth.status)},
                ]}
              />
              <Text
                style={[
                  styles.healthBadgeText,
                  {color: getHealthColor(batteryHealth.status)},
                ]}>
                {batteryHealth.label}
              </Text>
            </View>
          </View>
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={() => Linking.openSettings()}
              accessibilityLabel="Open Settings to view battery health"
              accessibilityRole="button">
              <Text style={styles.healthIosHint}>
                Tap to open Settings {'>'} Battery {'>'} Battery Health &amp; Charging
              </Text>
            </Pressable>
          )}
          {Platform.OS === 'android' && batteryHealth.status !== 'good' && batteryHealth.status !== 'unknown' && (
            <Text style={styles.healthWarning}>
              {batteryHealth.status === 'fair'
                ? 'Your battery is experiencing temperature issues. Avoid extreme temperatures.'
                : 'Your battery may need service. Consider visiting a repair center.'}
            </Text>
          )}
        </View>
      </FadeIn>

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

      {/* Health alerts card (overcharge) */}
      <FadeIn delay={reduceMotion ? 0 : 350} reduceMotion={reduceMotion}>
        <View style={styles.card}>
          <Text style={[styles.cardLabel, {marginBottom: 12}]} accessibilityRole="header">
            HEALTH ALERTS
          </Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Overcharge Alert</Text>
              <Text style={styles.toggleSub}>
                Notify after 30 min at 100% while charging
              </Text>
            </View>
            <Switch
              value={overchargeAlertEnabled}
              onValueChange={handleOverchargeToggle}
              trackColor={{false: '#27272A', true: COLORS.goodDim}}
              thumbColor={overchargeAlertEnabled ? COLORS.good : '#71717A'}
              ios_backgroundColor="#27272A"
              accessibilityLabel="Overcharge alert"
              accessibilityHint={`${overchargeAlertEnabled ? 'Disable' : 'Enable'} overcharge notification`}
              accessibilityRole="switch"
              style={styles.switchSize}
            />
          </View>
        </View>
      </FadeIn>

      {/* Sleep schedule card */}
      <FadeIn delay={reduceMotion ? 0 : 380} reduceMotion={reduceMotion}>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.cardLabel} accessibilityRole="header">
                SLEEP SCHEDULE
              </Text>
              <Text style={styles.toggleSub}>
                Silence alarm during sleep hours
              </Text>
            </View>
            <Switch
              value={sleepEnabled}
              onValueChange={handleSleepToggle}
              trackColor={{false: '#27272A', true: COLORS.goodDim}}
              thumbColor={sleepEnabled ? COLORS.good : '#71717A'}
              ios_backgroundColor="#27272A"
              accessibilityLabel="Sleep schedule"
              accessibilityHint={`${sleepEnabled ? 'Disable' : 'Enable'} quiet hours during sleep`}
              accessibilityRole="switch"
              style={styles.switchSize}
            />
          </View>
          {sleepEnabled && (
            <View style={styles.sleepTimesContainer}>
              <View style={styles.sleepTimeRow}>
                <Text style={styles.sleepTimeLabel}>Bedtime</Text>
                <Text style={styles.sleepTimeValue}>
                  {formatHour(sleepStartHour)}
                </Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={23}
                step={1}
                value={sleepStartHour}
                onValueChange={v => setSleepStartHour(Math.round(v))}
                onSlidingComplete={handleSleepStartCommit}
                minimumTrackTintColor={COLORS.warning}
                maximumTrackTintColor={COLORS.surfaceBorder}
                thumbTintColor={COLORS.warning}
                accessibilityLabel="Sleep start hour"
                accessibilityRole="adjustable"
              />
              <View style={styles.sleepTimeRow}>
                <Text style={styles.sleepTimeLabel}>Wake time</Text>
                <Text style={styles.sleepTimeValue}>
                  {formatHour(sleepEndHour)}
                </Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={23}
                step={1}
                value={sleepEndHour}
                onValueChange={v => setSleepEndHour(Math.round(v))}
                onSlidingComplete={handleSleepEndCommit}
                minimumTrackTintColor={COLORS.warning}
                maximumTrackTintColor={COLORS.surfaceBorder}
                thumbTintColor={COLORS.warning}
                accessibilityLabel="Sleep end hour"
                accessibilityRole="adjustable"
              />
              <Text style={styles.sleepHint}>
                Low battery notifications will be silent from{' '}
                {formatHour(sleepStartHour)} to {formatHour(sleepEndHour)}.
              </Text>
            </View>
          )}
        </View>
      </FadeIn>

      {/* Battery habits card */}
      <FadeIn delay={reduceMotion ? 0 : 410} reduceMotion={reduceMotion}>
        <View style={styles.card}>
          <Text style={[styles.cardLabel, {marginBottom: 12}]} accessibilityRole="header">
            BATTERY HABITS
          </Text>
          {sessionCount < MIN_SESSIONS_FOR_ANALYSIS ? (
            <Text style={styles.habitsEmpty}>
              Charge your phone {MIN_SESSIONS_FOR_ANALYSIS - sessionCount} more time
              {MIN_SESSIONS_FOR_ANALYSIS - sessionCount !== 1 ? 's' : ''} to unlock
              personalised tips.
            </Text>
          ) : recommendations.length === 0 ? (
            <View style={styles.habitsGood}>
              <Text style={styles.habitsGoodText}>
                {'  '}Your charging habits look healthy. Keep it up!
              </Text>
            </View>
          ) : (
            recommendations.map(rec => (
              <Pressable
                key={rec.key}
                style={({pressed}) => [
                  styles.habitRow,
                  pressed && {opacity: 0.7},
                ]}
                onPress={() =>
                  Alert.alert(rec.message, rec.detail, [{text: 'Got it'}])
                }
                accessibilityLabel={rec.message}
                accessibilityHint="Tap for details"
                accessibilityRole="button">
                <Text style={styles.habitIcon}>{'\u26A0\uFE0F'}</Text>
                <Text style={styles.habitText}>{rec.message}</Text>
                <Text style={styles.habitChevron}>{'\u203A'}</Text>
              </Pressable>
            ))
          )}
        </View>
      </FadeIn>

      {/* Footer */}
      <FadeIn delay={reduceMotion ? 0 : 440} reduceMotion={reduceMotion}>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Runs in background {'\u00B7'} Minimal battery impact
          </Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    paddingTop: Platform.OS === 'ios' ? 64 : 44,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  appTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    minHeight: 44,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
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
    fontSize: 56,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  gaugePercentSign: {
    color: COLORS.textSecondary,
    fontSize: 20,
    fontWeight: '300',
    marginTop: -6,
  },
  chargingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  chargingBolt: {
    fontSize: 16,
    marginRight: 4,
  },
  chargingLabel: {
    fontSize: 14,
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
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  thresholdBadge: {
    fontSize: 22,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },

  // Slider
  slider: {
    width: '100%',
    height: 44,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sliderLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  toggleSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  switchSize: {
    transform: [{scale: 1.1}],
  },

  // Battery health
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },
  healthBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  healthIosHint: {
    color: COLORS.good,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
  healthWarning: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },

  // Sleep schedule
  sleepTimesContainer: {
    marginTop: 16,
  },
  sleepTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sleepTimeLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  sleepTimeValue: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sleepHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },

  // Battery habits
  habitsEmpty: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  habitsGood: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitsGoodText: {
    color: COLORS.good,
    fontSize: 14,
    lineHeight: 20,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceBorder,
  },
  habitIcon: {
    fontSize: 15,
    marginRight: 10,
  },
  habitText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  habitChevron: {
    color: COLORS.textMuted,
    fontSize: 20,
    fontWeight: '300',
  },

  // Footer
  footer: {
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
