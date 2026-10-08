package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import androidx.core.app.NotificationCompat
import java.util.Calendar

// Alerts once per charging session when the battery reaches 100% while plugged in.
// Outside quiet hours it plays the alarm (NativeAlarmService, KIND_FULL); during quiet
// hours it posts a silent notification instead so nobody is woken up.
object FullChargeNotifier {
    private const val QUIET_CHANNEL_ID = "battery-full-charge-quiet"
    // Channel used by 1.5.0 for the sounding notification; replaced by the alarm.
    private const val LEGACY_CHANNEL_ID = "battery-full-charge"
    private const val NOTIF_ID = 9003

    /** Returns true while the full-charge alarm owns NativeAlarmService. */
    fun update(context: Context, prefs: SharedPreferences, pct: Int, plugged: Boolean): Boolean {
        if (!plugged) {
            reset(context, prefs)
            return false
        }
        if (prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)) {
            // Re-send in case a POWER_CONNECTED stop raced with the start.
            NativeAlarmService.start(context, NativeAlarmService.KIND_FULL)
            return true
        }
        val enabled = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, false)
        val notified = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false)
        if (!enabled || pct < 100 || notified) return false

        val editor = prefs.edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, true)
        if (inQuietHours(prefs)) {
            editor.apply()
            showQuietNotification(context)
            return false
        }
        editor.putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, true).apply()
        NativeAlarmService.start(context, NativeAlarmService.KIND_FULL)
        return true
    }

    /** Stops any full-charge alert and re-arms it for the next charging session. */
    fun cancel(context: Context) {
        reset(context, context.getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE))
    }

    private fun reset(context: Context, prefs: SharedPreferences) {
        val notified = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false)
        val alarmActive = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)
        if (!notified && !alarmActive) return
        if (alarmActive) NativeAlarmService.stop(context)
        context.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
        prefs.edit()
            .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false)
            .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)
            .apply()
    }

    private fun inQuietHours(prefs: SharedPreferences): Boolean {
        val start = prefs.getInt(NativeBatteryMonitorService.KEY_QUIET_START, NativeBatteryMonitorService.DEFAULT_QUIET_START)
        val end = prefs.getInt(NativeBatteryMonitorService.KEY_QUIET_END, NativeBatteryMonitorService.DEFAULT_QUIET_END)
        if (start == end) return false
        val cal = Calendar.getInstance()
        val now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return if (start < end) now in start until end else now >= start || now < end
    }

    private fun showQuietNotification(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel(LEGACY_CHANNEL_ID)
        if (nm.getNotificationChannel(QUIET_CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(QUIET_CHANNEL_ID, "Full Charge (quiet hours)", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Silent full-charge notice shown during quiet hours"
                }
            )
        }
        val notification = NotificationCompat.Builder(context, QUIET_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_battery_monitor)
            .setContentTitle("Battery Fully Charged")
            .setContentText("Battery is at 100%. You can unplug your charger.")
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(openAppPendingIntent(context))
            .build()
        nm.notify(NOTIF_ID, notification)
    }
}
