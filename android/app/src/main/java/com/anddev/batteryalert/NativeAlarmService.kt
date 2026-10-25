package com.anddev.batteryalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class NativeAlarmService : Service() {

    private var player: MediaPlayer? = null
    private var activeKind: String = KIND_LOW
    private val handler = Handler(Looper.getMainLooper())
    private var fullChargeNextRunnable: Runnable? = null
    private var fullChargeEscalationStep = 0

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_DISMISS) {
            if (intent.getStringExtra(EXTRA_KIND) == KIND_FULL) {
                prefs().edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false).apply()
            }
            stopSelf()
            return START_NOT_STICKY
        }
        val kind = intent?.getStringExtra(EXTRA_KIND)
            ?: if (prefs().getBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALARM_ACTIVE, false)) KIND_FULL else KIND_LOW
        val kindChanged = activeKind != kind
        activeKind = kind
        ensureChannel()
        startForeground(NOTIF_ID, buildNotification(kind))
        val shouldStartPlayback = when {
            kindChanged -> true
            kind == KIND_LOW -> player?.isPlaying != true
            kind == KIND_FULL -> !fullChargeAlarmInProgress()
            else -> false
        }
        if (shouldStartPlayback) {
            startAlarmPlayback(kind)
        }
        return START_STICKY
    }

    private fun fullChargeAlarmInProgress(): Boolean {
        if (activeKind != KIND_FULL) return false
        if (player?.isPlaying == true) return true
        return fullChargeNextRunnable != null
    }

    private fun alarmRawRes(kind: String): Int =
        if (kind == KIND_FULL) R.raw.alarm_full else R.raw.alarm

    private fun startAlarmPlayback(kind: String) {
        releasePlayer()
        cancelFullChargeSchedule()
        if (kind == KIND_FULL) {
            fullChargeEscalationStep = 0
            playFullChargeChimeOnce()
        } else {
            playLowBatteryLoop()
        }
    }

    /** Low battery: continuous loop. Full charge: chime with exponentially growing gaps between plays. */
    private fun playLowBatteryLoop() {
        val mp = createPreparedPlayer(KIND_LOW, loop = true) ?: return
        player = mp
        setLowBatteryAlarmActive(true)
        mp.start()
    }

    private fun playFullChargeChimeOnce() {
        if (activeKind != KIND_FULL) return
        val mp = createPreparedPlayer(KIND_FULL, loop = false) ?: return
        player = mp
        setLowBatteryAlarmActive(false)
        mp.setOnCompletionListener {
            if (activeKind != KIND_FULL) return@setOnCompletionListener
            releasePlayer()
            scheduleNextFullChargeChime()
        }
        mp.start()
    }

    private fun scheduleNextFullChargeChime() {
        if (activeKind != KIND_FULL) return
        val gapMs = fullChargeGapMs(fullChargeEscalationStep)
        fullChargeEscalationStep++
        val runnable = Runnable {
            fullChargeNextRunnable = null
            playFullChargeChimeOnce()
        }
        fullChargeNextRunnable = runnable
        handler.postDelayed(runnable, gapMs)
    }

    private fun fullChargeGapMs(step: Int): Long {
        val scaled = FULL_CHARGE_INITIAL_GAP_MS * Math.pow(FULL_CHARGE_GAP_MULTIPLIER, step.toDouble())
        return scaled.toLong().coerceAtMost(FULL_CHARGE_MAX_GAP_MS)
    }

    private fun createPreparedPlayer(kind: String, loop: Boolean): MediaPlayer? {
        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            resources.openRawResourceFd(alarmRawRes(kind)).use { afd ->
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            }
            mp.isLooping = loop
            mp.setVolume(1f, 1f)
            mp.prepare()
            return mp
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to prepare alarm playback", e)
            mp.release()
            setLowBatteryAlarmActive(false)
            if (kind == KIND_LOW) {
                stopSelf()
            }
            return null
        }
    }

    private fun cancelFullChargeSchedule() {
        fullChargeNextRunnable?.let { handler.removeCallbacks(it) }
        fullChargeNextRunnable = null
    }

    private fun releasePlayer() {
        try {
            player?.setOnCompletionListener(null)
            player?.stop()
        } catch (_: Exception) {
        } finally {
            player?.release()
            player = null
        }
    }

    private fun setLowBatteryAlarmActive(active: Boolean) {
        prefs().edit()
            .putBoolean(NativeBatteryMonitorService.KEY_LOW_BATTERY_ALARM_ACTIVE, active)
            .apply()
    }

    private fun buildNotification(kind: String): android.app.Notification {
        val full = kind == KIND_FULL
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
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
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppPendingIntent(this))
        if (full) {
            builder
                .addAction(0, "Dismiss", dismissIntent(kind))
                .setDeleteIntent(dismissIntent(kind))
        }
        return builder.build()
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
        cancelFullChargeSchedule()
        fullChargeEscalationStep = 0
        releasePlayer()
        setLowBatteryAlarmActive(false)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "NativeAlarmService"
        private const val CHANNEL_ID = "battery-alert-channel"
        const val NOTIF_ID = 9002
        private const val ACTION_STOP = "com.anddev.batteryalert.STOP_ALARM"
        private const val ACTION_DISMISS = "com.anddev.batteryalert.DISMISS_ALARM"
        private const val EXTRA_KIND = "kind"
        const val KIND_LOW = "low"
        const val KIND_FULL = "full"

        /** First silence gap after the initial chime; each later gap × {@link #FULL_CHARGE_GAP_MULTIPLIER} (capped). */
        private const val FULL_CHARGE_INITIAL_GAP_MS = 8_000L
        private const val FULL_CHARGE_MAX_GAP_MS = 300_000L // 5 minutes
        private const val FULL_CHARGE_GAP_MULTIPLIER = 2.0

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
