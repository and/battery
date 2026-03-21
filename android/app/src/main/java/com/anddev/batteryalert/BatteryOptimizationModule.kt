package com.anddev.batteryalert

import android.content.Context
import android.os.PowerManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class BatteryOptimizationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "BatteryOptimization"

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        promise.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
    }
}
