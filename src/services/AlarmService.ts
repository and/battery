import Sound from 'react-native-sound';

// Enable playback in background/silent mode
Sound.setCategory('Alarm', true);

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
  shouldAlarm = true;

  if (isPlaying || isLoading) {
    return;
  }

  clearRetryTimer();
  isLoading = true;

  alarmSound = new Sound('alarm.wav', Sound.MAIN_BUNDLE, error => {
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

    alarmSound.play(success => {
      if (!success) {
        if (__DEV__) {
          console.warn('Alarm playback failed');
        }
        isPlaying = false;
        // Retry — audio focus was lost (e.g. incoming call)
        if (shouldAlarm) {
          retryTimer = setTimeout(startAlarm, RETRY_DELAY_MS);
        }
      }
    });

    isPlaying = true;
  });
}

export function stopAlarm(): void {
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
