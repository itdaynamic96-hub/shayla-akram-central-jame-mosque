import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://itdaynamic96-hub.github.io";
const PUBLIC_API_KEY = "sb_publishable_rcOi9VHw4tP2umMhDqD1YA_rJWwugHi";
const GOOGLE_TTS_URL = "https://translate.google.com/_/TranslateWebserverUi/data/batchexecute";
const GOOGLE_TTS_RPC = "jQ1olc";
const GOOGLE_TTS_MAX_CHARS = 100;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function splitForGoogle(text: string): string[] {
  const chars = Array.from(text.trim());
  const chunks: string[] = [];
  while (chars.length > GOOGLE_TTS_MAX_CHARS) {
    let cut = GOOGLE_TTS_MAX_CHARS;
    for (let i = GOOGLE_TTS_MAX_CHARS; i > GOOGLE_TTS_MAX_CHARS - 25; i--) {
      if (chars[i - 1] === " ") { cut = i; break; }
    }
    chunks.push(chars.slice(0, cut).join("").trim());
    chars.splice(0, cut);
  }
  if (chars.length) chunks.push(chars.join("").trim());
  return chunks.filter(Boolean);
}

async function synthesizeGoogleChunk(text: string): Promise<Uint8Array> {
  const parameter = JSON.stringify([text, "bn", null, "null"]);
  const rpc = [[[GOOGLE_TTS_RPC, parameter, null, "generic"]]];
  const body = "f.req=" + encodeURIComponent(JSON.stringify(rpc)) + "&";
  const response = await fetch(GOOGLE_TTS_URL, {
    method: "POST",
    headers: {
      "Referer": "http://translate.google.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error("Google Bengali TTS request failed (" + response.status + ")");
    (error as any).status = response.status;
    throw error;
  }

  const raw = await response.text();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/jQ1olc","\[\\"([A-Za-z0-9+/=]+)\\"\]/);
    if (match?.[1]) {
      const binary = atob(match[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length > 100) return bytes;
    }
  }
  throw new Error("Google Translate returned no Bengali audio data");
}

async function synthesize(text: string): Promise<ArrayBuffer> {
  const parts = splitForGoogle(text);
  const audioParts: Uint8Array[] = [];
  for (const part of parts) {
    audioParts.push(await synthesizeGoogleChunk(part));
  }
  const total = audioParts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of audioParts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined.buffer;
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders();
  const origin = req.headers.get("origin");
  if (req.method === "GET" && new URL(req.url).searchParams.get("health") === "1") {
    return Response.json({
      status: "ok",
      provider: "Google Translate TTS (gTTS-compatible)",
      language: "bn",
      api_key_required: false,
      upstream_max_characters: GOOGLE_TTS_MAX_CHARS,
    }, { headers });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  if (origin !== ALLOWED_ORIGIN || req.headers.get("apikey") !== PUBLIC_API_KEY) {
    return new Response("Request not allowed", { status: 403, headers });
  }

  let text: string;
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    return new Response("Invalid JSON", { status: 400, headers });
  }
  if (!text || text.length > 450) {
    return new Response("Text must contain 1–450 characters", { status: 400, headers });
  }

  try {
    const audio = await synthesize(text);
    return new Response(audio, {
      status: 200,
      headers: { ...headers, "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-TTS-Provider": "Google Translate TTS (no API key)" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed";
    const status = Number((error as any)?.status) === 429 ? 429 : 502;
    return new Response(JSON.stringify({
      error: "Free Bengali speech service is temporarily unavailable",
      detail: message.slice(0, 240),
    }), { status, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
