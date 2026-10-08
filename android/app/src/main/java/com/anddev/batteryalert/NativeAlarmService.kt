package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.IBinder
import androidx.core.app.NotificationCompat

class NativeAlarmService : Service() {

    private var player: MediaPlayer? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_DISMISS) {
            if (intent.getStringExtra(EXTRA_KIND) == KIND_FULL) {
                // Keep "notified" set so the alarm does not restart until the charger is unplugged.
                prefs().edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false).apply()
            }
            stopSelf()
            return START_NOT_STICKY
        }
        // A sticky restart has no intent; fall back to whichever alarm was last active.
        val kind = intent?.getStringExtra(EXTRA_KIND)
            ?: if (prefs().getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)) KIND_FULL else KIND_LOW
        ensureChannel()
        startForeground(NOTIF_ID, buildNotification(kind))
        if (player?.isPlaying != true) {
            startAlarm()
        }
        return START_STICKY
    }

    private fun startAlarm() {
        player?.release()
        player = null
        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            resources.openRawResourceFd(R.raw.alarm).use { afd ->
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            }
            mp.isLooping = true
            mp.prepare()
            mp.start()
            player = mp
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to start alarm playback", e)
            mp.release()
        }
    }

    private fun buildNotification(kind: String): android.app.Notification {
        val full = kind == KIND_FULL
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_battery_monitor)
            .setContentTitle(if (full) "Battery Fully Charged" else "Low Battery Warning")
            .setContentText(
                if (full) "Battery is at 100%. Please unplug your charger."
                else "Battery is critically low. Please plug in your charger."
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            // The service re-posts this on every battery update; only the first post should buzz.
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppPendingIntent(this))
            .addAction(0, "Dismiss", dismissIntent(kind))
            // Swiping the notification away (allowed on Android 14+) also stops the alarm.
            .setDeleteIntent(dismissIntent(kind))
            .build()
    }

    private fun prefs() = getSharedPreferences(NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE)

    private fun dismissIntent(kind: String): PendingIntent {
        val intent = Intent(this, NativeAlarmService::class.java).apply {
            action = ACTION_DISMISS
            putExtra(EXTRA_KIND, kind)
        }
        return PendingIntent.getService(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Battery Alert", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    override fun onDestroy() {
        try {
            player?.stop()
        } catch (_: Exception) {
        } finally {
            player?.release()
            player = null
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "NativeAlarmService"
        // Must match NOTIFICATION_CHANNEL_ID in src/utils/constants.ts
        private const val CHANNEL_ID = "battery-alert-channel"
        const val NOTIF_ID = 9002
        private const val ACTION_STOP = "com.anddev.batteryalert.STOP_ALARM"
        private const val ACTION_DISMISS = "com.anddev.batteryalert.DISMISS_ALARM"
        private const val EXTRA_KIND = "kind"
        const val KIND_LOW = "low"
        const val KIND_FULL = "full"

        fun start(context: Context, kind: String = KIND_LOW) {
            context.startForegroundService(
                Intent(context, NativeAlarmService::class.java).putExtra(EXTRA_KIND, kind)
            )
        }

        fun stop(context: Context) {
            context.startService(Intent(context, NativeAlarmService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }
}
