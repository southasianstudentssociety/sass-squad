export const FEEDBACK_DAYS = 30;

/** Can people still rate this event? (Started, and within the feedback window.) */
export function feedbackOpen(startsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt).getTime();
  return now.getTime() >= start && now.getTime() <= start + FEEDBACK_DAYS * 24 * 3600_000;
}
