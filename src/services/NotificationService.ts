import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import {Platform, PermissionsAndroid} from 'react-native';
import {
  NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_ID,
  STATUS_ICON_CHANNEL_ID,
  STATUS_ICON_NOTIFICATION_ID,
} from '../utils/constants';

let channelCreated = false;
let statusIconChannelCreated = false;

async function ensureChannel(): Promise<void> {
  if (channelCreated) {
    return;
  }
  await notifee.createChannel({
    id: NOTIFICATION_CHANNEL_ID,
    name: 'Battery Alert',
    description: 'Low battery warnings',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
  });
  channelCreated = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }
  }

  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

export async function showLowBatteryAlert(level: number): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: 'Low Battery Warning',
    body: `Battery is at ${level}%. Please plug in your charger.`,
    android: {
      channelId: NOTIFICATION_CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [300, 500, 300, 500],
      ongoing: true,
      autoCancel: false,
      pressAction: {id: 'default'},
    },
    ios: {
      sound: 'default',
      critical: true,
      interruptionLevel: 'critical',
    },
  });
}

export async function dismissLowBatteryAlert(): Promise<void> {
  await notifee.cancelNotification(NOTIFICATION_ID);
}

async function ensureStatusIconChannel(): Promise<void> {
  if (statusIconChannelCreated) {
    return;
  }
  await notifee.createChannel({
    id: STATUS_ICON_CHANNEL_ID,
    name: 'Monitoring Status',
    description: 'Shows when battery monitoring is active',
    importance: AndroidImportance.LOW,
    vibration: false,
  });
  statusIconChannelCreated = true;
}

export async function showMonitoringStatusIcon(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await ensureStatusIconChannel();
  await notifee.displayNotification({
    id: STATUS_ICON_NOTIFICATION_ID,
    title: 'Battery monitoring active',
    android: {
      channelId: STATUS_ICON_CHANNEL_ID,
      smallIcon: 'ic_stat_battery_monitor',
      ongoing: true,
      autoCancel: false,
      pressAction: {id: 'default'},
      importance: AndroidImportance.LOW,
      showTimestamp: false,
    },
  });
}

export async function hideMonitoringStatusIcon(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await notifee.cancelNotification(STATUS_ICON_NOTIFICATION_ID);
}

export function setupNotificationListeners(): void {
  notifee.onForegroundEvent(({type}) => {
    if (type === EventType.DISMISSED) {
      // No-op — alert will only clear when charger is connected
    }
  });

  notifee.onBackgroundEvent(async ({type}) => {
    if (type === EventType.DISMISSED) {
      // No-op
    }
  });
}
