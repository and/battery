/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee from '@notifee/react-native';
import {headlessTask} from './src/services/BatteryMonitor';

// Register background notification handler
notifee.onBackgroundEvent(async () => {
  // No-op — alerts are managed by BatteryMonitor
});

// Register headless task for auto-start on boot (via BootReceiver)
AppRegistry.registerHeadlessTask('BatteryMonitor', () => headlessTask);

AppRegistry.registerComponent(appName, () => App);
