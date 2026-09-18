"""Render the app icon: 栞 in Mincho on warm paper."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
MINCHO = "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc"


def render(size):
    img = Image.new("RGB", (size, size), (244, 238, 226))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(MINCHO, int(size * 0.56), index=1)  # W6
    except OSError:
        font = ImageFont.truetype(MINCHO, int(size * 0.56))
    box = d.textbbox((0, 0), "栞", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.02), "栞", font=font, fill=(42, 39, 36))
    # a thin ribbon, like a bookmark string
    x = int(size * 0.74)
    d.rectangle([x, 0, x + max(2, size // 64), int(size * 0.2)], fill=(168, 64, 48))
    return img


os.makedirs(OUT, exist_ok=True)
render(512).save(os.path.join(OUT, "icon-512.png"))
render(192).save(os.path.join(OUT, "icon-192.png"))
render(180).save(os.path.join(OUT, "apple-touch-icon.png"))
print("icons written to", OUT)
