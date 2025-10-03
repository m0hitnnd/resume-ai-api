export const runtime = "edge";

const cors = (origin?: string) => ({
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export async function GET(req: Request) {
  const origin = req.headers.get("origin") || undefined;
  return new Response(JSON.stringify({ ok: true, route: "/api/ai-summary" }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || undefined;
  return new Response(null, { status: 204, headers: cors(origin) });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const origin = req.headers.get("origin") || undefined;
    const {
      role,          // e.g. "Leadership" | "Individual Contributor" | "Generalist" | "Overall" | "Architecture" | etc.
      resume,        // your resume JSON
      emoji = true,  // sprinkle a few emojis (1–3), not mandatory
      voice = "first"// "first" | "third"
    } = (await req.json()) as {
      role: string;
      resume: any;
      emoji?: boolean;
      voice?: "first" | "third";
    };

    const system = `You are an expert career writer for mobile engineers. Write concise, truthful, specific summaries.`;

    // Minimal, role-deep prompt. No preamble, no name/years.
    const user = `
Role focus: ${role}
Voice: ${voice === "third" ? "third person (no name)" : "first person (“I”)"}.
Audience: technical reader or recruiter.

Instructions:
- Do NOT start with a biography line. Do NOT mention name or years of experience.
- Start immediately with what ${voice === "third" ? "this person did" : "I did"} *as ${role}*.
- Go deep on this role only: scope/context → key actions/decisions/trade-offs → concrete impact with numbers where available.
- Use 2–3 tight mini-paragraphs or short, natural bullets; prioritize readability.
- ${emoji ? "Use 1–3 subtle emojis where they add clarity (e.g., for impact, architecture, performance)." : "Do not use emojis."}
- Avoid fluff and generalities. Never invent facts; only use what’s in the resume JSON.

Resume JSON:
${JSON.stringify(resume, null, 2)}

Return only the summary text.
`.trim();

    const body = {
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };

    const resp = await fetch(
      `${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY}`
        },
        body: JSON.stringify(body)
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" }
      });
    }

    const json = await resp.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" }
    });
  }
}
