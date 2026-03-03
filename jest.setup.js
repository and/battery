jest.mock('react-native-device-info', () => ({
  getBatteryLevel: jest.fn().mockResolvedValue(0.5),
  isBatteryCharging: jest.fn().mockResolvedValue(false),
  addBatteryLevelListener: jest.fn(() => ({remove: jest.fn()})),
  addPowerStateListener: jest.fn(() => ({remove: jest.fn()})),
}));

jest.mock('react-native-background-actions', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  isRunning: jest.fn().mockReturnValue(false),
}));

jest.mock('react-native-sound', () => {
  const Sound = jest.fn().mockImplementation((file, bundle, cb) => {
    if (cb) cb(null);
  });
  Sound.setCategory = jest.fn();
  Sound.prototype.setNumberOfLoops = jest.fn();
  Sound.prototype.setVolume = jest.fn();
  Sound.prototype.play = jest.fn((cb) => cb && cb(true));
  Sound.prototype.stop = jest.fn();
  Sound.prototype.release = jest.fn();
  Sound.MAIN_BUNDLE = '';
  return Sound;
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    displayNotification: jest.fn().mockResolvedValue(undefined),
    cancelNotification: jest.fn().mockResolvedValue(undefined),
    createChannel: jest.fn().mockResolvedValue('channel-id'),
    requestPermission: jest.fn().mockResolvedValue({authorizationStatus: 1}),
    onForegroundEvent: jest.fn(() => jest.fn()),
    onBackgroundEvent: jest.fn(() => jest.fn()),
  },
  AndroidImportance: {HIGH: 4},
  AndroidVisibility: {PUBLIC: 1},
  AuthorizationStatus: {AUTHORIZED: 1, PROVISIONAL: 3},
  EventType: {DISMISSED: 1},
}));

jest.mock('@react-native-community/slider', () => 'Slider');
