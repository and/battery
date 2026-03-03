import Sound from 'react-native-sound';

// Enable playback in background/silent mode
Sound.setCategory('Alarm', true);

let alarmSound: Sound | null = null;
let isPlaying = false;
let isLoading = false;

export function startAlarm(): void {
  if (isPlaying || isLoading) {
    return;
  }

  isLoading = true;

  // Load the alarm sound from the app bundle
  const soundFile = 'alarm.wav';

  alarmSound = new Sound(soundFile, Sound.MAIN_BUNDLE, error => {
    isLoading = false;

    if (error || !alarmSound) {
      if (__DEV__) {
        console.warn('Failed to load alarm sound:', error);
      }
      return;
    }

    // Set to loop indefinitely
    alarmSound.setNumberOfLoops(-1);
    alarmSound.setVolume(1.0);

    alarmSound.play(success => {
      if (!success) {
        if (__DEV__) {
          console.warn('Alarm playback failed');
        }
        // Reset state so alarm can be retried
        isPlaying = false;
      }
    });

    isPlaying = true;
  });
}

export function stopAlarm(): void {
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
