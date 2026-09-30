import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = "claude-sonnet-5";
// Sonnet 5 thinks adaptively by default and thinking counts toward max_tokens,
// so limits need headroom beyond the visible reply.
const MAX_TOKENS = 16000;
const EFFORT = { effort: "medium" as const };
const WEB_SEARCH = { type: "web_search_20260209", name: "web_search" };

// Product data comes from the operator's chemical library, taken from the actual labels.
const VERIFIED_LABEL_DATA =
  'Each product includes its EPA Reg No, active ingredient, and formulation code from the operator\'s chemical library, ' +
  'transcribed from the product labels. Treat these values as authoritative. Never infer, guess, or substitute an active ingredient ' +
  'from a product name, brand family, or manufacturer. If a product\'s activeIngredient is blank, say its active ingredient is not ' +
  'on file and make no claims that depend on it. Refer to each product by its name and the provided active ingredient. ';

type LabelChem = { name: string; epa?: string; activeIngredient?: string; formType?: string };

// ── Farm records lookup for the chat advisor ──────────────────────────────────
// Queries run with the caller's own login, so row-level security limits them to
// that user's organization. Heavy columns (boundaries, GPS tracks, raw payloads) are left out.
const RECORD_TABLES: Record<string, { table: string; columns: string }> = {
  tickets: { table: "tickets", columns:
    "id, ticket_number, date, time_start, time_end, crop, target_pest, wind_speed, wind_dir, air_temp, tank_size, pressure, " +
    "gal_per_acre, equipment_type, licensed_applicant, licensed_applicant_license, non_licensed_applicant, notes, total_acres, " +
    "full_loads, partial_loads, partial_acres, acre_loads, chemicals, field_schedule, acres_per_hour, queue_status, created_at" },
  fields:                   { table: "fields", columns: "id, name, acres, crop, traits, centroid_lat, centroid_lng" },
  chemicals:                { table: "chemicals", columns: "id, name, epa, active_ingredient, rei, unit, form_type, rate_min, rate_max, container_size" },
  equipment:                { table: "equipment", columns: "id, name, acres_per_hour" },
  licensed_applicators:     { table: "licensed_applicators", columns: "id, name, license" },
  non_licensed_applicators: { table: "non_licensed_applicators", columns: "id, name" },
  pests:                    { table: "pests", columns: "id, name" },
  crop_seasons:             { table: "crop_seasons", columns: "crop_name, season" },
  organization:             { table: "organizations", columns: "name, farm_zip, farm_lat, farm_lng, crops, unit_system" },
  farmmobile_spray_records: { table: "farmmobile_efr", columns: "efr_fmid, fld_nm, fld_fmid, product, spray_acre, bound_acre, avg_rate, sp_strt, sp_end, synced_at" },
  farmmobile_operations:    { table: "farmmobile_pucs", columns: "puc_fmid, puc_name, operation_date, time_start, time_end, coverage_acres, avg_rate_gpa, synced_at" },
};
const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "is"] as const;
const MAX_RESULT_CHARS = 120_000;

const QUERY_TOOL = {
  name: "query_records",
  description:
    "Look up this operation's farm records. Tables: tickets (application tickets; date is YYYY-MM-DD text; " +
    "chemicals lists products with rates, EPA #, active ingredient and per-tank amounts; field_schedule lists each field on the ticket " +
    "with its acres, planned and actual start/end times, dates and field weather), fields (field library: acres, crop, traits), " +
    "chemicals (chemical library with label data), equipment, licensed_applicators, non_licensed_applicators, pests, crop_seasons, " +
    "organization (farm settings), farmmobile_spray_records (as-applied records synced from FarmMobile: field, product, sprayed acres, " +
    "average rate, start/end), farmmobile_operations (FarmMobile machine operations). Filters combine with AND. Use ilike with % wildcards " +
    "for partial, case-insensitive text matches. JSON columns such as chemicals and field_schedule can't be filtered; fetch the tickets " +
    "and read them. For questions spanning many tickets, pass columns to fetch only what you need (e.g. ticket_number, date, chemicals). " +
    "Call this as many times as needed.",
  input_schema: {
    type: "object",
    properties: {
      table: { type: "string", enum: Object.keys(RECORD_TABLES) },
      columns: { type: "array", items: { type: "string" }, description: "Only these columns (default: all useful columns)" },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            column: { type: "string" },
            op: { type: "string", enum: FILTER_OPS },
            value: { type: ["string", "number", "boolean", "null"] },
          },
          required: ["column", "op", "value"],
        },
      },
      order_by: { type: "string", description: "Column to sort by" },
      descending: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Default 200" },
    },
    required: ["table"],
  },
};

type QueryInput = {
  table: string;
  columns?: string[];
  filters?: { column: string; op: typeof FILTER_OPS[number]; value: string | number | boolean | null }[];
  order_by?: string;
  descending?: boolean;
  limit?: number;
};

// Ticket JSON snapshots carry more than answers need — keep the useful keys
function slimTicket(t: Record<string, unknown>) {
  const pick = (o: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(keys.filter(k => o?.[k] !== undefined && o?.[k] !== "").map(k => [k, o[k]]));
  const out: Record<string, unknown> = { ...t };
  if ("chemicals" in t)
    out.chemicals = ((t.chemicals as Record<string, unknown>[]) || []).map(c => pick(c,
      ["name", "epa", "activeIngredient", "rei", "ratePerAcre", "unit", "totalPerTankFmt", "partialPerTankFmt", "partialAcres"]));
  if ("field_schedule" in t)
    out.field_schedule = ((t.field_schedule as Record<string, unknown>[]) || []).map(fs => pick(fs,
      ["name", "acres", "timeStart", "timeEnd", "actualTimeStart", "actualTimeEnd", "actualDateStart", "actualDateEnd", "fieldWeather"]));
  return out;
}

// deno-lint-ignore no-explicit-any
async function runRecordQuery(db: any, input: QueryInput): Promise<{ content: string; isError?: boolean }> {
  const spec = RECORD_TABLES[input.table];
  if (!spec) return { content: `Unknown table "${input.table}".`, isError: true };
  const allowed = spec.columns.split(",").map(c => c.trim());
  const bad = [...(input.filters || []).map(f => f.column), ...(input.order_by ? [input.order_by] : [])]
    .concat(input.columns || [])
    .filter(c => !allowed.includes(c));
  if (bad.length) return { content: `Unknown column(s) for ${input.table}: ${bad.join(", ")}. Columns: ${allowed.join(", ")}`, isError: true };

  let q = db.from(spec.table).select(input.columns?.length ? input.columns.join(", ") : spec.columns);
  for (const f of input.filters || []) {
    if (!FILTER_OPS.includes(f.op)) return { content: `Unsupported filter op "${f.op}".`, isError: true };
    q = q[f.op](f.column, f.value);
  }
  if (input.order_by) q = q.order(input.order_by, { ascending: !input.descending });
  q = q.limit(Math.min(Math.max(input.limit || 200, 1), 500));

  const { data, error } = await q;
  if (error) return { content: `Query failed: ${error.message}`, isError: true };
  const rows = input.table === "tickets" ? (data || []).map(slimTicket) : (data || []);
  const json = JSON.stringify({ table: input.table, row_count: rows.length, rows });
  if (json.length > MAX_RESULT_CHARS) {
    return { content: `${rows.length} rows is too much data to return at once. Narrow it with filters (e.g. a date range or field name) or a smaller limit.`, isError: true };
  }
  return { content: json };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { action, ...payload } = body as { action: string; [key: string]: unknown };
  let systemPrompt: string;
  let userMessage: string;
  let useWebSearch = false;

  switch (action) {
    case "fill-ticket": {
      const { text, fieldLib, chemLib } = payload as {
        text: string;
        fieldLib: { id: number; name: string; crop: string }[];
        chemLib: { id: number; name: string; unit: string }[];
      };
      systemPrompt =
        'You parse natural language spray instructions into structured form data. ' +
        'Return ONLY valid JSON with no extra text or markdown: ' +
        '{"fields":[<field ids>],"chemRows":[{"chemId":<id>,"rate":"<number>","unit":"<unit>"}],"targetPest":["<pest>"]}. ' +
        'Use only IDs from the provided libraries. Match field names and chemical names loosely (e.g. "Roundup" matches "Roundup PowerMAX 3"). ' +
        'Return empty arrays for any section you cannot confidently fill.';
      userMessage =
        `Fields library: ${JSON.stringify(fieldLib)}\n` +
        `Chemical library: ${JSON.stringify(chemLib)}\n` +
        `Instruction: ${text}`;
      break;
    }

    case "compatibility": {
      const { products } = payload as { products: LabelChem[] };
      systemPrompt =
        'You are an agrochemical tank mix compatibility expert. ' +
        VERIFIED_LABEL_DATA +
        'Using the provided active ingredients, label knowledge, and university extension research, ' +
        'assess whether the listed products can be safely mixed in the same tank. ' +
        'Only report issues you are confident apply to these specific active ingredients and formulations. ' +
        'Do not give mixing-order instructions; the app prints the WALES mixing order separately. ' +
        'Return ONLY valid JSON with no extra text or markdown: ' +
        '{"compatible":<boolean>,"warnings":["<one sentence per issue — reference product name and active ingredient, never EPA numbers>"]}. ' +
        'Keep each warning concise (one sentence). Return an empty warnings array if there are no known issues.';
      userMessage = `Check tank mix compatibility of these products: ${JSON.stringify(products)}`;
      break;
    }

    case "suggest-chems": {
      const { crop, pest, month, equipment, chemLib } = payload as {
        crop: string;
        pest: string;
        month: string;
        equipment: string;
        chemLib: (LabelChem & { id: number })[];
      };
      systemPrompt =
        'You are a crop protection specialist for row-crop production. ' +
        VERIFIED_LABEL_DATA +
        'Select the best products from the provided library to control the listed pest(s) on the given crop. ' +
        'Factor in: crop growth stage typical for the given month, equipment type (e.g. ground rig vs. aerial affects rate and coverage), ' +
        'and whether the product is labeled for that crop and pest combination. ' +
        'Only suggest products that appear in the provided library. Rank by efficacy and fit. ' +
        'Return ONLY valid JSON, no markdown: ' +
        '{"suggestions":[{"chemId":<id>,"reason":"<one tight sentence: product name, why it fits this crop/pest/timing>"}]}. ' +
        'Return an empty suggestions array if nothing in the library is appropriate.';
      userMessage =
        `Crop: ${crop}\n` +
        `Month: ${month}\n` +
        `Equipment: ${equipment || "ground rig"}\n` +
        `Target pest/weed/disease: ${pest}\n` +
        `Chemical library: ${JSON.stringify(chemLib)}`;
      break;
    }

    case "chat-tickets": {
      const { question, ticketData } = payload as {
        question: string;
        ticketData: unknown[];
      };
      systemPrompt =
        'You answer questions about pesticide application records for a farm. ' +
        'Give a direct, concise answer in one or two sentences. ' +
        'Do NOT show calculations, intermediate steps, or reasoning — only the final answer. ' +
        'Your entire response must be exactly one raw JSON object, nothing else before or after it. ' +
        'No prose outside the JSON, no markdown, no code fences. ' +
        'Format: {"answer":"<one or two sentence answer>"}.';
      userMessage =
        `Application records: ${JSON.stringify(ticketData)}\n` +
        `Question: ${question}`;
      break;
    }

    case "suggest-adjuvants": {
      const { products } = payload as { products: LabelChem[] };
      systemPrompt =
        'You are a pesticide label expert. Given a list of pesticide products in a tank mix, ' +
        'identify any adjuvants or surfactants that are required or strongly recommended by the product labels. ' +
        VERIFIED_LABEL_DATA +
        'Use the provided active ingredient and EPA Reg No to identify each label, then its adjuvant requirements. ' +
        'In each summary, name the product and its provided active ingredient. ' +
        'Include required non-ionic surfactants (NIS), crop oil concentrates (COC), methylated seed oils (MSO), ' +
        'ammonium sulfate (AMS), or any other adjuvants specified on the labels. ' +
        'Only include adjuvants that are label-required or label-recommended — do not invent generic suggestions. ' +
        'Return ONLY a raw JSON object, no markdown, no code fences: ' +
        '{"adjuvants":[{"name":"<adjuvant type abbreviation only e.g. NIS>","rate":"<label rate e.g. 0.25% v/v>","summary":"<concise one-line e.g. Volunteer requires NIS at 0.25% v/v>"}]}. ' +
        'Return an empty adjuvants array if none are required or recommended.';
      userMessage = `Tank mix products: ${JSON.stringify(products)}`;
      break;
    }

    case "crop-safety": {
      const { fields, chemicals: chems } = payload as {
        fields: { name: string; crop: string; traits: string[]; season: string }[];
        chemicals: LabelChem[];
      };
      systemPrompt =
        'You are a strict pesticide label compliance checker for row-crop production. ' +
        VERIFIED_LABEL_DATA +
        'Apply these rules MECHANICALLY — do not hedge, do not assume the farmer knows what they are doing, flag every violation.\n\n' +
        'SKIP pre_season and post_harvest fields entirely. Only check fields where season = "in_season".\n\n' +
        'RULE 1 — TRAIT VIOLATIONS. Use each product\'s provided active ingredient, then apply:\n' +
        '• Glyphosate products (Roundup PowerMAX, Roundup WeatherMAX, Touchdown, Credit, Durango, any "glyphosate" generic): ' +
        'REQUIRES trait "glyphosate". Flag if "glyphosate" is NOT in the field\'s traits array.\n' +
        '• Glufosinate products (Liberty 280, Ignite 280, Reckon 280 SL, any "glufosinate" generic): ' +
        'REQUIRES trait "glufosinate". Flag if "glufosinate" is NOT in the field\'s traits array.\n' +
        '• 2,4-D products (Enlist One, Enlist Duo, any "2,4-D" label) on COTTON or CORN: ' +
        'REQUIRES trait "2,4-D". Flag if "2,4-D" is NOT in the field\'s traits array. ' +
        'Conventional corn is NOT Enlist tolerant — flag if trait is missing.\n' +
        '• Dicamba products (XtendiMax, Engenia, Tavium, Fexapan, any "dicamba" label): ' +
        'REQUIRES trait "dicamba". Flag if "dicamba" is NOT in the field\'s traits array.\n' +
        'An empty traits array [] means the field is conventional — flag ALL four categories above.\n' +
        'Soybean follows identical trait rules as Cotton: requires "glyphosate", "glufosinate", "2,4-D", or "dicamba" trait respectively. ' +
        'An empty traits array means conventional soybeans — flag ALL four.\n' +
        'Grain Sorghum (crop = "Grain") with NO traits or trait "non-gmo": conventional — always flag glyphosate, glufosinate, 2,4-D, and dicamba.\n' +
        'Grain Sorghum with trait "double-team": tolerant to quizalofop (Aggressor/Sequence) ONLY — still flag glyphosate, glufosinate, 2,4-D, dicamba.\n' +
        'Grain Sorghum with trait "inzen": tolerant to nicosulfuron (Zest) ONLY — still flag glyphosate, glufosinate, 2,4-D, dicamba.\n\n' +
        'RULE 2 — GRASS KILLERS ON GRASS CROPS. These active ingredients KILL corn and grain sorghum:\n' +
        '• Clethodim (Select Max, Volunteer, Arrow, Select 2 EC)\n' +
        '• Sethoxydim (Poast Ultra, Poast Plus)\n' +
        '• Fluazifop (Fusilade DX)\n' +
        '• Quizalofop (Aggressor, Sequence): safe ONLY on Grain Sorghum with trait "double-team"\n' +
        '• Nicosulfuron (Zest): safe ONLY on Grain Sorghum with trait "inzen"\n' +
        'Flag any of the above on Corn or Grain Sorghum fields unless the matching trait exception applies.\n\n' +
        'Return ONLY a raw JSON object, no markdown, no code fences:\n' +
        '{"violations":[{"field":"<field name>","chemical":"<product name>","reason":"<one sentence: active ingredient + specific rule violated>"}]}\n' +
        'Never mention EPA numbers in the reason text. Return empty array if no violations.';
      userMessage =
        `Fields: ${JSON.stringify(fields)}\n` +
        `Chemicals to apply: ${JSON.stringify(chems)}`;
      break;
    }

    case "advisor": {
      const { question, history } = payload as {
        question: string;
        history: { role: string; content: string }[];
      };
      const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

      const advisorSystem =
        'You are the farm records advisor for this operation. You can look up all of its records with the query_records tool: ' +
        'application tickets (with per-field start/stop times and field weather), the field library, chemical library, equipment, ' +
        'applicators, pests, crop seasons, farm settings and FarmMobile as-applied records. ' +
        `Today is ${today} (US Central). Ticket dates are YYYY-MM-DD.\n\n` +
        'Always look records up before answering a question about them; never answer from memory or guess. If one lookup ' +
        'isn\'t enough, make more. If the records don\'t contain the answer, say so in one sentence.\n' +
        'Chemical active ingredients and EPA numbers come from the chemicals table or the ticket\'s chemical list, taken from the ' +
        'product labels. Treat them as authoritative and never infer an active ingredient from a product name.\n\n' +
        'Rules for every response:\n' +
        '1. Give the direct answer first. Skip calculation steps and per-ticket breakdowns unless the user asks for them.\n' +
        '2. Don\'t mention EPA registration numbers unless the user asks for them.\n' +
        '3. Use plain conversational language, no markdown asterisks; use a short list only when the user asked for several items.\n' +
        '4. Keep it short: one or two sentences for simple questions.\n' +
        '5. For totals or sums, state the final number (e.g. "You have applied 229 qt of Roundup this season.").\n' +
        'Do all math accurately against the records.\n\n' +
        'CROP SAFETY — these rules are absolute and override any recommendation:\n' +
        'NEVER recommend clethodim (Select Max, Volunteer, Arrow, Select 2EC), sethoxydim (Poast Ultra, Poast Plus), ' +
        'or fluazifop (Fusilade DX) on corn or grain sorghum — these products kill corn and grain sorghum.\n' +
        'NEVER recommend glyphosate on corn or sorghum without confirming the crop has a glyphosate-tolerant trait.\n' +
        'NEVER recommend glufosinate (Liberty, Ignite) without a glufosinate-tolerant trait.\n' +
        'NEVER recommend dicamba (XtendiMax, Engenia, Tavium) without a dicamba-tolerant trait.\n' +
        'NEVER recommend 2,4-D (Enlist One) without a 2,4-D-tolerant trait.\n' +
        'If the user asks for a recommendation that would violate these rules, refuse that specific product and explain why in one sentence.';

      // The conversation has to open with a user turn
      const priorTurns = (history || []).filter(m => m.content);
      while (priorTurns.length && priorTurns[0].role !== "user") priorTurns.shift();
      // deno-lint-ignore no-explicit-any
      const messages: any[] = [
        ...priorTurns.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: question },
      ];

      let answerText = "";
      for (let turn = 0; turn < 10; turn++) {
        const resp = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: EFFORT,
          system: advisorSystem,
          tools: [QUERY_TOOL],
          messages,
        } as Parameters<typeof client.messages.create>[0]);

        // Keep the full assistant turn (including thinking blocks) so the next request stays valid
        messages.push({ role: "assistant", content: resp.content });
        answerText = resp.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { type: string; text?: string }) => b.text ?? "")
          .join("");

        if (resp.stop_reason === "refusal") { answerText = "I can't help with that request."; break; }
        if (resp.stop_reason !== "tool_use") break;

        // deno-lint-ignore no-explicit-any
        const toolUses = resp.content.filter((b: any) => b.type === "tool_use");
        const results = await Promise.all(toolUses.map(async (tu: { id: string; name: string; input: QueryInput }) => {
          const r = tu.name === "query_records"
            ? await runRecordQuery(db, tu.input)
            : { content: `Unknown tool ${tu.name}`, isError: true };
          return { type: "tool_result", tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        }));
        messages.push({ role: "user", content: results });
      }

      return new Response(
        JSON.stringify({ result: JSON.stringify({ answer: answerText || "I couldn't finish looking that up. Try asking a narrower question." }) }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    case "scan-label": {
      const { imageBase64, mediaType, crops } = payload as { imageBase64: string; mediaType: string; crops?: string[] };
      const cropContext = crops && crops.length > 0
        ? `The farm grows these crops: ${crops.join(", ")}. `
        : "";
      const scanSystemPrompt =
        'You are a pesticide label reader and agrochemical expert. ' +
        'Extract fields from the label image, then use your training knowledge of the product to determine the REI. ' +
        'Return ONLY valid JSON with no extra text or markdown: ' +
        '{"name":"<retail product name>","epa":"<EPA Reg No or NA>","rei":"<REI with units e.g. 12 hours>","unit":"<oz|dry oz|lb>","formType":"<L|E|S|WDG|WP|D|A>","containerSize":"<number or blank>","activeIngredient":"<active ingredient(s) with percentages, or NA>"}. ' +
        'Active ingredient rule: read it from the "ACTIVE INGREDIENT(S)" panel printed on the label and copy it verbatim, ' +
        'including each percentage by weight — e.g. "Glyphosate, potassium salt 48.7%" or "S-metolachlor 33.0%, Atrazine 26.1%". ' +
        'Texas TDA records require this. If the panel is not legible, fall back to your training knowledge of that EPA Reg No; ' +
        'if the product is an adjuvant or surfactant with no registered active ingredient, use NA. ' +
        'REI rule: DO NOT try to read REI from the image — front labels almost never show it. ' +
        'Instead, identify the product by name and EPA number, then state the standard REI from your training knowledge. ' +
        cropContext +
        'If the REI differs by crop, use the longest REI applicable to the crops listed above. ' +
        'If the product is unknown and REI cannot be determined, use NA. ' +
        'Formulation mapping — use these codes: ' +
        'Flowable/Suspension Concentrate/SC → L; ' +
        'Emulsifiable Concentrate/EC → E; ' +
        'Soluble Liquid/SL/Soluble Concentrate → S; ' +
        'Water Dispersible Granule/WDG/DF/Dry Flowable → WDG; ' +
        'Wettable Powder/WP → WP; ' +
        'Adjuvant/Surfactant/Spreader-Sticker → A. ' +
        'Unit: use oz for liquid products, dry oz for dry-ounce-measured products, lb for pound-measured products. ' +
        'containerSize: the size of one container (numeric, in gal for liquid or lb for dry/lb), blank if not shown. ' +
        'For all other fields not visible on the label use NA for text fields or blank for containerSize.';
      const visionResp = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        system: scanSystemPrompt,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg"|"image/png"|"image/webp"|"image/gif", data: imageBase64 },
          }, { type: "text", text: "Extract the pesticide label fields." }],
        }],
      } as Parameters<typeof client.messages.create>[0]);
      let raw = visionResp.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text?: string }) => b.text ?? "")
        .join("");
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      const m = raw.match(/\{[\s\S]*\}/);
      return new Response(
        JSON.stringify({ result: m ? m[0] : raw }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    case "research": {
      const { crop, topicId } = payload as { crop: string; topicId: string };
      const TOPIC_QUERIES: Record<string,string> = {
        chemicals: "new herbicide fungicide insecticide chemistry",
        pest:      "pest disease management resistance",
        agronomy:  "agronomic practices planting population tillage",
        variety:   "new variety hybrid seed performance trial",
        irrigation:"water irrigation scheduling deficit",
      };
      const TOPIC_LABELS: Record<string,string> = {
        chemicals: "New Chemicals", pest: "Pest & Disease",
        agronomy: "Agronomy & Tactics", variety: "Variety Research", irrigation: "Water & Irrigation",
      };
      const cropPart  = crop === "All" ? "cotton corn grain sorghum" : crop;
      const topicPart = TOPIC_QUERIES[topicId] || "research extension";
      const topicLabel = TOPIC_LABELS[topicId] || topicId;
      const query = `${cropPart} ${topicPart} 2024 2025 research extension`;
      useWebSearch = true;
      systemPrompt =
        'You are an agricultural research assistant helping a crop producer stay current on research and extension publications. ' +
        'Search the web and return a JSON array of exactly 2 high-quality, recent research articles or extension publications. ' +
        'Return ONLY valid JSON — no markdown, no backticks, no preamble. Each object must have: ' +
        'title (string), source (string — publication or university), year (string e.g. "2025"), ' +
        'crop (string: "Cotton", "Corn", "Sorghum", or "General"), topic (string — brief label), ' +
        'summary (string — 3-5 sentences, plain language, actionable for a working farmer), url (string or ""). ' +
        'Prioritize: land-grant university extension services, USDA ARS, Delta Farm Press, Progressive Farmer, and regional ag publications. Prefer 2023-2025 sources.';
      userMessage =
        `Find 2 of the best recent research or extension articles on: ${topicLabel} for ${crop} production.\n` +
        `Web search query: "${query}"\n` +
        `Return exactly 2 results as a JSON array.`;
      break;
    }

    case "sector-chat": {
      const { question, history } = payload as {
        question: string;
        history: { role: "user" | "assistant"; content: string }[];
      };
      const sectorSystem =
        'You are a senior agricultural application sector advisor specializing in row-crop production. ' +
        'Always respond with a formal, structured report using these exact markdown sections:\n\n' +
        '## Summary\n' +
        'One to three sentences with the direct answer.\n\n' +
        '### Key Insights\n' +
        'Bullet points with the most actionable findings.\n\n' +
        '### Supporting Detail\n' +
        'Elaboration, data, regional context, or caveats.\n\n' +
        '### Recommendations\n' +
        'Numbered list of concrete next steps for the operator.\n\n' +
        '---\n' +
        '*Report prepared by Application Sector Advisor*\n\n' +
        'Use precise agronomic language. Cite extension sources where relevant. Never use a conversational tone.';

      const sectorMessages = [
        ...(history || []),
        { role: "user" as const, content: question as string },
      ];

      const sectorResp = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: EFFORT,
        system: sectorSystem,
        messages: sectorMessages,
        tools: [WEB_SEARCH],
      } as Parameters<typeof client.messages.create>[0]);

      const answerText = sectorResp.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text?: string }) => b.text ?? "")
        .join("\n");

      return new Response(
        JSON.stringify({ answer: answerText }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
  }

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: EFFORT,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    ...(useWebSearch ? { tools: [WEB_SEARCH] } : {}),
  } as Parameters<typeof client.messages.create>[0]);

  // Filter for text blocks — web search responses have mixed block types
  const rawText = resp.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { type: string; text?: string }) => b.text ?? "")
    .join("\n");

  // Strip markdown code fences Claude sometimes adds despite instructions
  let stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Validate it parses as JSON; if not, try to extract a JSON object or array from within the text
  try {
    JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\[[\s\S]*\]/) || stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        JSON.parse(match[0]);
        stripped = match[0];
      } catch { /* fall through */ }
    }
    // If still not valid JSON, wrap as answer for chat-tickets or return error
    try {
      JSON.parse(stripped);
    } catch {
      if (action === "chat-tickets") {
        stripped = JSON.stringify({ answer: stripped });
      } else {
        stripped = JSON.stringify({ error: "Model returned non-JSON response", raw: stripped });
      }
    }
  }

  return new Response(
    JSON.stringify({ result: stripped }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
