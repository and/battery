import Sound from 'react-native-sound';
import {NativeModules, Platform} from 'react-native';

// Enable playback in background/silent mode (iOS only — Android uses NativeAlarmService)
if (Platform.OS !== 'android') {
  Sound.setCategory('Alarm', true);
}

let alarmSound: Sound | null = null;
let isPlaying = false;
let isLoading = false;
let shouldAlarm = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const RETRY_DELAY_MS = 3000;

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function startAlarm(): void {
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.startAlarm();
    return;
  }

  shouldAlarm = true;

  if (isPlaying || isLoading) {
    return;
  }

  clearRetryTimer();
  isLoading = true;

  alarmSound = new Sound('alarm', Sound.MAIN_BUNDLE, error => {
    isLoading = false;

    if (error || !alarmSound) {
      if (__DEV__) {
        console.warn('Failed to load alarm sound:', error);
      }
      // Retry — e.g. audio focus unavailable during a phone call
      if (shouldAlarm) {
        retryTimer = setTimeout(startAlarm, RETRY_DELAY_MS);
      }
      return;
    }

    alarmSound.setNumberOfLoops(-1);
    alarmSound.setVolume(1.0);

    alarmSound.play(() => {
      // Fires on completion OR error. Either way, restart if still alarming.
      // (setNumberOfLoops races with play() on New Arch Turbo modules, so
      // looping may not activate — we restart manually as a reliable fallback.)
      isPlaying = false;
      if (shouldAlarm) {
        retryTimer = setTimeout(startAlarm, RETRY_DELAY_MS);
      }
    });

    isPlaying = true;
  });
}

export function stopAlarm(): void {
  if (Platform.OS === 'android') {
    NativeModules.NativeSettings?.stopAlarm();
    return;
  }

  shouldAlarm = false;
  clearRetryTimer();
  if (alarmSound) {
    alarmSound.stop();
    alarmSound.release();
    alarmSound = null;
  }
  isPlaying = false;
  isLoading = false;
}

export function isAlarmPlaying(): boolean {
  return isPlaying;
}
