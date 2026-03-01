import Sound from 'react-native-sound';
import {Platform} from 'react-native';

// Enable playback in background/silent mode
Sound.setCategory('Alarm', true);

let alarmSound: Sound | null = null;
let isPlaying = false;

export function startAlarm(): void {
  if (isPlaying) {
    return;
  }

  // Load the alarm sound from the app bundle
  const soundFile = Platform.OS === 'android' ? 'alarm.wav' : 'alarm.wav';

  alarmSound = new Sound(soundFile, Sound.MAIN_BUNDLE, error => {
    if (error || !alarmSound) {
      console.warn('Failed to load alarm sound:', error);
      return;
    }

    // Set to loop indefinitely
    alarmSound.setNumberOfLoops(-1);
    alarmSound.setVolume(1.0);

    alarmSound.play(success => {
      if (!success) {
        console.warn('Alarm playback failed');
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
}

export function isAlarmPlaying(): boolean {
  return isPlaying;
}
