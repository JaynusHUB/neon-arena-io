#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/gen-skins.py — NEON ARENA .io karakter skin sprite'ları üretir (Gemini AI).

Her skin 1:1 kare görsel olarak üretilir; renderer görseli daire içinde
clip ederek çizer (arka plan köşeleri zaten kırpılır), glow/iz koddadır.

Kullanım:
    python tools/gen-skins.py            # tüm skinler
    python tools/gen-skins.py recommended ignite   # sadece seçilenler
"""
import os
import sys
import time
from pathlib import Path

# .env yükle (design skill .env'i)
ENV_PATH = Path.home() / ".agents" / "skills" / "design" / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("google-genai kurulu değil: python -m pip install google-genai pillow")
    sys.exit(1)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("GEMINI_API_KEY yok (.env)")
    sys.exit(1)

MODEL = "gemini-2.5-flash-image"
OUT_DIR = Path(__file__).parent.parent / "public" / "skins"

# Ortak istek: görsel DAİRE oyun karakteri olarak üretilir — gövde kareyi
# kenarlara kadar doldurur (renderer clip eder), doku/karakter detayı içerir.
BASE = (
    "Game asset for a neon .io arcade game: a single perfectly circular orb character, "
    "the circle is perfectly centered and inscribed so it touches all four edges of the square frame, "
    "the circular body fills 100% of the frame with no empty margin. "
    "{desc} "
    "Style: polished game-art quality, smooth airbrushed shading, vibrant neon rim light, "
    "big glossy expressive eyes, subtle inner gradient depth, high detail, crisp edges, "
    "square composition, no text, no watermark, no border, no background scene — "
    "only the circular character on a pure solid black background."
)

SKINS = {
    "recommended": (
        "MODERN CYAN FLAME ORB — the recommended default skin: icy cyan-to-azure glossy sphere "
        "with a fierce determined expression, wispy electric-blue flame aura licking around the rim"
    ),
    "ignite": (
        "FIRE ORB (Ignite) — orange-red blazing sphere with angry competitive eyes, "
        "yellow-hot core fading to deep red edges, small flame licks around the rim"
    ),
    "cute": (
        "CUTE BLOB (Cute) — friendly pastel blue smiley sphere, huge sparkly kawaii eyes, "
        "soft rosy cheeks, warm welcoming expression, gentle pastel gradient"
    ),
    "wolf": (
        "DARK WOLF WARRIOR — dark navy-black orb decorated like a snarling wolf mask, "
        "piercing icy-blue glowing eyes, sharp angular fur markings, aggressive intimidating look"
    ),
    "galaxy": (
        "GALAXY SWIRL — deep purple cosmic sphere with a spiral nebula core, "
        "twinkling stars inside, violet-to-magenta glow, dreamy premium look"
    ),
    "slime": (
        "GREEN SLIME BLOB — translucent jelly-green slime ball with a happy innocent face, "
        "wobbly glossy gel surface, a small slime bubble sitting on top, playful and colorful"
    ),
    "lava": (
        "LAVA ORB (Lava) — molten magma sphere with glowing cracks, menacing fiery eyes, "
        "dark cooled crust over a white-hot core, threatening and powerful"
    ),
}


def gen(skin_id: str) -> Path:
    desc = SKINS[skin_id]
    prompt = BASE.format(desc=desc)
    client = genai.Client(api_key=API_KEY)
    print(f"[{skin_id}] üretılıyor ({MODEL})...")
    resp = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            image_config=types.ImageConfig(aspect_ratio="1:1"),
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_LOW_AND_ABOVE"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_LOW_AND_ABOVE"),
            ],
        ),
    )
    for part in resp.candidates[0].content.parts:
        if getattr(part, "inline_data", None) and part.inline_data.mime_type.startswith("image/"):
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            out = OUT_DIR / f"{skin_id}.png"
            out.write_bytes(part.inline_data.data)
            print(f"[{skin_id}] OK → {out} ({out.stat().st_size // 1024} KB)")
            return out
    print(f"[{skin_id}] HATA: görsel dönmedi")
    return None


def main():
    ids = sys.argv[1:] or list(SKINS.keys())
    bad = [i for i in ids if i not in SKINS]
    if bad:
        print(f"Bilinmeyen skin: {bad} (geçerli: {list(SKINS)})")
        sys.exit(1)
    ok = 0
    for i, sid in enumerate(ids):
        if gen(sid):
            ok += 1
        if i < len(ids) - 1:
            time.sleep(2)
    print(f"\n{ok}/{len(ids)} üretildi → {OUT_DIR}")
    sys.exit(0 if ok == len(ids) else 1)


if __name__ == "__main__":
    main()
