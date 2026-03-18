/**
 * Date utilities for timezone-aware formatting and conversion.
 *
 * Root cause of the "next day" bug:
 *   The form produces a bare datetime string like "2026-03-16T18:00" (no timezone
 *   designator). Supabase's timestamptz column interprets bare strings as UTC, so
 *   18:00 BD time (UTC+6) is stored as 18:00 UTC = midnight next day in BD.
 *
 * Fix:
 *   - On SAVE  → tzLocalToUTC("2026-03-16T18:00", "Asia/Dhaka") → "2026-03-16T12:00:00.000Z"
 *   - On DISPLAY → formatDate("2026-03-16T12:00:00Z", "DD/MM/YYYY", "Asia/Dhaka") → "16/03/2026"
 */

/** Convert a datetime-local string ("YYYY-MM-DDTHH:mm") that represents local time
 *  in the given IANA timezone into a UTC ISO string suitable for storage. */
export function tzLocalToUTC(localStr: string, timezone: string): string {
  // Split off the date and time parts
  const [datePart, timePart = '00:00'] = localStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  // Step 1: create a reference timestamp treating the input as UTC (no conversion yet)
  const approxUTCMs = Date.UTC(year, month - 1, day, hour, minute);

  // Step 2: ask Intl what the target timezone's wall-clock shows for that reference
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(approxUTCMs));

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  const tzYear = get('year');
  const tzMonth = get('month');
  const tzDay = get('day');
  const tzHour = get('hour');   // can be 24 (midnight edge case in some impls)
  const tzMinute = get('minute');

  // Step 3: the difference tells us the UTC offset of the timezone at this moment
  const tzAsUTCMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour % 24, tzMinute);
  const offsetMs = tzAsUTCMs - approxUTCMs; // positive = timezone is ahead of UTC

  // Step 4: actual UTC = local wall-clock - offset
  return new Date(approxUTCMs - offsetMs).toISOString();
}

/** Convert a UTC date/datetime string from the DB into a datetime-local input value
 *  ("YYYY-MM-DDTHH:mm") expressed in the user's preferred timezone.
 *  Used when pre-filling the edit form so the user sees their local time. */
export function utcToLocalInput(utcStr: string, timezone: string): string {
  const date = new Date(utcStr);
  if (isNaN(date.getTime())) return utcStr.slice(0, 16);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const h = get('hour');
  // Some implementations return '24' for midnight; normalise to '00'
  const hNorm = h === '24' ? '00' : h;
  return `${get('year')}-${get('month')}-${get('day')}T${hNorm}:${get('minute')}`;
}

/** Build a datetime-local string ("YYYY-MM-DDTHH:mm") representing "now" in a timezone.
 *  Used to pre-fill the datetime-local input. */
export function nowInTZ(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Format a date/datetime string for display using the user's timezone + format preference.
 *
 *  @param dateStr   ISO date or datetime string stored in DB (may be UTC timestamptz)
 *  @param format    'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
 *  @param timezone  IANA timezone string, e.g. 'Asia/Dhaka'
 */
export function formatDate(
  dateStr: string | null | undefined,
  format = 'DD/MM/YYYY',
  timezone = 'UTC',
): string {
  if (!dateStr) return '—';

  let date: Date;
  try {
    // If the string looks like a plain date ("2026-03-16"), treat as date-only —
    // no timezone conversion needed, just display the date part.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      const [y, m, d] = dateStr.trim().split('-').map(Number);
      date = new Date(Date.UTC(y, m - 1, d));
      timezone = 'UTC'; // treat date-only as UTC to avoid day shift
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return dateStr;
  } catch {
    return dateStr;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const y = get('year');
  const m = get('month');
  const d = get('day');

  return format
    .replace('YYYY', y)
    .replace('MM', m)
    .replace('DD', d);
}

/** Common IANA timezones with display labels, grouped by region. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  // UTC
  { value: 'UTC', label: 'UTC — Coordinated Universal Time' },
  // Americas
  { value: 'America/New_York', label: 'UTC−5/−4 — New York (ET)' },
  { value: 'America/Chicago', label: 'UTC−6/−5 — Chicago (CT)' },
  { value: 'America/Denver', label: 'UTC−7/−6 — Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'UTC−8/−7 — Los Angeles (PT)' },
  { value: 'America/Anchorage', label: 'UTC−9/−8 — Anchorage (AKT)' },
  { value: 'Pacific/Honolulu', label: 'UTC−10 — Honolulu (HT)' },
  { value: 'America/Sao_Paulo', label: 'UTC−3/−2 — São Paulo (BRT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'UTC−3 — Buenos Aires (ART)' },
  { value: 'America/Toronto', label: 'UTC−5/−4 — Toronto (ET)' },
  { value: 'America/Vancouver', label: 'UTC−8/−7 — Vancouver (PT)' },
  { value: 'America/Mexico_City', label: 'UTC−6/−5 — Mexico City (CT)' },
  // Europe
  { value: 'Europe/London', label: 'UTC+0/+1 — London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'UTC+1/+2 — Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'UTC+1/+2 — Berlin (CET/CEST)' },
  { value: 'Europe/Rome', label: 'UTC+1/+2 — Rome (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'UTC+1/+2 — Madrid (CET/CEST)' },
  { value: 'Europe/Amsterdam', label: 'UTC+1/+2 — Amsterdam (CET/CEST)' },
  { value: 'Europe/Stockholm', label: 'UTC+1/+2 — Stockholm (CET/CEST)' },
  { value: 'Europe/Moscow', label: 'UTC+3 — Moscow (MSK)' },
  { value: 'Europe/Istanbul', label: 'UTC+3 — Istanbul (TRT)' },
  { value: 'Europe/Warsaw', label: 'UTC+1/+2 — Warsaw (CET/CEST)' },
  { value: 'Europe/Kiev', label: 'UTC+2/+3 — Kyiv (EET/EEST)' },
  // Africa
  { value: 'Africa/Cairo', label: 'UTC+2/+3 — Cairo (EET)' },
  { value: 'Africa/Johannesburg', label: 'UTC+2 — Johannesburg (SAST)' },
  { value: 'Africa/Lagos', label: 'UTC+1 — Lagos (WAT)' },
  { value: 'Africa/Nairobi', label: 'UTC+3 — Nairobi (EAT)' },
  // Middle East
  { value: 'Asia/Dubai', label: 'UTC+4 — Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'UTC+3 — Riyadh (AST)' },
  { value: 'Asia/Tehran', label: 'UTC+3:30/+4:30 — Tehran (IRST)' },
  // Asia
  { value: 'Asia/Kolkata', label: 'UTC+5:30 — Kolkata / Mumbai (IST)' },
  { value: 'Asia/Dhaka', label: 'UTC+6 — Dhaka (BST)' },
  { value: 'Asia/Kathmandu', label: 'UTC+5:45 — Kathmandu (NPT)' },
  { value: 'Asia/Colombo', label: 'UTC+5:30 — Colombo (SLST)' },
  { value: 'Asia/Karachi', label: 'UTC+5 — Karachi (PKT)' },
  { value: 'Asia/Tashkent', label: 'UTC+5 — Tashkent (UZT)' },
  { value: 'Asia/Almaty', label: 'UTC+6 — Almaty (ALMT)' },
  { value: 'Asia/Bangkok', label: 'UTC+7 — Bangkok (ICT)' },
  { value: 'Asia/Jakarta', label: 'UTC+7 — Jakarta (WIB)' },
  { value: 'Asia/Singapore', label: 'UTC+8 — Singapore (SGT)' },
  { value: 'Asia/Kuala_Lumpur', label: 'UTC+8 — Kuala Lumpur (MYT)' },
  { value: 'Asia/Shanghai', label: 'UTC+8 — Shanghai (CST)' },
  { value: 'Asia/Hong_Kong', label: 'UTC+8 — Hong Kong (HKT)' },
  { value: 'Asia/Manila', label: 'UTC+8 — Manila (PST)' },
  { value: 'Asia/Seoul', label: 'UTC+9 — Seoul (KST)' },
  { value: 'Asia/Tokyo', label: 'UTC+9 — Tokyo (JST)' },
  { value: 'Asia/Colombo', label: 'UTC+5:30 — Colombo (SLST)' },
  // Pacific / Oceania
  { value: 'Australia/Sydney', label: 'UTC+10/+11 — Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'UTC+10/+11 — Melbourne (AEST/AEDT)' },
  { value: 'Australia/Perth', label: 'UTC+8 — Perth (AWST)' },
  { value: 'Pacific/Auckland', label: 'UTC+12/+13 — Auckland (NZST/NZDT)' },
];
