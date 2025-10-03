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
  const origin = req.headers.get("origin") || undefined;

  try {
    const {
      role,                // "Leadership" | "Individual Contributor" | "Generalist" | "Overall" | custom
      resume,              // your resume JSON
      emoji = true,        // sprinkle emojis on bullets
      max_bullets = 6      // 4–6 reads best
    } = await req.json();

    const roleRules: Record<string, string> = {
      "Leadership":
        "Prioritise team leadership, ownership, cross-functional coordination, mentoring, strategy, decision-making, business impact. Avoid deep hands-on claims unless explicitly evidenced.",
      "Individual Contributor":
        "Prioritise hands-on engineering: architecture decisions, performance work, complex features, tooling/tests, measurable technical impact. Avoid people-management claims unless explicitly evidenced.",
      "Generalist":
        "Prioritise breadth across iOS/Android, end-to-end delivery, adaptability across stack, shipping from spec to store. Avoid managerial claims unless explicitly evidenced.",
      "Overall":
        "Balanced selection across impact, performance, architecture, delivery; keep it concise and representative."
    };

    const guidance =
      roleRules[role] ?? `Emphasise ${role.toLowerCase()} responsibilities; avoid claims not supported by the resume.`;

    const system = `You are an expert career writer for mobile engineers. Be truthful, specific, and readable.`;

    const user = `
Role: ${role}
Guidance: ${guidance}

WRITE THE OUTPUT AS:
1) First line: "As a/an ${role}, ..." (use the correct article "a" or "an" automatically).
2) Then ${max_bullets} or fewer bullet points. Each bullet must be directly supported by the resume JSON and clearly relevant to the role above.
   - Keep bullets short and scannable (≈12–20 words).
   - Lead with concrete action or metric. If a detail isn't in the resume JSON, do not mention it.
   - ${emoji ? "Add a relevant emoji at the start of each bullet (1 emoji per bullet, optional)." : "Do not add emojis."}
   - If a commonly expected aspect of the role isn't evidenced, simply omit it (do not speculate).

Constraints:
- No paragraphs after the first line; only bullets.
- No biography preamble (name/years/place).
- No invented facts.

Resume JSON:
${JSON.stringify(resume, null, 2)}

Return only the text (first line + bullets).
`.trim();

    const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.AI_MODEL || "gpt-5";
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: Number(process.env.AI_MAX_TOKENS || 280),
        temperature: 0.6
      })
    });

    if (!r.ok) {
      const msg = await r.text();
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*" }
      });
    }

    const json = await r.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*" }
    });
  }
}

