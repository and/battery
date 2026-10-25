package com.anddev.batteryalert

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar

object QuietHoursScheduler {
    private const val REQUEST_QUIET_START = 7101
    private const val REQUEST_QUIET_END = 7102

    fun reschedule(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java)
        am.cancel(pendingIntent(context, REQUEST_QUIET_START))
        am.cancel(pendingIntent(context, REQUEST_QUIET_END))

        val prefs = context.getSharedPreferences(
            NativeBatteryMonitorService.PREFS_NAME,
            Context.MODE_PRIVATE,
        )
        val start = prefs.getInt(
            NativeBatteryMonitorService.KEY_QUIET_START,
            NativeBatteryMonitorService.DEFAULT_QUIET_START,
        )
        val end = prefs.getInt(
            NativeBatteryMonitorService.KEY_QUIET_END,
            NativeBatteryMonitorService.DEFAULT_QUIET_END,
        )
        if (start == end) {
            return
        }

        val now = Calendar.getInstance()
        scheduleExact(am, context, nextOccurrence(now, start), REQUEST_QUIET_START)
        scheduleExact(am, context, nextOccurrence(now, end), REQUEST_QUIET_END)
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java)
        am.cancel(pendingIntent(context, REQUEST_QUIET_START))
        am.cancel(pendingIntent(context, REQUEST_QUIET_END))
    }

    private fun nextOccurrence(from: Calendar, minutesAfterMidnight: Int): Long {
        val target = (from.clone() as Calendar).apply {
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            set(Calendar.HOUR_OF_DAY, minutesAfterMidnight / 60)
            set(Calendar.MINUTE, minutesAfterMidnight % 60)
        }
        if (target.timeInMillis <= from.timeInMillis) {
            target.add(Calendar.DAY_OF_YEAR, 1)
        }
        return target.timeInMillis
    }

    private fun scheduleExact(
        am: AlarmManager,
        context: Context,
        triggerAtMillis: Long,
        requestCode: Int,
    ) {
        val pi = pendingIntent(context, requestCode)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
    }

    private fun pendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, QuietHoursAlarmReceiver::class.java)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
