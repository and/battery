import React, {useEffect} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import {setupNotificationListeners} from './src/services/NotificationService';

function App(): React.JSX.Element {
  useEffect(() => {
    setupNotificationListeners();
  }, []);

  return (
    <SafeAreaProvider>
      <HomeScreen />
    </SafeAreaProvider>
  );
}

export default App;
