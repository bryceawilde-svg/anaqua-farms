// Public REI posting: the only anon-reachable view of an org's spray records.
//
// GET /rei-report?t=<token>
//
// The token comes from a QR code at a field gate. It is looked up in rei_links,
// and the response carries nothing but what a re-entry posting needs — no org id,
// no ticket ids, no applicator licence numbers, no field boundaries.
// Re-entry instants are computed here, server-side, against the org's own
// timezone, so the page can re-evaluate "restricted now?" on every tick without
// ever being regenerated.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// Only EPA-registered pesticides carry an REI: drop adjuvants and anything without
// an EPA number. Keep in sync with reportableTickets() in AnaquaFarms_AppTicket.jsx
// and with supabase/functions/sheets-export.
const hasEpaNumber = (epa: string | null | undefined) =>
  !/^(|n\/?a|none|-+|—)$/i.test((epa ?? "").trim());

type ChemSnapshot = {
  name?: string;
  activeIngredient?: string;
  epa?: string;
  rei?: string;
  ratePerAcre?: string | number;
  unit?: string;
};

type ScheduleEntry = {
  name?: string;
  acres?: string | number;
  timeStart?: string;
  timeEnd?: string;
  actualTimeStart?: string;
  actualTimeEnd?: string;
  actualDateStart?: string;
  actualDateEnd?: string;
};

// ---------------------------------------------------------------- REI parsing

// Label REI is free text ("12 hours", "4 hr", "48 hours", "7 days", "NA").
// Returns minutes, or null when the text carries no interval we can trust.
// null is NOT zero: the caller treats an unparseable REI as restricted and says so.
export function reiMinutes(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || /^(n\/?a|none|-+|—|unknown|see label)$/.test(s)) return null;

  // "12 hours", "4 hr", "48h", "7 days", "30 min", "2 weeks"
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|hr|h|days?|d|weeks?|wks?|w)\b/);
  if (!m) return null;

  const n = parseFloat(m[1]);
  if (!isFinite(n) || n < 0) return null;

  const unit = m[2];
  if (/^(minutes?|mins?|m)$/.test(unit)) return Math.round(n);
  if (/^(hours?|hrs?|hr|h)$/.test(unit))  return Math.round(n * 60);
  if (/^(days?|d)$/.test(unit))           return Math.round(n * 1440);
  return Math.round(n * 10080); // weeks
}

// ---------------------------------------------------------------- timezone math

// Offset (ms) between the given instant's wall-clock reading in `tz` and UTC.
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(instant)) p[type] = value;
  const asIfUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return asIfUTC - instant.getTime();
}

// A wall-clock date+time in `tz` -> the real UTC instant. Two passes so a time that
// falls near a DST transition resolves against the offset actually in force.
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = naive - tzOffsetMs(new Date(naive), tz);
  guess = naive - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

const parseDate = (s: string | null | undefined) => {
  const m = (s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
};

const parseClock = (s: string | null | undefined) => {
  const m = (s ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? { h, mi } : null;
};

function fmtClock(h: number, mi: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${ampm}`;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: JSON_HEADERS });
  }

  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return new Response(JSON.stringify({ error: "Invalid posting link" }), { status: 400, headers: JSON_HEADERS });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: link } = await db
    .from("rei_links")
    .select("org_id, window_days, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  // One message for missing, revoked and expired alike: a scanner learns nothing
  // about which tokens exist.
  const dead = !link
    || link.revoked_at !== null
    || (link.expires_at !== null && new Date(link.expires_at).getTime() <= Date.now());
  if (dead) {
    return new Response(JSON.stringify({ error: "This posting link is no longer active." }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, timezone")
    .eq("id", link.org_id)
    .single();

  const tz = org?.timezone || "UTC";
  const windowDays: number = link.window_days ?? 30;

  // Window on the ticket date, in the farm's own zone.
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
  const since = new Date(Date.parse(nowParts + "T00:00:00Z") - windowDays * 86400000)
    .toISOString().slice(0, 10);

  const { data: tickets, error: dbError } = await db
    .from("tickets")
    .select("date, field_schedule, selected_fields, chemicals, crop, target_pest, total_acres, time_start, time_end")
    .eq("org_id", link.org_id)
    .gte("date", since)
    .order("date", { ascending: false });

  if (dbError) {
    return new Response(JSON.stringify({ error: "Could not load records" }), { status: 500, headers: JSON_HEADERS });
  }

  // Ticket snapshots don't carry the formulation, so classify adjuvants by name.
  const { data: library } = await db
    .from("chemicals")
    .select("name, form_type")
    .eq("org_id", link.org_id);

  const adjuvants = new Set(
    (library ?? []).filter(c => c.form_type === "A").map(c => (c.name ?? "").trim().toLowerCase()),
  );
  const isReportable = (c: ChemSnapshot) =>
    hasEpaNumber(c.epa) && !adjuvants.has((c.name ?? "").trim().toLowerCase());

  type AppRow = {
    date: string;
    field: string;
    acres: number | null;
    crop: string;
    pest: string;
    product: string;
    activeIngredient: string;
    epa: string;
    rate: string;
    totalApplied: string;
    rei: string;
    start: string;
    end: string;
    restrictedUntil: string | null;
    reiKnown: boolean;
    estimated: boolean;
  };

  const rows: AppRow[] = [];

  for (const t of tickets ?? []) {
    const schedule: ScheduleEntry[] = t.field_schedule ?? t.selected_fields ?? [];
    const chems = ((t.chemicals ?? []) as ChemSnapshot[]).filter(isReportable);
    if (!chems.length) continue; // nothing with an REI was applied

    const pest: string = Array.isArray(t.target_pest)
      ? t.target_pest.join(", ")
      : typeof t.target_pest === "string"
        ? (() => { try { const p = JSON.parse(t.target_pest); return Array.isArray(p) ? p.join(", ") : t.target_pest; } catch { return t.target_pest; } })()
        : "";

    const fieldList = schedule.length ? schedule : [{ name: "—", acres: t.total_acres }];

    for (const fs of fieldList) {
      // Anchor on the actual finish for this field; fall back to the schedule and
      // flag it, because a missing actual must not read as "no restriction".
      const hasActual = !!(fs.actualTimeEnd || fs.actualDateEnd);
      const dateStr = fs.actualDateEnd || fs.actualDateStart || t.date;
      const endStr  = fs.actualTimeEnd  || fs.timeEnd  || t.time_end;
      const startStr = fs.actualTimeStart || fs.timeStart || t.time_start;

      const date  = parseDate(dateStr);
      const end   = parseClock(endStr);
      const start = parseClock(startStr);

      let endInstant: Date | null = null;
      if (date && end) {
        // An end earlier than the start on the same date is an overnight job:
        // roll it to the next day rather than producing a negative interval.
        const overnight = !!start && (end.h * 60 + end.mi) < (start.h * 60 + start.mi) && !fs.actualDateEnd;
        endInstant = zonedToUtc(date.y, date.mo, date.d + (overnight ? 1 : 0), end.h, end.mi, tz);
      }

      const acresNum = parseFloat(String(fs.acres ?? ""));

      for (const c of chems) {
        const mins = reiMinutes(c.rei);
        const rateNum = parseFloat(String(c.ratePerAcre ?? ""));
        const totalApplied = isFinite(rateNum) && rateNum > 0 && isFinite(acresNum) && acresNum > 0
          ? `${(rateNum * acresNum).toFixed(2)} ${c.unit ?? ""}`.trim()
          : "";

        rows.push({
          date: dateStr ?? "",
          field: fs.name ?? "—",
          acres: isFinite(acresNum) ? Number(acresNum.toFixed(2)) : null,
          crop: t.crop ?? "",
          pest,
          product: c.name ?? "",
          activeIngredient: c.activeIngredient ?? "",
          epa: c.epa ?? "",
          rate: c.ratePerAcre != null && c.ratePerAcre !== "" ? `${c.ratePerAcre} ${c.unit ?? ""}/ac`.trim() : "",
          totalApplied,
          rei: (c.rei ?? "").trim(),
          start: start ? fmtClock(start.h, start.mi) : "",
          end: end ? fmtClock(end.h, end.mi) : "",
          restrictedUntil: endInstant && mins !== null
            ? new Date(endInstant.getTime() + mins * 60000).toISOString()
            : null,
          reiKnown: mins !== null,
          estimated: !hasActual,
        });
      }
    }
  }

  // One verdict per field: restricted until the LONGEST re-entry still outstanding
  // on it. A field whose REI could not be read is reported unknown, never safe.
  const byField = new Map<string, { field: string; restrictedUntil: string | null; unknown: boolean; lastApplied: string }>();
  for (const r of rows) {
    const cur = byField.get(r.field) ?? { field: r.field, restrictedUntil: null, unknown: false, lastApplied: r.date };
    if (r.restrictedUntil && (!cur.restrictedUntil || r.restrictedUntil > cur.restrictedUntil)) {
      cur.restrictedUntil = r.restrictedUntil;
    }
    if (!r.reiKnown) cur.unknown = true;
    if (r.date > cur.lastApplied) cur.lastApplied = r.date;
    byField.set(r.field, cur);
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.field.localeCompare(b.field)));

  return new Response(JSON.stringify({
    org: { name: org?.name ?? "", timezone: tz, timezoneSet: !!org?.timezone },
    windowDays,
    generatedAt: new Date().toISOString(),
    fields: Array.from(byField.values()).sort((a, b) => a.field.localeCompare(b.field)),
    applications: rows,
  }), {
    headers: { ...JSON_HEADERS, "Cache-Control": "no-store" },
  });
});
