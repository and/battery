package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.IBinder
import androidx.core.app.NotificationCompat

class NativeBatteryMonitorService : Service() {

    private var batteryReceiver: BroadcastReceiver? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        startForeground(NOTIF_ID, buildNotification())
        if (batteryReceiver == null) {
            registerBatteryReceiver()
        }
        return START_STICKY
    }

    private fun registerBatteryReceiver() {
        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_BATTERY_CHANGED -> handleBatteryChanged(intent)
                    Intent.ACTION_POWER_CONNECTED -> NativeAlarmService.stop(this@NativeBatteryMonitorService)
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
        }
        registerReceiver(batteryReceiver, filter)
    }

    private fun handleBatteryChanged(intent: Intent) {
        evaluate(this, intent)
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_battery_monitor)
        .setContentTitle("Battery Alert")
        .setContentText("Monitoring battery...")
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setOngoing(true)
        .setShowWhen(false)
        .setContentIntent(openAppPendingIntent(this))
        // Android 14+ lets users swipe away foreground-service notifications. Restart
        // the service on swipe so it re-posts the notification and the status bar icon.
        .setDeleteIntent(
            PendingIntent.getService(
                this, 0, Intent(this, NativeBatteryMonitorService::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        .build()

    private fun ensureChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Battery Monitoring", NotificationManager.IMPORTANCE_HIGH).apply {
                    setShowBadge(false)
                    enableVibration(false)
                    setSound(null, null)
                }
            )
        }
    }

    override fun onDestroy() {
        batteryReceiver?.let { unregisterReceiver(it) }
        batteryReceiver = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val PREFS_NAME = "BatteryAlertPrefs"
        const val KEY_THRESHOLD = "threshold"
        const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        const val KEY_SNOOZE_UNTIL = "snooze_until"
        const val KEY_FULL_CHARGE_ALERT_ENABLED = "full_charge_alert_enabled"
        const val KEY_FULL_CHARGE_NOTIFIED = "full_charge_notified"
        const val KEY_FULL_CHARGE_ALARM_ACTIVE = "full_charge_alarm_active"
        const val KEY_QUIET_START = "quiet_start_minutes"
        const val KEY_QUIET_END = "quiet_end_minutes"
        const val DEFAULT_QUIET_START = 22 * 60
        const val DEFAULT_QUIET_END = 7 * 60
        const val DEFAULT_THRESHOLD = 20
        private const val CHANNEL_ID = "battery_native_monitor_v2"
        const val NOTIF_ID = 9001

        fun start(context: Context) {
            context.startForegroundService(Intent(context, NativeBatteryMonitorService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, NativeBatteryMonitorService::class.java))
        }

        fun recheck(context: Context) {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                ?: return
            evaluate(context, intent)
        }

        private fun evaluate(context: Context, intent: Intent) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            if (level < 0) return
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val pct = if (scale > 0) (level * 100) / scale else return
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                           status == BatteryManager.BATTERY_STATUS_FULL
            val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
            applyAlarmState(context, prefs, pct, charging, plugged)
        }

        fun applyAlarmState(
            context: Context,
            prefs: android.content.SharedPreferences,
            pct: Int,
            charging: Boolean,
            plugged: Boolean,
        ) {
            if (!prefs.getBoolean(KEY_MONITORING_ENABLED, true)) {
                NativeAlarmService.stop(context)
                FullChargeNotifier.cancel(context)
                return
            }
            if (FullChargeNotifier.update(context, prefs, pct, plugged)) return
            val threshold = prefs.getInt(KEY_THRESHOLD, DEFAULT_THRESHOLD)
            val snoozeUntil = prefs.getLong(KEY_SNOOZE_UNTIL, 0L)
            val snoozed = snoozeUntil > System.currentTimeMillis()
            if (charging || pct > threshold) {
                NativeAlarmService.stop(context)
            } else if (!snoozed) {
                NativeAlarmService.start(context)
            }
        }
    }
}
