import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { UniversalEdgeTTS } from "npm:edge-tts-universal@1.4.0";

const ALLOWED_ORIGIN = "https://itdaynamic96-hub.github.io";
const PUBLIC_API_KEY = "sb_publishable_rcOi9VHw4tP2umMhDqD1YA_rJWwugHi";
const VOICE = "bn-BD-PradeepNeural";

function corsHeaders(_origin: string | null) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
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
  if (!text || text.length > 1800) return new Response("Text must contain 1–1800 characters", { status: 400, headers });

  try {
    const result = await new UniversalEdgeTTS(text, VOICE).synthesize();
    const audio = await result.audio.arrayBuffer();
    if (!audio.byteLength) throw new Error("Empty audio response");
    return new Response(audio, {
      status: 200,
      headers: {
        ...headers, "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
        "X-TTS-Voice": VOICE, "X-TTS-Provider": "Microsoft Edge Read Aloud (unofficial no-key endpoint)",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed";
    return new Response(JSON.stringify({
      error: "Free Bengali speech service is temporarily unavailable", detail: message.slice(0, 240),
    }), { status: 502, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
