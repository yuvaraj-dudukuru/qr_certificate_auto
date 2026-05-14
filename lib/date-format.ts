// Long-date formatter shared between the verify page (where the verified
// state shows dates) and the issue route (where dates are baked onto the PDF).
// Format: "1 March 2026". en-GB locale, UTC timezone.
//
// The certificates table stores dates as ISO 'YYYY-MM-DD' — these have no
// time component, so we parse them as UTC midnight to avoid timezone drift.

export function formatLongDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
