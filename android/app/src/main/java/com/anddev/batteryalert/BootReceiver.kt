package com.anddev.batteryalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Restarts monitoring after a reboot and after the app is updated (an update kills the process).
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val prefs = context.getSharedPreferences(
                NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE
            )
            if (prefs.getBoolean(NativeBatteryMonitorService.KEY_MONITORING_ENABLED, true)) {
                NativeBatteryMonitorService.start(context)
            }
        }
    }
}
