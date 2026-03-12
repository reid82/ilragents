import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDateDividerLabel, shouldShowDateDivider } from './date-utils';

describe('getDateDividerLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for today\'s date', () => {
    expect(getDateDividerLabel(new Date('2026-03-12T08:00:00Z'))).toBe('Today');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    expect(getDateDividerLabel(new Date('2026-03-11T15:00:00Z'))).toBe('Yesterday');
  });

  it('returns formatted date for older dates', () => {
    expect(getDateDividerLabel(new Date('2026-03-05T12:00:00Z'))).toBe('5 March 2026');
  });

  it('returns formatted date for different year', () => {
    expect(getDateDividerLabel(new Date('2025-12-25T12:00:00Z'))).toBe('25 December 2025');
  });
});

describe('shouldShowDateDivider', () => {
  it('returns true when timestamps are on different calendar days', () => {
    const prev = new Date('2026-03-11T23:00:00Z');
    const curr = new Date('2026-03-12T01:00:00Z');
    expect(shouldShowDateDivider(prev, curr)).toBe(true);
  });

  it('returns false when timestamps are on the same calendar day', () => {
    const prev = new Date('2026-03-12T08:00:00Z');
    const curr = new Date('2026-03-12T14:00:00Z');
    expect(shouldShowDateDivider(prev, curr)).toBe(false);
  });

  it('returns true when prev is null (first message)', () => {
    expect(shouldShowDateDivider(null, new Date('2026-03-12T08:00:00Z'))).toBe(true);
  });
});
