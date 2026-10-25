import type {QuietHours} from '../storage/settings';

/** True when local time is inside [start, end), including overnight ranges. */
export function isInQuietHours({start, end}: QuietHours, now = new Date()): boolean {
  if (start === end) {
    return false;
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}
