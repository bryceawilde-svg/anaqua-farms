import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

const HEADERS = [
  "Date", "Ticket #", "Time Start", "Time End",
  "Field", "Acres", "Crop / Site", "Target Pest",
  "Wind Speed (mph)", "Wind Dir", "Air Temp (°F)",
  "Equipment", "Licensed Applicator", "License #", "Non-Licensed Applicator",
  "Product Name", "EPA Reg #", "REI", "Rate/Acre", "Unit", "Total Applied",
  "Notes",
];

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let email: string, password: string;
  try {
    ({ email, password } = await req.json());
    if (!email || !password) throw new Error("missing credentials");
  } catch {
    return new Response(JSON.stringify({ error: "email and password required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Check pro plan (user OR org)
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", authData.user.id)
    .single();

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("organizations(plan)")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  const orgPlan = (membership?.organizations as { plan?: string } | null)?.plan;
  const isPro   = profile?.plan === "pro" || orgPlan === "pro";

  if (!isPro) {
    return new Response(JSON.stringify({ error: "Pro plan required" }), {
      status: 403, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: tickets, error: dbError } = await supabase
    .from("tickets")
    .select("*")
    .order("date", { ascending: false });

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Flatten into one row per field × chemical, with Total Applied calculated
  const rows: (string | number)[][] = [];

  for (const t of tickets ?? []) {
    const schedule: { name: string; acres: string | number; timeStart?: string; timeEnd?: string }[] =
      t.field_schedule ?? t.selected_fields ?? [];
    const chems: { name?: string; epa?: string; rei?: string; ratePerAcre?: string | number; unit?: string }[] =
      t.chemicals ?? [];
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

  return new Response(JSON.stringify({ headers: HEADERS, rows }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
