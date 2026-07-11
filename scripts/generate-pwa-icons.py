from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "public" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

BG = (5, 16, 24, 255)
BG_2 = (8, 36, 39, 255)
GOLD = (218, 178, 91, 255)
GOLD_DARK = (132, 96, 28, 255)
TEAL = (33, 172, 132, 255)
PAPER = (250, 248, 243, 255)
INK = (4, 13, 23, 255)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/timesbd.ttf" if bold else "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def rounded_rectangle_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = size / 512
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BG[0] * (1 - t) + BG_2[0] * t)
        g = int(BG[1] * (1 - t) + BG_2[1] * t)
        b = int(BG[2] * (1 - t) + BG_2[2] * t)
        draw.line((0, y, size, y), fill=(r, g, b, 255))

    pad = int((82 if maskable else 34) * scale)
    card = (pad, pad, size - pad, size - pad)
    draw.rounded_rectangle(
        card,
        radius=int(82 * scale),
        fill=(11, 22, 31, 255),
        outline=(177, 134, 48, 255),
        width=max(2, int(3 * scale)),
    )

    cx = cy = size / 2
    ring_r = int((150 if maskable else 176) * scale)
    inner_r = int((83 if maskable else 96) * scale)

    for offset, width in ((0, 5), (13, 2)):
        r = ring_r - int(offset * scale)
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=GOLD,
            width=max(1, int(width * scale)),
        )

    for angle in range(0, 360, 45):
        import math

        rad = math.radians(angle)
        outer = ring_r + int(20 * scale)
        mid = inner_r + int(12 * scale)
        spread = math.radians(7)
        p1 = (cx + outer * math.cos(rad), cy + outer * math.sin(rad))
        p2 = (cx + mid * math.cos(rad + spread), cy + mid * math.sin(rad + spread))
        p3 = (cx + mid * math.cos(rad - spread), cy + mid * math.sin(rad - spread))
        draw.polygon((p1, p2, p3), fill=GOLD if angle % 90 == 0 else GOLD_DARK)

    for offset in (-108, 105):
        draw.line(
            (
                int((68 + offset * 0.1) * scale),
                int((356 + offset * 0.1) * scale),
                int((438 + offset * 0.1) * scale),
                int((168 + offset * 0.1) * scale),
            ),
            fill=TEAL if offset > 0 else (168, 147, 91, 255),
            width=max(3, int(8 * scale)),
        )

    draw.ellipse((cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r), fill=INK, outline=GOLD, width=max(2, int(5 * scale)))

    text = "SP"
    fnt = font(int(106 * scale), bold=True)
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw / 2, cy - th / 2 - int(10 * scale)), text, fill=PAPER, font=fnt)

    if not maskable:
        alpha = rounded_rectangle_mask(size, int(62 * scale))
        img.putalpha(alpha)
    return img


def main() -> None:
    outputs = [
        ("app-64.png", 64, False),
        ("icon-96.png", 96, False),
        ("icon-144.png", 144, False),
        ("apple-touch-icon.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("maskable-192.png", 192, True),
        ("maskable-512.png", 512, True),
    ]
    for name, size, maskable in outputs:
        draw_icon(size, maskable=maskable).save(ICON_DIR / name, "PNG", optimize=True)
    favicon_sizes = [draw_icon(size, maskable=False).convert("RGBA") for size in (16, 32, 48)]
    favicon_sizes[0].save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    main()
