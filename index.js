/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee from '@notifee/react-native';

// Register background notification handler
notifee.onBackgroundEvent(async () => {
  // No-op — alerts are managed by BatteryMonitor
});

AppRegistry.registerComponent(appName, () => App);
