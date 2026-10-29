/**
 * One-time backfill: bring each ticket's stored chemical snapshot in line with the
 * corrected chemical library — adds the active ingredient and corrects EPA # and REI.
 *
 * TDA records must list the active ingredient, and tickets saved before that field
 * existed carry only name/epa/rei. Matching is by product NAME only — historical
 * snapshots sometimes hold a stale or mistyped EPA # for the same product.
 *
 * When an EPA # or REI is corrected, the value originally recorded is kept on the
 * snapshot as `epaOriginal` / `reiOriginal` (set once, never overwritten), so the
 * record still shows what was written at the time. Reports don't read those keys.
 *
 * Scoped to one org: the service-role key bypasses RLS and this project hosts
 * more than one farm, so --org is required to avoid touching another org's data.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/backfill-ticket-active-ingredient.cjs --org <uuid> --dry-run
 *   ... --org <uuid> --apply
 *
 * Idempotent: re-running only changes snapshots that still differ from the library.
 */
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const ORG = (process.argv[process.argv.indexOf("--org") + 1] || "").trim();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
if (!APPLY && !process.argv.includes("--dry-run")) {
  console.error("Pass --dry-run to preview or --apply to write.");
  process.exit(1);
}
if (!/^[0-9a-f-]{36}$/i.test(ORG)) {
  console.error("Pass --org <uuid>. Required: the service-role key sees every org on this project.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const key = s => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const clean = v => (v == null ? "" : String(v).trim());

async function main() {
  const { data: chems, error: cErr } = await supabase
    .from("chemicals").select("name, epa, rei, active_ingredient").eq("org_id", ORG);
  if (cErr) throw cErr;

  // Name -> corrected label values. Abort on a genuine conflict rather than guessing.
  const lib = new Map();
  const conflicts = [];
  for (const c of chems) {
    const entry = { ai: clean(c.active_ingredient), epa: clean(c.epa), rei: clean(c.rei) };
    const k = key(c.name);
    const prev = lib.get(k);
    if (prev && JSON.stringify(prev) !== JSON.stringify(entry)) conflicts.push(c.name);
    else lib.set(k, entry);
  }
  if (conflicts.length) {
    console.error("Ambiguous library entries — same product name, different label values:");
    conflicts.forEach(n => console.error("  " + n));
    console.error("Resolve these in the Chems tab, then re-run.");
    process.exit(1);
  }
  console.log(`Org ${ORG}`);
  console.log(`Library: ${chems.length} chemicals, ${[...lib.values()].filter(e => e.ai).length} with an active ingredient.\n`);

  const { data: tickets, error: tErr } = await supabase
    .from("tickets").select("id, ticket_number, chemicals").eq("org_id", ORG).order("ticket_number");
  if (tErr) throw tErr;

  const count = { ai: 0, epa: 0, rei: 0 };
  const changes = new Map();
  const unmatched = new Map();
  const updates = [];
  const note = (label) => changes.set(label, (changes.get(label) || 0) + 1);

  for (const t of tickets) {
    if (!Array.isArray(t.chemicals) || !t.chemicals.length) continue;
    let touched = false;

    const next = t.chemicals.map(el => {
      if (!el || !el.name) return el;
      const entry = lib.get(key(el.name));
      if (!entry) {
        if (!unmatched.has(el.name)) unmatched.set(el.name, []);
        unmatched.get(el.name).push(t.ticket_number);
        return el;
      }
      const out = { ...el }; // spread keeps every other snapshot key

      if (!clean(el.activeIngredient) && entry.ai) {
        out.activeIngredient = entry.ai; count.ai++;
      }
      if (entry.epa && clean(el.epa) !== entry.epa) {
        if (!("epaOriginal" in el)) out.epaOriginal = el.epa ?? null;
        out.epa = entry.epa; count.epa++;
        note(`${el.name}: EPA ${el.epa} -> ${entry.epa}`);
      }
      if (entry.rei && clean(el.rei) !== entry.rei) {
        if (!("reiOriginal" in el)) out.reiOriginal = el.rei ?? null;
        out.rei = entry.rei; count.rei++;
        note(`${el.name}: REI ${el.rei} -> ${entry.rei}`);
      }

      if (JSON.stringify(out) !== JSON.stringify(el)) touched = true;
      return out;
    });

    if (touched) updates.push({ id: t.id, chemicals: next });
  }

  console.log(`Tickets scanned:            ${tickets.length}`);
  console.log(`Tickets to update:          ${updates.length}`);
  console.log(`Active ingredients added:   ${count.ai}`);
  console.log(`EPA numbers corrected:      ${count.epa}`);
  console.log(`REIs corrected:             ${count.rei}`);
  if (changes.size) {
    console.log("\nCorrections:");
    [...changes.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}x  ${k}`));
  }
  if (unmatched.size) {
    console.log("\nNo library match by name — add or rename these in the Chems tab, then re-run:");
    for (const [name, nums] of [...unmatched.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const list = nums.slice(0, 8).map(n => `#${n}`).join(", ");
      console.log(`  ${String(nums.length).padStart(3)}x  ${name}  — ${list}${nums.length > 8 ? ", …" : ""}`);
    }
  }

  if (!APPLY) { console.log("\nDry run — nothing written. Re-run with --apply to commit."); return; }

  console.log(`\nWriting ${updates.length} tickets…`);
  for (const u of updates) {
    const { error } = await supabase.from("tickets").update({ chemicals: u.chemicals }).eq("id", u.id).eq("org_id", ORG);
    if (error) throw error;
  }
  console.log("Done.");
}

main().catch(e => { console.error("FAILED:", e.message || e); process.exit(1); });
