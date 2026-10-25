package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.os.BatteryManager
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import java.util.Date
// Alerts once per charging session when the battery reaches 100% while plugged in.
// Alarm outside quiet hours; low-importance notification only during quiet hours.
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
            if (shouldPlayFullChargeAlarm(prefs)) {
                NativeAlarmService.start(context, NativeAlarmService.KIND_FULL)
                return true
            }
            prefs.edit()
                .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)
                .apply()
            NativeAlarmService.stop(context)
        }
        val enabled = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, false)
        val notified = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false)
        if (!enabled || pct < 100 || notified) return false

        markReached100(prefs)
        if (shouldPlayFullChargeAlarm(prefs)) {
            prefs.edit()
                .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, true)
                .apply()
            NativeAlarmService.start(context, NativeAlarmService.KIND_FULL)
            return true
        }
        showFullChargeNotification(context)
        return false
    }

    private fun shouldPlayFullChargeAlarm(prefs: SharedPreferences): Boolean {
        return prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, false) &&
            !QuietHours.isInQuietHours(prefs)
    }

    /** Stops any full-charge alert and re-arms it for the next charging session. */
    fun cancel(context: Context) {
        reset(context, context.getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE))
    }

    /**
     * When the user turns on full-charge alarm in settings while already at 100% plugged in,
     * start the alarm immediately (same idea as enabling low-battery monitoring while below threshold).
     */
    fun applyUserEnabledAlarm(context: Context) {
        val prefs = context.getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, false)) return
        if (!shouldPlayFullChargeAlarm(prefs)) return
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        if (level < 0) return
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val pct = if (scale > 0) (level * 100) / scale else return
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        if (pct < 100 || !plugged || !charging) return
        markReached100(prefs)
        prefs.edit()
            .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, true)
            .apply()
        NativeAlarmService.start(context, NativeAlarmService.KIND_FULL)
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
            .remove(NativeBatteryMonitorService.KEY_FULL_CHARGE_REACHED_AT_MS)
            .apply()
    }

    fun markReached100(prefs: SharedPreferences) {
        prefs.edit()
            .putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, true)
            .putLong(
                NativeBatteryMonitorService.KEY_FULL_CHARGE_REACHED_AT_MS,
                System.currentTimeMillis(),
            )
            .apply()
    }

    fun fullChargeNotificationBody(context: Context, prefs: SharedPreferences): String {
        val reachedAt = prefs.getLong(NativeBatteryMonitorService.KEY_FULL_CHARGE_REACHED_AT_MS, 0L)
        if (reachedAt <= 0L) {
            return "Battery is at 100%. You can unplug your charger."
        }
        val time = DateFormat.getTimeFormat(context).format(Date(reachedAt))
        return "Reached 100% at $time. You can unplug your charger."
    }

    private fun showFullChargeNotification(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel(LEGACY_CHANNEL_ID)
        if (nm.getNotificationChannel(QUIET_CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(QUIET_CHANNEL_ID, "Full Charge", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Silent notice when the battery reaches 100% while charging"
                }
            )
        }
        val prefs = context.getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE)
        val notification = NotificationCompat.Builder(context, QUIET_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_battery_monitor)
            .setContentTitle("Battery Fully Charged")
            .setContentText(fullChargeNotificationBody(context, prefs))
            .setWhen(prefs.getLong(NativeBatteryMonitorService.KEY_FULL_CHARGE_REACHED_AT_MS, System.currentTimeMillis()))
            .setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(openAppPendingIntent(context))
            .build()
        nm.notify(NOTIF_ID, notification)
    }
}
