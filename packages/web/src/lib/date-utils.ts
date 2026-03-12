function toUTCDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function getDateDividerLabel(date: Date): string {
  const now = new Date();
  const todayUTC = toUTCDay(now);
  const targetUTC = toUTCDay(date);
  const diffDays = Math.floor((todayUTC - targetUTC) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function shouldShowDateDivider(
  prevTimestamp: Date | null,
  currTimestamp: Date,
): boolean {
  if (!prevTimestamp) return true;
  return toUTCDay(prevTimestamp) !== toUTCDay(currTimestamp);
}
