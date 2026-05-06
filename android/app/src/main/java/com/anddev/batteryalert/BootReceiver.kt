package com.anddev.batteryalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences(
                NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE
            )
            if (prefs.getBoolean(NativeBatteryMonitorService.KEY_MONITORING_ENABLED, true)) {
                NativeBatteryMonitorService.start(context)
            }
        }
    }
}
