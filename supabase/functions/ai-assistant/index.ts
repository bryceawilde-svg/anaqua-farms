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
  const model = action === "compatibility" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  let systemPrompt: string;
  let userMessage: string;

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
        products: { name: string; epa: string }[];
      };
      systemPrompt =
        'You are an agrochemical tank mix compatibility expert. ' +
        'Using your training knowledge of product labels, university extension research, and known chemical interactions, ' +
        'assess whether the listed products can be safely mixed in the same tank. ' +
        'Return ONLY valid JSON with no extra text or markdown: ' +
        '{"compatible":<boolean>,"warnings":["<one sentence per issue>"]}. ' +
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

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
  }

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = resp.content[0].type === "text" ? resp.content[0].text : "";

  // Strip markdown code fences Claude sometimes adds despite instructions
  let stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Validate it parses as JSON; if not, try to extract a JSON object from within the text
  try {
    JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        JSON.parse(match[0]);
        stripped = match[0]; // use the embedded JSON object
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
