import { describe, test, expect } from 'vitest';
import { formatRelative } from '../formatRelative';

describe('formatRelative', () => {
  test("returns \"à l'instant\" for current second", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatRelative(now)).toBe("à l'instant");
  });

  test('returns "il y a 5 min" for 5 minutes ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 300;
    expect(formatRelative(ts)).toBe('il y a 5 min');
  });

  test('returns "il y a 2 h" for 2 hours ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 7200;
    expect(formatRelative(ts)).toBe('il y a 2 h');
  });

  test('returns "il y a 1 j" for 25 hours ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 90000;
    expect(formatRelative(ts)).toBe('il y a 1 j');
  });
});

describe('useFileEvents timestamp bug', () => {
  test('millisecond timestamp always shows "à l\'instant" (documents the old bug)', () => {
    // When Date.now() ms value is passed as ts, diffSec is huge negative → clamped to 0
    // This will always show "à l'instant" even for items from 5 minutes ago
    const msTimestamp = Date.now() - 5 * 60 * 1000; // "5 min ago" in milliseconds
    // With ms: Math.floor(Date.now()/1000) - msTimestamp is a HUGE negative number
    // Math.max(0, huge_negative) = 0 → "à l'instant"
    expect(formatRelative(msTimestamp)).toBe("à l'instant");
  });

  test('second timestamp correctly shows "il y a 5 min" (correct behavior after fix)', () => {
    // useFileEvents should store Math.floor(Date.now() / 1000), not Date.now()
    const secTimestamp = Math.floor(Date.now() / 1000) - 300;
    expect(formatRelative(secTimestamp)).toBe('il y a 5 min');
  });
});
