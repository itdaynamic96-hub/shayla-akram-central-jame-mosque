from pathlib import Path
import json
import re
import sys
import urllib.error
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "supabase-config.js").read_text(encoding="utf-8")
match = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", CONFIG)
if not match:
    raise SystemExit("Could not read the Supabase publishable key from supabase-config.js")
api_key = match.group(1)
base = "https://lmwczibsipczfymhyqba.supabase.co/functions/v1/bengali-tts"

# Probe the only Bengali voices listed by the provider without sending any API key.
payload = json.dumps({
    "model": "indic-parler",
    "voice": "bn_arjun",
    "language": "bn",
    "text": "বাংলা কণ্ঠ পরীক্ষা।",
    "format": "mp3",
    "speed": 0.95,
}, ensure_ascii=False).encode("utf-8")
probe = urllib.request.Request(
    "https://api.tts.ai/v1/tts/",
    data=payload,
    headers={"Content-Type": "application/json", "Accept": "application/json"},
)
try:
    with urllib.request.urlopen(probe, timeout=30) as response:
        probe_type = response.headers.get("Content-Type", "")
        probe_body = response.read()
        print("No-key Indic Parler response:", response.status, probe_type, len(probe_body), probe_body[:500].decode("utf-8", "replace") if "json" in probe_type else "")
except urllib.error.HTTPError as exc:
    print("No-key Indic Parler response:", exc.code, exc.read().decode("utf-8", "replace")[:1000])

# Probe current no-key Google Translate TTS endpoints for Bengali.
google_text = "বাংলা কণ্ঠ পরীক্ষা"
google_ok = False
for endpoint in (
    "https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=bn&q=" + urllib.parse.quote(google_text),
    "https://translate.google.com/translate_tts?client=tw-ob&ie=UTF-8&tl=bn&q=" + urllib.parse.quote(google_text),
):
    req = urllib.request.Request(endpoint, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        "Referer": "https://translate.google.com/",
        "Accept": "audio/mpeg,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            audio = response.read()
            ctype = response.headers.get("Content-Type", "")
            print("Google no-key TTS probe:", response.status, ctype, len(audio), endpoint.split("/")[2])
            if ctype.startswith("audio/") and len(audio) > 100:
                google_ok = True
                break
    except urllib.error.HTTPError as exc:
        print("Google no-key TTS probe:", exc.code, exc.read().decode("utf-8", "replace")[:300])
if not google_ok:
    print("Google Translate TTS no-key endpoints did not return audio.")


def request(url, data=None, headers=None, timeout=45):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        raise SystemExit(f"HTTP {exc.code}: {detail}") from exc

with request(base + "?health=1", timeout=20) as response:
    health = json.loads(response.read().decode("utf-8"))
if health.get("status") != "ok":
    raise SystemExit("Bengali TTS health check failed: " + json.dumps(health, ensure_ascii=False))
print("TTS provider ready:", health.get("provider"), health.get("model"), health.get("language"), health.get("voice_id"))

payload = json.dumps({"text": "বাংলা কণ্ঠ পরীক্ষা।"}, ensure_ascii=False).encode("utf-8")
headers = {
    "Origin": "https://itdaynamic96-hub.github.io",
    "apikey": api_key,
    "Authorization": "Bearer " + api_key,
    "Content-Type": "application/json",
    "Accept": "audio/mpeg",
}
with request(base, data=payload, headers=headers, timeout=50) as response:
    content_type = response.headers.get("Content-Type", "")
    audio = response.read()
if not content_type.startswith("audio/") or len(audio) < 100:
    raise SystemExit(f"TTS audio smoke test failed: content-type={content_type}, bytes={len(audio)}")
print(f"Bengali TTS audio smoke test passed: {len(audio)} bytes ({content_type})")
