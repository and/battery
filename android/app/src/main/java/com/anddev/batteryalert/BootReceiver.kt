package com.anddev.batteryalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import com.asterinet.react.bgactions.RNBackgroundActionsTask

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val iconInt = context.resources.getIdentifier(
                "ic_stat_battery_monitor", "drawable", context.packageName
            )
            val serviceIntent = Intent(context, RNBackgroundActionsTask::class.java).apply {
                putExtra("taskName", "BatteryMonitor")
                putExtra("taskTitle", "Battery Alert")
                putExtra("taskDesc", "Monitoring battery...")
                putExtra("iconInt", if (iconInt != 0) iconInt else android.R.drawable.ic_lock_idle_low_battery)
                putExtra("color", Color.WHITE)
            }
            context.startForegroundService(serviceIntent)
        }
    }
}
