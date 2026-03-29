export const DEFAULT_THRESHOLD = 20;
export const MIN_THRESHOLD = 5;
export const MAX_THRESHOLD = 50;
export const THRESHOLD_STEP = 1;
export const BATTERY_CHECK_INTERVAL_MS = 5_000; // fallback polling interval (5 sec)
export const NOTIFICATION_CHANNEL_ID = 'battery-alert-channel';
export const NOTIFICATION_ID = 'battery-low-alert';
export const MONITORING_NOTIFICATION_ID = 'battery-monitoring';
export const STATUS_ICON_CHANNEL_ID = 'battery-status-icon';
export const STATUS_ICON_NOTIFICATION_ID = 'battery-status-icon';
export const SNOOZE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Overcharge alert
export const OVERCHARGE_NOTIFICATION_ID = 'battery-overcharge-alert';
export const OVERCHARGE_DELAY_MS = 30 * 60 * 1000; // 30 minutes at 100% triggers alert

// Sleep hours defaults
export const DEFAULT_SLEEP_START_HOUR = 22; // 10 PM
export const DEFAULT_SLEEP_END_HOUR = 7;    // 7 AM
