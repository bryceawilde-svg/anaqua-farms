// TDA records export, pulled by the Apps Script on the Google Sheet.
//
// POST with `Authorization: Bearer <export token>`; the token is minted per org in
// Account. It used to take an email and password in the request body, which meant
// the Apps Script stored an account password and this function — which is
// verify_jwt false — was a credential-stuffing target for every account in the
// project. That path is gone; a token that is revoked in the UI dies immediately.
//
// The response shape ({ headers, rows }) is unchanged, so the sheet-writing half of
// the Apps Script does not need to be touched.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

const HEADERS = [
  "Date", "Ticket #", "Time Start", "Time End",
  "Field", "Acres", "Crop / Site", "Target Pest",
  "Wind Speed (mph)", "Wind Dir", "Air Temp (°F)",
  "Equipment", "Licensed Applicator", "License #", "Non-Licensed Applicator",
  "Product Name", "Active Ingredient", "EPA Reg #", "REI", "Rate/Acre", "Unit", "Total Applied",
  "Notes",
];

// Only EPA-registered pesticides belong on the REI posting: drop adjuvants and anything
// without an EPA number. Keep in sync with reportableTickets() in AnaquaFarms_AppTicket.jsx.
const hasEpaNumber = (epa: string | null | undefined) => !/^(|n\/?a|none|-+|—)$/i.test((epa ?? "").trim());

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return fail(401, "Send an export token as 'Authorization: Bearer <token>'. Generate one in BoomLog under Account → Sheets export.");
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: row } = await db
    .from("export_tokens")
    .select("id, org_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  const dead = !row
    || row.revoked_at !== null
    || (row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now());
  if (dead) return fail(401, "This export token is no longer active.");

  const orgId: string = row.org_id;

  const { data: org } = await db
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .single();

  if (org?.plan !== "pro") return fail(403, "Pro plan required");

  // Service role bypasses RLS, so every read below MUST be scoped to this token's
  // org or the export would reach across tenants.
  const { data: tickets, error: dbError } = await db
    .from("tickets")
    .select("*")
    .eq("org_id", orgId)
    .order("date", { ascending: false });

  if (dbError) return fail(500, dbError.message);

  // Ticket snapshots don't carry the formulation, so classify adjuvants by name.
  const { data: library, error: libError } = await db
    .from("chemicals")
    .select("name, form_type")
    .eq("org_id", orgId);

  if (libError) return fail(500, libError.message);

  const adjuvants = new Set(
    (library ?? []).filter(c => c.form_type === "A").map(c => (c.name ?? "").trim().toLowerCase()),
  );
  const isReportable = (c: { name?: string; epa?: string }) =>
    hasEpaNumber(c.epa) && !adjuvants.has((c.name ?? "").trim().toLowerCase());

  // Flatten into one row per field × chemical, with Total Applied calculated
  const rows: (string | number)[][] = [];

  for (const t of tickets ?? []) {
    const schedule: { name: string; acres: string | number; timeStart?: string; timeEnd?: string }[] =
      t.field_schedule ?? t.selected_fields ?? [];
    const allChems: { name?: string; activeIngredient?: string; epa?: string; rei?: string; ratePerAcre?: string | number; unit?: string }[] =
      t.chemicals ?? [];
    const chems = allChems.filter(isReportable);
    if (allChems.length && !chems.length) continue; // nothing reportable was applied
    const pest: string = Array.isArray(t.target_pest)
      ? t.target_pest.join(", ")
      : (typeof t.target_pest === "string"
          ? (() => { try { const p = JSON.parse(t.target_pest); return Array.isArray(p) ? p.join(", ") : t.target_pest; } catch { return t.target_pest; } })()
          : "");

    const fieldList = schedule.length ? schedule : [{ name: "—", acres: t.total_acres ?? "" }];
    const chemList  = chems.length    ? chems    : [{ name: "—" }];

    for (const fs of fieldList) {
      for (const c of chemList) {
        const rateNum  = parseFloat(String(c.ratePerAcre ?? ""));
        const acresNum = parseFloat(String(fs.acres ?? ""));
        const totalApplied = (!isNaN(rateNum) && rateNum > 0 && !isNaN(acresNum) && acresNum > 0)
          ? `${(rateNum * acresNum).toFixed(2)} ${c.unit ?? ""}`.trim()
          : "";

        rows.push([
          t.date ?? "",
          t.ticket_number ?? "",
          fmtTime(fs.timeStart ?? t.time_start),
          fmtTime(fs.timeEnd   ?? t.time_end),
          fs.name ?? "",
          acresNum > 0 ? parseFloat(acresNum.toFixed(2)) : (fs.acres ?? ""),
          t.crop ?? "",
          pest,
          t.wind_speed ?? "",
          t.wind_dir   ?? "",
          t.air_temp   ?? "",
          t.equipment_type ?? "",
          t.licensed_applicant ?? "",
          t.licensed_applicant_license ?? "",
          t.non_licensed_applicant ?? "",
          c.name ?? "",
          c.activeIngredient ?? "",
          c.epa  ?? "",
          c.rei  ?? "",
          c.ratePerAcre ?? "",
          c.unit ?? "",
          totalApplied,
          t.notes ?? "",
        ]);
      }
    }
  }

  // Best effort: a failed touch must not fail the export.
  db.from("export_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id)
    .then(() => {}, () => {});

  return new Response(JSON.stringify({ headers: HEADERS, rows }), { headers: JSON_HEADERS });
});
