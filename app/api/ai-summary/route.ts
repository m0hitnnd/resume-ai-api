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
    const { focus, resume, emoji = true } = (await req.json()) as {
      focus: string;         // e.g., "Leadership", "Individual Contributor", "Generalist", "Performance", etc.
      resume: any;           // your resume JSON
      emoji?: boolean;       // sprinkle some emojis (1–4)
    };

    // ——— Minimal, flexible prompt ———
    const system = `You are an expert career writer. Produce a short, highly readable summary of a mobile engineer's resume. Be truthful and specific.`;

    const user = `
Focus: ${focus || "(none provided)"}
Audience: a general technical reader or recruiter.

Instructions:
- Center the summary around the focus above; go into depth on that focus using details from the resume JSON.
- Keep non-focus areas brief or skip them.
- Make it friendly and easy to skim with short sentences or natural mini-paragraphs (your choice).
- ${emoji ? "Sprinkle a few relevant emojis (1–4) where helpful; don't overdo it." : "Do not use emojis."}
- Do not invent facts; only use what's in the resume JSON.

Resume JSON:
${JSON.stringify(resume, null, 2)}

Return only the summary text.
`.trim();

    const body = {
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };

    const resp = await fetch(
      `${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" },
      });
    }

    const json = await resp.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*" },
    });
  }
}
