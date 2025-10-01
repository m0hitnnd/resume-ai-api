
// =====================
// PART 2: Vercel / Next.js API Route (App Router)
// =====================

/*
Create a file at: app/api/ai-summary/route.ts (Next.js App Router)
— Deployed on Vercel. Uses Edge runtime + CORS.
*/

export const runtime = "edge";

// Basic CORS handling
function corsHeaders(origin?: string) {
  const allowed = (process.env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());
  const allow = allowed.includes("*") ? "*" : (origin && allowed.includes(origin) ? origin : allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || undefined;
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const origin = req.headers.get("origin") || undefined;
    const { persona, focus, resume } = (await req.json()) as {
      persona: "Recruiter" | "Engineering Manager" | "Founder" | "Performance" | "Architecture" | "Leadership";
      focus?: string;
      resume: any;
    };

    const system = `You are an expert resume summarizer. Write a crisp 4-6 sentence summary in third person about the candidate based on the provided resume JSON. Personalize for the requested persona. Keep it specific and evidence-based with measurable achievements where available. Avoid buzzwords. Keep it honest; do not invent facts.`;

    const body = {
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Persona: ${persona}\nFocus: ${focus || "(none)"}\nResume JSON:\n${JSON.stringify(resume, null, 2)}\n\nReturn only the summary text.`,
        },
      ],
    } as any;

    const resp = await fetch(`${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    const json = await resp.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  } catch (e: any) {
    const origin = req.headers.get("origin") || undefined;
    return new Response(JSON.stringify({ error: e.message || "error" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
  }
}
