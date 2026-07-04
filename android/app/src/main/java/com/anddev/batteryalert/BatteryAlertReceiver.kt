package com.anddev.batteryalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Safety net: stops the alarm when the charger is connected or battery recovers,
// in case NativeBatteryMonitorService missed the event.
class BatteryAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BATTERY_OKAY,
            Intent.ACTION_POWER_CONNECTED -> NativeAlarmService.stop(context)
        }
    }
}
