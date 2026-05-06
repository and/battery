package com.anddev.batteryalert

import android.content.Context
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
    fun startMonitoring() {
        NativeBatteryMonitorService.start(reactApplicationContext)
    }

    @ReactMethod
    fun stopMonitoring() {
        NativeBatteryMonitorService.stop(reactApplicationContext)
        NativeAlarmService.stop(reactApplicationContext)
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
