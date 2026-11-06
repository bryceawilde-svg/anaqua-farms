// Re-entry interval maths for the REI Field Re-Entry Report.
//
// Mirrors reiMinutes() in supabase/functions/rei-report, which computes the same
// instants server-side for the public gate posting. Keep the two in sync.
//
// One deliberate difference: the edge function resolves wall-clock times against
// the org's timezone, because it serves a page that has to say "restricted right
// now" to a phone anywhere. This report prints the farm's own records back to the
// farm, so the stored wall clock is used as written. Converting it through the
// browser's zone and back could only introduce error.

// Label REI is free text ("12 hours", "4 hr", "48 hours", "7 days", "NA").
// Returns minutes, or null when the text carries no interval we can trust.
// null is NOT zero: an unreadable REI must never be printed as safe.
export function reiMinutes(raw) {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || /^(n\/?a|none|-+|—|unknown|see label)$/.test(s)) return null;

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|hr|h|days?|d|weeks?|wks?|w)\b/);
  if (!m) return null;

  const n = parseFloat(m[1]);
  if (!isFinite(n) || n < 0) return null;

  const unit = m[2];
  if (/^(minutes?|mins?|m)$/.test(unit)) return Math.round(n);
  if (/^(hours?|hrs?|hr|h)$/.test(unit)) return Math.round(n * 60);
  if (/^(days?|d)$/.test(unit))          return Math.round(n * 1440);
  return Math.round(n * 10080); // weeks
}

// "YYYY-MM-DD" + "HH:MM" -> Date in the browser's zone, read as wall clock.
function wallClock(dateStr, clockStr, dayOffset = 0) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? ""));
  const c = /^(\d{1,2}):(\d{2})/.exec(String(clockStr ?? ""));
  if (!d || !c) return null;
  const h = +c[1], mi = +c[2];
  if (h > 23 || mi > 59) return null;
  return new Date(+d[1], +d[2] - 1, +d[3] + dayOffset, h, mi);
}

// When a field was finished, and when it becomes safe to enter again.
//
// `known` false means the product's REI could not be read off the record. The
// caller still flags the row: an interval we cannot parse is not an interval of
// zero, and the field has to be treated as restricted until someone checks the
// label.
export function reEntry({ date, start, end, hasEndDate, rei }) {
  const mins    = reiMinutes(rei);
  const startAt = wallClock(date, start);
  let   endAt   = wallClock(date, end);

  // A stop earlier than the start on the same date is an overnight job: roll it
  // to the next day rather than producing a negative interval.
  if (endAt && startAt && !hasEndDate && endAt.getTime() < startAt.getTime()) {
    endAt = wallClock(date, end, 1);
  }

  const known = mins !== null;
  const at = endAt && known ? new Date(endAt.getTime() + mins * 60000) : null;
  return { at, endAt, known };
}

// The sheet drops the date when re-entry falls on the day the spraying stopped,
// and carries it when it lands on a later one.
export function fmtReEntry(at, endAt) {
  if (!at) return "";
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = endAt
    && at.getFullYear() === endAt.getFullYear()
    && at.getMonth()    === endAt.getMonth()
    && at.getDate()     === endAt.getDate();
  return sameDay ? time : `${at.toLocaleDateString("en-US")} ${time}`;
}
