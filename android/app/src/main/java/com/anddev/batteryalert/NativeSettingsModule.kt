package com.anddev.batteryalert

import android.app.TimePickerDialog
import android.content.Context
import android.text.format.DateFormat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NativeSettingsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NativeSettings"

    @ReactMethod
    fun setThreshold(threshold: Int) {
        prefs().edit().putInt(NativeBatteryMonitorService.KEY_THRESHOLD, threshold).apply()
        NativeBatteryMonitorService.recheck(reactApplicationContext)
    }

    @ReactMethod
    fun setMonitoringEnabled(enabled: Boolean) {
        prefs().edit().putBoolean(NativeBatteryMonitorService.KEY_MONITORING_ENABLED, enabled).apply()
        if (enabled) {
            NativeBatteryMonitorService.start(reactApplicationContext)
        } else {
            NativeBatteryMonitorService.stop(reactApplicationContext)
            NativeAlarmService.stop(reactApplicationContext)
        }
    }

    @ReactMethod
    fun setFullChargeAlertEnabled(enabled: Boolean) {
        prefs().edit().putBoolean(NativeBatteryMonitorService.KEY_FULL_CHARGE_ALERT_ENABLED, enabled).apply()
        if (enabled) {
            NativeBatteryMonitorService.recheck(reactApplicationContext)
        } else {
            FullChargeNotifier.cancel(reactApplicationContext)
        }
    }

    @ReactMethod
    fun setQuietHours(startMinutes: Int, endMinutes: Int) {
        prefs().edit()
            .putInt(NativeBatteryMonitorService.KEY_QUIET_START, startMinutes)
            .putInt(NativeBatteryMonitorService.KEY_QUIET_END, endMinutes)
            .apply()
    }

    /** Shows the system time picker; resolves minutes after midnight, or null if cancelled. */
    @ReactMethod
    fun showTimePicker(minutes: Int, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            var picked = false
            val dialog = TimePickerDialog(
                activity,
                { _, hour, minute ->
                    picked = true
                    promise.resolve(hour * 60 + minute)
                },
                minutes / 60, minutes % 60, DateFormat.is24HourFormat(activity)
            )
            dialog.setOnDismissListener { if (!picked) promise.resolve(null) }
            dialog.show()
        }
    }

    @ReactMethod
    fun startMonitoring() {
        NativeBatteryMonitorService.start(reactApplicationContext)
    }

    @ReactMethod
    fun stopMonitoring() {
        NativeBatteryMonitorService.stop(reactApplicationContext)
        NativeAlarmService.stop(reactApplicationContext)
    }

    @ReactMethod
    fun setSnoozeUntil(timestampMs: Double) {
        prefs().edit().putLong(NativeBatteryMonitorService.KEY_SNOOZE_UNTIL, timestampMs.toLong()).apply()
    }

    @ReactMethod
    fun startAlarm() {
        NativeAlarmService.start(reactApplicationContext)
    }

    @ReactMethod
    fun stopAlarm() {
        NativeAlarmService.stop(reactApplicationContext)
    }

    private fun prefs() = reactApplicationContext.getSharedPreferences(
        NativeBatteryMonitorService.PREFS_NAME, Context.MODE_PRIVATE
    )
}
