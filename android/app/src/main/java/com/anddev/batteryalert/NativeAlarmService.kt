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
        ensureChannel()
        startForeground(NOTIF_ID, buildNotification())
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

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_battery_monitor)
        .setContentTitle("Low Battery Warning")
        .setContentText("Battery is critically low. Please plug in your charger.")
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setOngoing(true)
        .setAutoCancel(false)
        .addAction(0, "Dismiss", stopIntent())
        .build()

    private fun stopIntent(): PendingIntent {
        val intent = Intent(this, NativeAlarmService::class.java).apply {
            action = ACTION_STOP
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

        fun start(context: Context) {
            context.startForegroundService(Intent(context, NativeAlarmService::class.java))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, NativeAlarmService::class.java).apply {
                action = ACTION_STOP
            })
        }
    }
}
