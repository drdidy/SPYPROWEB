// User preferences accessor. The backend doesn't persist user prefs
// yet (the /settings page renders a "coming soon" notice), so until
// the auth + persistence layer lands the slate falls back to
// America/Chicago — the default the rest of the app already uses for
// session math and stale-close labels.
//
// TODO(backend): once /api/me returns userPrefs.timezone, replace
// the hardcoded default with the server value. Field shape we want:
//   { userPrefs: { timezone: string } }
// Read at the request boundary in the dashboard's Server Component
// and pass into the client tree as a prop.

export const DEFAULT_TIMEZONE = "America/Chicago";

/**
 * Resolve the timezone we should render timestamps in.
 *
 * For now this returns the fixed default; once the auth layer lands
 * the caller will override it from the resolved user prefs, and
 * downstream consumers won't have to change.
 */
export function resolveUserTimezone(): string {
  return DEFAULT_TIMEZONE;
}

/**
 * Format a date in the user's timezone, with a sensible default
 * options bag. Centralizes Intl.DateTimeFormat use so we don't end
 * up with hand-rolled strings.
 */
export function formatInUserTimezone(
  d: Date,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  },
  timezone: string = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(d);
}

/**
 * Build a CT-equivalent label for a timestamp. Used inside InfoTooltip
 * content next to a user-TZ-formatted string so the user can confirm
 * the underlying CT moment without leaving the page.
 */
export function ctEquivalent(d: Date): string {
  return formatInUserTimezone(
    d,
    {
      timeZone: "America/Chicago",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    },
    "America/Chicago",
  );
}
