package com.anddev.batteryalert

import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class BatteryHealthModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "BatteryHealth"

    @ReactMethod
    fun getHealthStatus(promise: Promise) {
        try {
            val intent = reactApplicationContext.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            val healthInt = intent?.getIntExtra(
                BatteryManager.EXTRA_HEALTH,
                BatteryManager.BATTERY_HEALTH_UNKNOWN
            ) ?: BatteryManager.BATTERY_HEALTH_UNKNOWN

            val result = WritableNativeMap()
            result.putString("status", mapHealthToStatus(healthInt))
            result.putString("label", mapHealthToLabel(healthInt))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    private fun mapHealthToStatus(health: Int): String = when (health) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT,
        BatteryManager.BATTERY_HEALTH_COLD -> "fair"
        BatteryManager.BATTERY_HEALTH_DEAD,
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE,
        BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "poor"
        else -> "unknown"
    }

    private fun mapHealthToLabel(health: Int): String = when (health) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheating"
        BatteryManager.BATTERY_HEALTH_COLD -> "Too Cold"
        BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
        BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "Failed"
        else -> "Unknown"
    }
}
