package com.anddev.batteryalert

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(BatteryOptimizationPackage())
          add(NativeSettingsPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    upgradeMonitoringChannelImportance()
    loadReactNative(this)
  }

  // The react-native-background-actions library hardcodes IMPORTANCE_DEFAULT for its
  // channel, which hides the status bar icon on Nothing OS and similar OEMs. We delete
  // and recreate the channel with IMPORTANCE_HIGH before the library runs so it finds an
  // existing channel and skips its own creation.
  private fun upgradeMonitoringChannelImportance() {
    val nm = getSystemService(NotificationManager::class.java)
    val channelId = "RN_BACKGROUND_ACTIONS_CHANNEL"
    val existing = nm.getNotificationChannel(channelId)
    if (existing == null || existing.importance < NotificationManager.IMPORTANCE_HIGH) {
      nm.deleteNotificationChannel(channelId)
      nm.createNotificationChannel(
        NotificationChannel(channelId, "Battery Monitoring", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Shows while battery monitoring is active"
          setShowBadge(false)
          enableVibration(false)
          setSound(null, null)
        }
      )
    }
  }
}
