import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Note: SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the Supabase runtime — no secrets needed.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

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

  // Authenticate the user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Check plan
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", authData.user.id)
    .single();

  if (!profile || profile.plan !== "pro") {
    return new Response(JSON.stringify({ error: "Pro plan required" }), {
      status: 403, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Fetch this user's tickets (RLS enforces user isolation)
  const { data: tickets, error: dbError } = await supabase
    .from("tickets")
    .select("*")
    .order("date", { ascending: false });

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(tickets ?? []), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
