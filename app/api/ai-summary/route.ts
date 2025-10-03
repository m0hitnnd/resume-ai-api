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

export async function POST(req: Request) {
  const origin = req.headers.get("origin") || undefined;
  const cors = {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const role  = (body?.role ?? "").toString().trim();
    const resume = body?.resume;
    const emoji = body?.emoji !== false;
    const voice = body?.voice === "third" ? "third" : "first";
    const max_bullets = Number(body?.max_bullets || 5);

    if (!role || !resume || typeof resume !== "object") {
      const msg = `Bad Request: role=${!!role}, resumeIsObject=${typeof resume === "object"}`;
      console.error("[ai-summary]", requestId, "bad_input", msg, { role, type: typeof resume });
      return new Response(JSON.stringify({ error: msg, requestId }), {
        status: 400, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...cors },
      });
    }

    const system = `You are an expert career writer for mobile engineers. Be truthful, specific, and readable.`;
    const user = `
Role: ${role}

WRITE THE OUTPUT AS:
1) First line: "As a/an ${role}, ..." (use the correct article automatically).
2) Then ${max_bullets} or fewer bullet points, all directly supported by the resume JSON and relevant to the role.
   - Keep bullets short and scannable.
   - Lead with concrete action/metric; omit anything not evidenced.
   - ${emoji ? "Start each bullet with one relevant emoji (optional)." : "Do not add emojis."}

Constraints:
- No paragraphs after the first line; only bullets.
- No biography (no name/years/location).
- No invented facts.

Voice: ${voice === "third" ? "third person (no name)" : "first person (“I”)"}.

Resume JSON:
${JSON.stringify(resume, null, 2)}

Return only the text (first line + bullets).
`.trim();

    const BASE = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const PRIMARY = process.env.AI_MODEL || "gpt-5";
    const FALLBACK = process.env.AI_MODEL_FALLBACK || "gpt-4.1-mini";
    const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 260);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);

    async function call(model: string) {
      const messages = [{ role: "system", content: system }, { role: "user", content: user }];
      const payload: any = { model, messages, temperature: 0.6 };
      if (/^(gpt-4\.1|gpt-5|o3|o4)/i.test(model)) {
        payload.max_completion_tokens = MAX_TOKENS;
      } else {
        payload.max_tokens = MAX_TOKENS;
      }
      return fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    console.log("[ai-summary]", requestId, "start", { role, model: PRIMARY, origin });

    let resp = await call(PRIMARY);
    if (!resp.ok) {
      const bodyText = await resp.text(); // ← the actual upstream error
      console.error("[ai-summary]", requestId, "primary_error", { status: resp.status, body: bodyText.slice(0, 2000) });

      if (/model/i.test(bodyText) && /(not|unknown|found|available)/i.test(bodyText)) {
        resp = await call(FALLBACK);
        if (!resp.ok) {
          const fbText = await resp.text();
          console.error("[ai-summary]", requestId, "fallback_error", { status: resp.status, body: fbText.slice(0, 2000) });
          return new Response(JSON.stringify({ error: fbText, requestId }), {
            status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...cors },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: bodyText, requestId }), {
          status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...cors },
        });
      }
    }

    clearTimeout(timeout);
    const json = await resp.json();
    const summary = json?.choices?.[0]?.message?.content?.trim() || "";

    console.log("[ai-summary]", requestId, "ok", { ms: Date.now() - t0, usedModel: resp.headers.get("openai-model") || PRIMARY });

    return new Response(JSON.stringify({ summary, requestId }), {
      status: 200, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...cors },
    });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Upstream model timed out" : (e?.message || "error");
    console.error("[ai-summary]", requestId, "exception", { msg, stack: e?.stack });
    return new Response(JSON.stringify({ error: msg, requestId }), {
      status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...cors },
    });
  }
}
