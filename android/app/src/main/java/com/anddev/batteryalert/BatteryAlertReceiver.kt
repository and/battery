package com.anddev.batteryalert

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Fires at Android's system BATTERY_LOW threshold (~15%) — intentionally a last-resort
// fallback for when the JS service (which enforces the user's configurable threshold) has
// been killed by the OS. Does not start if the JS service is already running, to avoid
// overlapping audio.
class BatteryAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BATTERY_LOW -> {
                if (!isJsServiceRunning(context)) {
                    NativeAlarmService.start(context)
                }
            }
            Intent.ACTION_BATTERY_OKAY,
            Intent.ACTION_POWER_CONNECTED -> NativeAlarmService.stop(context)
        }
    }

    @Suppress("DEPRECATION")
    private fun isJsServiceRunning(context: Context): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return am.getRunningServices(Int.MAX_VALUE).any {
            it.service.className == "com.asterinet.react.bgactions.RNBackgroundActionsTask"
        }
    }
}
