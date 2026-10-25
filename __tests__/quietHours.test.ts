import {isInQuietHours} from '../src/utils/quietHours';

function at(hour: number, minute: number): Date {
  const d = new Date(2026, 0, 15, hour, minute, 0, 0);
  return d;
}

describe('isInQuietHours', () => {
  const overnight = {start: 22 * 60, end: 7 * 60};

  it('is true during overnight quiet window', () => {
    expect(isInQuietHours(overnight, at(23, 0))).toBe(true);
    expect(isInQuietHours(overnight, at(3, 0))).toBe(true);
  });

  it('is false outside overnight quiet window', () => {
    expect(isInQuietHours(overnight, at(12, 0))).toBe(false);
    expect(isInQuietHours(overnight, at(8, 0))).toBe(false);
  });

  it('treats equal start and end as disabled', () => {
    expect(isInQuietHours({start: 0, end: 0}, at(0, 0))).toBe(false);
  });
});
