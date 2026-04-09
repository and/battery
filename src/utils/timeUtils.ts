/**
 * Returns true if the current hour falls within the sleep window defined by
 * startHour and endHour (both 0–23, inclusive of startHour, exclusive of endHour).
 *
 * Handles overnight windows (e.g. 22 → 7): startHour > endHour
 * Handles same-day windows (e.g. 13 → 15): startHour < endHour
 */
export function isInSleepHours(startHour: number, endHour: number): boolean {
  const currentHour = new Date().getHours();
  if (startHour === endHour) {
    return false; // degenerate: zero-length window
  }
  if (startHour > endHour) {
    // Overnight window: e.g. 22 → 7 means 22,23,0,1,...,6
    return currentHour >= startHour || currentHour < endHour;
  }
  // Same-day window
  return currentHour >= startHour && currentHour < endHour;
}

/** Format a 0–23 hour as a readable 12-hour clock string, e.g. 22 → "10 PM" */
export function formatHour(hour: number): string {
  if (hour === 0) {
    return '12 AM';
  }
  if (hour === 12) {
    return '12 PM';
  }
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}
