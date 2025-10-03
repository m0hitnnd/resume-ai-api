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
      skill,            // "Overall" | "Leadership" | "Individual Contributor" | "Generalist" | custom string
      focus,
      resume,
      format = "bullets",
      emoji = true,
      max_bullets = 5,
    } = (await req.json()) as {
      skill: string;
      focus?: string;
      resume: any;
      format?: "bullets" | "paragraph";
      emoji?: boolean;
      max_bullets?: number;
    };

    // How to slant the summary for each skill view
    const guidanceBySkill: Record<string, string> = {
      "Overall":
        "Balanced view across impact, performance, architecture, and delivery.",
      "Leadership":
        "Emphasize leading teams, mentoring, cross-functional collaboration, ownership, decision-making, and business outcomes.",
      "Individual Contributor":
        "Emphasize hands-on engineering: performance work, architecture, complex features, tooling, tests, and measurable technical impact.",
      "Generalist":
        "Emphasize breadth across iOS/Android, working across stack, adaptability, and end-to-end delivery.",
    };

    const skillGuidance =
      guidanceBySkill[skill] ||
      `Emphasize ${skill.toLowerCase()} skills without inventing facts.`;

    const styleSpec =
      format === "bullets"
        ? `Return PLAIN TEXT (no markdown).
Start with ONE short headline (<= 18 words), then a blank line, then up to ${max_bullets} bullets.
Bullets are one sentence each, metric-first where possible.
${emoji ? "Begin each bullet with a relevant emoji and a short label in Title Case, followed by an em dash (—)." : "Begin each bullet with a hyphen (-) and a short label, then an em dash (—)."}
Example bullet: ${emoji ? "🚀 Impact — cut p95 launch from ~6s → 2.1s (≈70% faster)." : "- Impact — cut p95 launch from ~6s → 2.1s (≈70% faster)."}
Avoid filler. NEVER invent facts. Prefer concrete numbers from the resume JSON.`
        : `Return PLAIN TEXT (no markdown). Write 4–6 short sentences; metric-first; no filler; never invent facts.`;

    const system = `You are an expert resume summarizer for mobile engineers. Be concise, readable, and evidence-based.`;

    const userContent = `Skill View: ${skill}
Focus: ${focus || "(none)"}
Guidance: ${skillGuidance}

Style/Format:
${styleSpec}

Resume JSON:
${JSON.stringify(resume, null, 2)}

Output only the summary text.`;

    const body = {
      model: process.env.AI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
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
        headers: { "Content-Type": "application/json", ...cors(origin) },
      });
    }

    const json = await resp.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors(origin) },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...cors(undefined) },
    });
  }
}
