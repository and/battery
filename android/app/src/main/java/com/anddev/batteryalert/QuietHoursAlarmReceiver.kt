package com.anddev.batteryalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fires at quiet-hour boundaries so alarm policy updates without a battery change. */
class QuietHoursAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        NativeBatteryMonitorService.recheck(context)
        QuietHoursScheduler.reschedule(context)
    }
}
