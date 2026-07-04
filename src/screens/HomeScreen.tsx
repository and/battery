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
  Linking,
  Alert,
  NativeModules,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useBatteryStatus} from '../hooks/useBatteryStatus';
import {
  getThreshold,
  setThreshold as saveThreshold,
  getMonitoringEnabled,
  setMonitoringEnabled as saveMonitoringEnabled,
  getBatteryOptAsked,
  setBatteryOptAsked,
  getNothingBgAsked,
  setNothingBgAsked,
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
import {requestNotificationPermission} from '../services/NotificationService';
import {
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  DEFAULT_THRESHOLD,
} from '../utils/constants';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const GAUGE_SIZE = Math.min(SCREEN_WIDTH * 0.52, 220);

// --- WCAG AA compliant color palettes ---

const DARK_COLORS = {
  bg: '#09090B',
  surface: '#131316',
  surfaceBorder: '#2A2A32',
  surfaceHighlight: 'rgba(255,255,255,0.08)', // specular top-edge
  critical: '#F87171',             // 5.2:1 on dark bg
  criticalDim: '#7F1D1D',
  criticalGlow: '#EF444440',
  warning: '#FBBF24',             // 9.8:1 on dark bg
  warningDim: '#78350F',
  warningGlow: '#FBBF2425',
  good: '#34D399',                // 7.4:1 on dark bg
  goodDim: '#064E3B',
  goodGlow: '#10B98130',
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  gaugeInactive: '#2A2A32',
  switchTrackOff: '#27272A',
  switchThumbOff: '#71717A',
  shadowColor: '#000000',
  shadowOpacity: 0.45,
};

const LIGHT_COLORS = {
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceBorder: '#D4D4D8',
  surfaceHighlight: 'rgba(255,255,255,0.90)', // strong specular on light
  critical: '#DC2626',             // 5.9:1 on light bg
  criticalDim: '#FEE2E2',
  criticalGlow: '#DC262640',
  warning: '#B45309',             // 4.9:1 on light bg
  warningDim: '#FEF3C7',
  warningGlow: '#B4530925',
  good: '#059669',                // 4.6:1 on light bg
  goodDim: '#D1FAE5',
  goodGlow: '#05966930',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#71717A',
  gaugeInactive: '#D4D4D8',
  switchTrackOff: '#D4D4D8',
  switchThumbOff: '#A1A1AA',
  shadowColor: '#000000',
  shadowOpacity: 0.07,
};

type ThemeColors = typeof DARK_COLORS;

function getBatteryColor(level: number, threshold: number, colors: ThemeColors) {
  if (level <= threshold) {
    return {main: colors.critical, dim: colors.criticalDim, glow: colors.criticalGlow};
  }
  if (level <= 35) {
    return {main: colors.warning, dim: colors.warningDim, glow: colors.warningGlow};
  }
  return {main: colors.good, dim: colors.goodDim, glow: colors.goodGlow};
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
  inactiveColor,
  size,
}: {
  level: number;
  color: string;
  inactiveColor: string;
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
                backgroundColor: isActive ? color : inactiveColor,
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

function createStyles(colors: ThemeColors) {
  const shadowBase = {
    shadowColor: colors.shadowColor,
    shadowOpacity: colors.shadowOpacity,
  };
  const shadowSm = {...shadowBase, shadowOffset: {width: 0, height: 1}, shadowRadius: 4, elevation: 2};
  const shadowMd = {...shadowBase, shadowOffset: {width: 0, height: 2}, shadowRadius: 8, elevation: 3};
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingTop: Platform.OS === 'ios' ? 64 : 44,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 28,
      paddingHorizontal: 4,
      minHeight: 44,
    },
    appTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 3,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderTopColor: colors.surfaceHighlight,
      minHeight: 44,
      ...shadowSm,
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
      color: colors.textSecondary,
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
    snoozeButton: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.critical,
      borderTopColor: colors.surfaceHighlight,
      paddingVertical: 14,
      marginBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      ...shadowMd,
    },
    snoozeButtonPressed: {
      opacity: 0.7,
    },
    snoozeButtonText: {
      color: colors.critical,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    snoozedLabel: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderTopColor: colors.surfaceHighlight,
      paddingVertical: 14,
      marginBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      ...shadowMd,
    },
    snoozedText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderTopColor: colors.surfaceHighlight,
      padding: 20,
      marginBottom: 12,
      ...shadowMd,
      shadowRadius: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    cardLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1.5,
    },
    thresholdBadge: {
      fontSize: 22,
      fontWeight: '300',
      fontVariant: ['tabular-nums'],
    },
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
      color: colors.textMuted,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
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
    toggleSub: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 6,
      lineHeight: 20,
    },
    switchSize: {
      transform: [{scale: 1.1}],
    },
    footer: {
      marginTop: 'auto',
      marginBottom: 36,
      alignItems: 'center',
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 13,
      letterSpacing: 0.3,
    },
  });
}

export default function HomeScreen(): React.JSX.Element {
  const {level, isCharging} = useBatteryStatus();
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [monitoring, setMonitoring] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const reduceMotion = useReduceMotion();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        await startBackgroundService();
      }
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
      await startBackgroundService();
    } else {
      await stopMonitoring();
      await stopBackgroundService();
    }
  }, []);

  const batteryColors = useMemo(
    () => getBatteryColor(level, threshold, colors),
    [level, threshold, colors],
  );
  const isCritical = level <= threshold;
  const batteryDescription = useMemo(
    () => getBatteryStateDescription(level, threshold, isCharging),
    [level, threshold, isCharging],
  );

  if (!loaded) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.bg}
        />
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="summary">
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />

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
                {backgroundColor: monitoring ? colors.good : colors.textMuted},
              ]}
            />
            <Text
              style={[
                styles.statusText,
                {color: monitoring ? colors.good : colors.textSecondary},
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
          {/* Ambient glow disc — softens the gauge center */}
          <View
            pointerEvents="none"
            importantForAccessibility="no"
            style={{
              position: 'absolute',
              width: GAUGE_SIZE * 0.68,
              height: GAUGE_SIZE * 0.68,
              borderRadius: GAUGE_SIZE * 0.34,
              backgroundColor: batteryColors.glow,
            }}
          />
          <PulsingRing
            color={batteryColors.main}
            active={isCritical && !isCharging}
            size={GAUGE_SIZE}
            reduceMotion={reduceMotion}
          />
          <GaugeRing
            level={level}
            color={batteryColors.main}
            inactiveColor={colors.gaugeInactive}
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
                  {'⚡'}
                </Text>
              )}
              <Text
                style={[
                  styles.chargingLabel,
                  {color: isCharging ? colors.good : colors.textSecondary},
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
              style={[styles.thresholdBadge, {color: colors.critical}]}
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
            minimumTrackTintColor={colors.critical}
            maximumTrackTintColor={colors.surfaceBorder}
            thumbTintColor={colors.critical}
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
              trackColor={{false: colors.switchTrackOff, true: colors.goodDim}}
              thumbColor={monitoring ? colors.good : colors.switchThumbOff}
              ios_backgroundColor={colors.switchTrackOff}
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
            Runs in background {'·'} Minimal battery impact
          </Text>
        </View>
      </FadeIn>
    </View>
  );
}
