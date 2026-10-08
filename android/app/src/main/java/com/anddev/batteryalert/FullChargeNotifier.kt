package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import androidx.core.app.NotificationCompat

// Posts a one-time "fully charged" notification while the charger stays plugged in.
// It is a normal notification, not an alarm, so Do Not Disturb and Bedtime mode silence it.
object FullChargeNotifier {
    private const val CHANNEL_ID = "battery-full-charge"
    private const val NOTIF_ID = 9003

    fun update(context: Context, prefs: SharedPreferences, pct: Int, plugged: Boolean) {
        val notified = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false)
        if (!plugged) {
            if (notified) cancel(context)
            return
        }
        val enabled = prefs.getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, false)
        if (enabled && pct >= 100 && !notified) {
            show(context)
            prefs.edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, true).apply()
        }
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
        context.getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_NOTIFIED, false).apply()
    }

    private fun show(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Full Charge", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Battery is at 100% while the charger is plugged in"
                }
            )
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_battery_monitor)
            .setContentTitle("Battery Fully Charged")
            .setContentText("Battery is at 100%. You can unplug your charger.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(openAppPendingIntent(context))
            .build()
        nm.notify(NOTIF_ID, notification)
    }
}
