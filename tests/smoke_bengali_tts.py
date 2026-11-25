from pathlib import Path
import json
import re
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "supabase-config.js").read_text(encoding="utf-8")
match = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", CONFIG)
if not match:
    raise SystemExit("Could not read the Supabase publishable key from supabase-config.js")
api_key = match.group(1)
base = "https://lmwczibsipczfymhyqba.supabase.co/functions/v1/bengali-tts"

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
