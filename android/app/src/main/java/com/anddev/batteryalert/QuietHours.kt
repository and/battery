package com.anddev.batteryalert

import android.content.SharedPreferences
import java.util.Calendar

object QuietHours {
    fun isInQuietHours(prefs: SharedPreferences): Boolean {
        val start = prefs.getInt(
            NativeBatteryMonitorService.KEY_QUIET_START,
            NativeBatteryMonitorService.DEFAULT_QUIET_START,
        )
        val end = prefs.getInt(
            NativeBatteryMonitorService.KEY_QUIET_END,
            NativeBatteryMonitorService.DEFAULT_QUIET_END,
        )
        if (start == end) return false
        val cal = Calendar.getInstance()
        val now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return if (start < end) now in start until end else now >= start || now < end
    }
}
