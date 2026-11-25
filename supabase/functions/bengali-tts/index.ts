import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = "https://itdaynamic96-hub.github.io";
const PUBLIC_API_KEY = "sb_publishable_rcOi9VHw4tP2umMhDqD1YA_rJWwugHi";
const TTS_BASE = "https://api.tts.ai/v1";
let cachedVoiceId: string | null = null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function getBengaliFreeVoice(): Promise<string> {
  if (cachedVoiceId) return cachedVoiceId;
  const response = await fetch(TTS_BASE + "/voices/?language=bn&model=piper", {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("বিনামূল্যের বাংলা Piper কণ্ঠের তালিকা পাওয়া যায়নি (" + response.status + ")");
  const data = await response.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  const bengali = voices.filter((voice: any) =>
    typeof voice?.id === "string" &&
    String(voice?.model || "").toLowerCase() === "piper" &&
    String(voice?.language || "").toLowerCase().startsWith("bn")
  );
  const selected = bengali.find((voice: any) => String(voice?.gender || "").toLowerCase() === "male") || bengali[0];
  if (!selected?.id) throw new Error("TTS.ai-তে বিনামূল্যের বাংলা Piper কণ্ঠ পাওয়া যায়নি");
  cachedVoiceId = selected.id;
  return cachedVoiceId;
}

async function downloadAudio(value: string): Promise<ArrayBuffer> {
  const url = new URL(value, TTS_BASE);
  if (url.protocol !== "https:" || url.hostname !== "api.tts.ai") {
    throw new Error("TTS.ai অডিও লিংক নিরাপদ নয়");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("তৈরি অডিও ডাউনলোড করা যায়নি (" + response.status + ")");
  const audio = await response.arrayBuffer();
  if (!audio.byteLength) throw new Error("খালি অডিও পাওয়া গেছে");
  return audio;
}

async function fetchAudio(text: string): Promise<ArrayBuffer> {
  const voice = await getBengaliFreeVoice();
  const submit = await fetch(TTS_BASE + "/tts/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ model: "piper", voice, language: "bn", text, format: "mp3", speed: 0.95 }),
    signal: AbortSignal.timeout(10000),
  });

  if (!submit.ok) {
    const detail = (await submit.text().catch(() => "")).slice(0, 300);
    const error = new Error(detail || "TTS.ai request failed (" + submit.status + ")");
    (error as any).status = submit.status;
    throw error;
  }
  const contentType = submit.headers.get("content-type") || "";
  if (contentType.includes("audio/")) return await submit.arrayBuffer();

  const job = await submit.json();
  if (job?.status === "completed" && (job?.result_url || job?.audio_url)) {
    return await downloadAudio(job.result_url || job.audio_url);
  }
  const uuid = String(job?.uuid || "");
  if (!uuid) throw new Error("TTS.ai অডিও তৈরির কাজের আইডি দেয়নি");

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const poll = await fetch(TTS_BASE + "/speech/results/?uuid=" + encodeURIComponent(uuid), {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!poll.ok) {
      if (poll.status === 429) throw new Error("বিনামূল্যের ভয়েস সার্ভারে সাময়িক সীমা পূর্ণ। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
      throw new Error("TTS.ai ফলাফল পাওয়া যায়নি (" + poll.status + ")");
    }
    const result = await poll.json();
    if (result?.status === "failed") throw new Error(result?.error || "বাংলা অডিও তৈরি ব্যর্থ হয়েছে");
    if (result?.status === "completed" && (result?.result_url || result?.audio_url)) {
      return await downloadAudio(result.result_url || result.audio_url);
    }
  }
  throw new Error("বাংলা অডিও তৈরি করতে সময় বেশি লাগছে। আবার চেষ্টা করুন।");
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders();
  const origin = req.headers.get("origin");
  if (req.method === "GET" && new URL(req.url).searchParams.get("health") === "1") {
    try {
      const voice = await getBengaliFreeVoice();
      return Response.json({ status: "ok", provider: "TTS.ai", model: "piper", language: "bn", voice_id: voice }, { headers });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Voice discovery failed";
      return Response.json({ status: "unavailable", detail: detail.slice(0, 200) }, { status: 502, headers });
    }
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
  if (!text || text.length > 500) {
    return new Response("Text must contain 1–500 characters on the free no-key tier", { status: 400, headers });
  }

  try {
    const audio = await fetchAudio(text);
    return new Response(audio, {
      status: 200,
      headers: { ...headers, "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-TTS-Provider": "TTS.ai free Piper (anonymous, no API key)" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech synthesis failed";
    const status = Number((error as any)?.status) === 429 ? 429 : 502;
    return new Response(JSON.stringify({ error: "Free Bengali speech service is temporarily unavailable", detail: message.slice(0, 240) }), {
      status, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
