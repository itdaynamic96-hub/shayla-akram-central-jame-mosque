import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://itdaynamic96-hub.github.io";
const PUBLIC_API_KEY = "sb_publishable_rcOi9VHw4tP2umMhDqD1YA_rJWwugHi";
const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICE_NAME = "bn-IN-Standard-B";
const MAX_TEXT_CHARS = 450;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders();
  const origin = req.headers.get("origin");

  if (req.method === "GET" && new URL(req.url).searchParams.get("health") === "1") {
    return Response.json({
      status: "ok",
      provider: "Google Cloud Text-to-Speech",
      language: "bn-IN",
      voice: VOICE_NAME,
      gender: "MALE",
      configured: Boolean(Deno.env.get("GOOGLE_TTS_API_KEY")),
    }, { headers });
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  if (origin !== ALLOWED_ORIGIN || req.headers.get("apikey") !== PUBLIC_API_KEY) {
    return new Response("Request not allowed", { status: 403, headers });
  }

  const apiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
  if (!apiKey) {
    return Response.json({
      error: "Google Cloud TTS is not configured",
      detail: "Supabase Secret GOOGLE_TTS_API_KEY সেট করতে হবে।",
    }, { status: 503, headers });
  }

  let text: string;
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    return new Response("Invalid JSON", { status: 400, headers });
  }

  if (!text || text.length > MAX_TEXT_CHARS) {
    return new Response("Text must contain 1–450 characters", { status: 400, headers });
  }

  try {
    const response = await fetch(GOOGLE_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: "bn-IN",
          name: VOICE_NAME,
          ssmlGender: "MALE",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 0.94,
          pitch: -1.0,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return Response.json({
        error: "Google Cloud Text-to-Speech request failed",
        detail,
      }, { status: response.status === 429 ? 429 : 502, headers });
    }

    const result = await response.json();
    if (typeof result.audioContent !== "string" || !result.audioContent) {
      return Response.json({ error: "Google TTS returned no audio" }, { status: 502, headers });
    }

    const binary = atob(result.audioContent);
    const audio = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) audio[i] = binary.charCodeAt(i);

    return new Response(audio, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Provider": "Google Cloud Text-to-Speech",
        "X-TTS-Voice": VOICE_NAME,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed";
    return Response.json({
      error: "বাংলা অডিও তৈরি করা যায়নি।",
      detail: message.slice(0, 240),
    }, { status: 502, headers });
  }
});
