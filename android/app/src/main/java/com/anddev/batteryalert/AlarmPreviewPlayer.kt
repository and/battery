package com.anddev.batteryalert

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper

/** Short alarm sample for settings preview — no foreground service or notification. */
object AlarmPreviewPlayer {
    private const val PREVIEW_MS = 3000L

    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var stopRunnable: Runnable? = null

    fun play(context: Context, fullCharge: Boolean = false) {
        stop()
        val resId = if (fullCharge) R.raw.alarm_full else R.raw.alarm
        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            context.resources.openRawResourceFd(resId).use { afd ->
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
            }
            mp.isLooping = true
            mp.setVolume(1f, 1f)
            mp.prepare()
            mp.start()
            player = mp
            val runnable = Runnable { stop() }
            stopRunnable = runnable
            handler.postDelayed(runnable, PREVIEW_MS)
        } catch (e: Exception) {
            android.util.Log.e("AlarmPreviewPlayer", "Preview failed", e)
            mp.release()
        }
    }

    fun stop() {
        stopRunnable?.let { handler.removeCallbacks(it) }
        stopRunnable = null
        try {
            player?.stop()
        } catch (_: Exception) {
        } finally {
            player?.release()
            player = null
        }
    }
}
