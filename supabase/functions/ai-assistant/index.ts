import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

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
  const model = (action === "compatibility" || action === "research")
    ? "claude-haiku-4-5-20251001"
    : "claude-sonnet-4-6";
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
      const { products } = payload as {
        products: { name: string }[];
      };
      systemPrompt =
        'You are an agrochemical tank mix compatibility expert. ' +
        'Using your training knowledge of product labels, university extension research, and known chemical interactions, ' +
        'assess whether the listed products can be safely mixed in the same tank. ' +
        'Identify each product\'s active ingredient(s) by product name. ' +
        'Return ONLY valid JSON with no extra text or markdown: ' +
        '{"compatible":<boolean>,"warnings":["<one sentence per issue — reference product name and active ingredient, never EPA numbers>"]}. ' +
        'Keep each warning concise (one sentence). Return an empty warnings array if there are no known issues.';
      userMessage = `Check tank mix compatibility of these products: ${JSON.stringify(products)}`;
      break;
    }

    case "suggest-chems": {
      const { crop, pest, chemLib } = payload as {
        crop: string;
        pest: string;
        chemLib: { id: number; name: string; formType: string; epa: string }[];
      };
      systemPrompt =
        'You suggest pesticides from a provided library for a given crop and target pest. ' +
        'Only suggest products that appear in the provided library. ' +
        'Rank by likely efficacy. Return ONLY valid JSON with no extra text or markdown: ' +
        '{"suggestions":[{"chemId":<id>,"reason":"<one sentence rationale>"}]}. ' +
        'Return an empty suggestions array if no products in the library are appropriate.';
      userMessage =
        `Crop: ${crop}\n` +
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
      const { products } = payload as {
        products: { name: string }[];
      };
      systemPrompt =
        'You are a pesticide label expert. Given a list of pesticide products in a tank mix, ' +
        'identify any adjuvants or surfactants that are required or strongly recommended by the product labels. ' +
        'Use product names to look up label requirements from your training knowledge. ' +
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
        chemicals: { name: string; epa: string }[];
      };
      systemPrompt =
        'You are a pesticide label compliance expert with comprehensive knowledge of all EPA-registered pesticide products, their labeled crops, use restrictions, and active ingredients. ' +
        'Given a list of fields (each with a crop type, herbicide tolerance traits, and growing season) and a list of chemicals (product name + EPA reg number), ' +
        'identify EVERY potential violation by checking three categories:\n\n' +
        '1. LABEL CROP VIOLATIONS — the crop is not on the product label at all, or the product is known to injure/kill that crop. ' +
        'Examples: clethodim (Select Max, Volunteer, Arrow) kills corn and grain sorghum; bromoxynil injures corn; ' +
        'many grass herbicides (sethoxydim, fluazifop, clethodim, etc.) kill grasses including corn and sorghum. ' +
        'Flag if the crop is not a registered use on that product label.\n\n' +
        '2. HERBICIDE TOLERANCE VIOLATIONS — the chemical requires a specific crop trait that the field does not have. ' +
        'Trait definitions: "glyphosate" = RR/glyphosate tolerant; "glufosinate" = LL/Liberty/glufosinate tolerant; ' +
        '"2,4-D" = Enlist/2,4-D tolerant; "dicamba" = Xtend/dicamba tolerant. ' +
        'A field with NO traits listed is conventional — flag glyphosate, glufosinate, 2,4-D, and dicamba products on it. ' +
        'Sorghum and Grain are never GMO — flag those same active ingredients regardless of traits listed.\n\n' +
        '3. EPA NUMBER LOOKUP — use the EPA registration number to confirm the active ingredient when the product name is ambiguous ' +
        '(e.g. EPA 264-829 = Reckon 280 SL = glufosinate-ammonium). Do not rely on product names alone.\n\n' +
        'SEASON RULE — each field has a season: "in_season", "pre_season", or "post_harvest".\n' +
        'If a field\'s season is "pre_season" or "post_harvest", DO NOT flag chemicals that would injure or kill that crop — ' +
        'the crop is not actively growing and applying these chemicals to manage volunteer plants is intentional and acceptable. ' +
        'Only flag violations for fields where season is "in_season".\n\n' +
        'Return ONLY a raw JSON object, no markdown, no code fences: ' +
        '{"violations":[{"field":"<field name>","chemical":"<product name>","reason":"<one concise sentence — state the product name, its active ingredient, and the specific issue>"}]}. ' +
        'IMPORTANT: Never mention EPA registration numbers anywhere in your response text. ' +
        'Return an empty violations array if there are no issues.';
      userMessage =
        `Fields: ${JSON.stringify(fields)}\n` +
        `Chemicals to apply: ${JSON.stringify(chems)}`;
      break;
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
        '{"name":"<retail product name>","epa":"<EPA Reg No or NA>","rei":"<REI with units e.g. 12 hours>","unit":"<oz|dry oz|lb>","formType":"<L|E|S|WDG|WP|D|A>","containerSize":"<number or blank>"}. ' +
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: scanSystemPrompt,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg"|"image/png"|"image/webp"|"image/gif", data: imageBase64 },
          }, { type: "text", text: "Extract the pesticide label fields." }],
        }],
      });
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
        'You are an agricultural research assistant helping a Texas crop producer stay current on research for cotton, corn, and grain sorghum in the South Texas / Rio Grande Valley region. ' +
        'Search the web and return a JSON array of exactly 2 high-quality, recent research articles or extension publications. ' +
        'Return ONLY valid JSON — no markdown, no backticks, no preamble. Each object must have: ' +
        'title (string), source (string — publication or university), year (string e.g. "2025"), ' +
        'crop (string: "Cotton", "Corn", "Sorghum", or "General"), topic (string — brief label), ' +
        'summary (string — 3-5 sentences, plain language, actionable for a working farmer), url (string or ""). ' +
        'Prioritize: Texas A&M AgriLife Extension, USDA ARS, university extension, Delta Farm Press, Progressive Farmer. Prefer 2023-2025 sources.';
      userMessage =
        `Find 2 of the best recent research or extension articles on: ${topicLabel} for ${crop} production.\n` +
        `Web search query: "${query}"\n` +
        `Return exactly 2 results as a JSON array.`;
      break;
    }

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
  }

  const resp = await client.messages.create({
    model,
    max_tokens: action === "research" ? 1500 : 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    ...(useWebSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
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
