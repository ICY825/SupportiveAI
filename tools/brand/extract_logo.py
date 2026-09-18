"""Build web logo assets from docs/references/logo.png.

The source PNG is rendered on an opaque black background.
The logo contains:
- Wing / star brand mark (red #F9021E)
- "VINSMART FUTURE" wordmark (red #F9021E)
- "ADMINISTRATION" sub-brand (white #FFFFFF)

Alpha is recovered cleanly from the channels, keying out the black background
while preserving smooth anti-aliasing.

    python3 tools/brand/extract_logo.py

Writes frontend/src/assets/brand/{vsf-logo,vsf-mark}.png and frontend/public/favicon.png.
"""

from pathlib import Path

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "docs/references/logo.png"
ASSETS = REPO / "frontend/src/assets/brand"
PUBLIC = REPO / "frontend/public"

BRAND_RED = (249, 2, 30)  # measured from docs/references/logo.png
SPLIT_Y = 890  # separation between red logo elements and white ADMINISTRATION text


def key_out(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size

    top_rgb = img.crop((0, 0, w, SPLIT_Y))
    bot_rgb = img.crop((0, SPLIT_Y, w, h))

    # Top alpha: recovered from red channel
    r_top, _, _ = top_rgb.split()
    alpha_top = r_top.point(lambda v: 0 if v < 10 else min(255, round(v * 255 / 249)))
    out_top = Image.new("RGBA", (w, SPLIT_Y), BRAND_RED + (0,))
    out_top.putalpha(alpha_top)

    # Bottom alpha: recovered from max(r, g, b) of white text
    r_bot, g_bot, b_bot = bot_rgb.split()
    max_bot = ImageChops.lighter(ImageChops.lighter(r_bot, g_bot), b_bot)
    alpha_bot = max_bot.point(lambda v: 0 if v < 10 else min(255, round(v * 255 / 255)))
    out_bot = Image.new("RGBA", (w, h - SPLIT_Y), (255, 255, 255, 0))
    out_bot.putalpha(alpha_bot)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(out_top, (0, 0))
    out.paste(out_bot, (0, SPLIT_Y))
    return out


def trimmed(img: Image.Image, box: tuple[int, int, int, int], pad: int) -> Image.Image:
    crop = img.crop(box)
    bbox = crop.getchannel("A").getbbox()
    if bbox:
        crop = crop.crop(bbox)
    canvas = Image.new("RGBA", (crop.width + pad * 2, crop.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(crop, (pad, pad))
    return canvas


def square(img: Image.Image) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def fit_height(img: Image.Image, height: int) -> Image.Image:
    return img.resize((round(img.width * height / img.height), height), Image.Resampling.LANCZOS)


def main() -> None:
    logo = key_out(Image.open(SRC))
    w, _ = logo.size

    full_bbox = logo.getchannel("A").getbbox()
    if not full_bbox:
        raise SystemExit("no visible logo content found")

    mark_crop = logo.crop((0, 0, w, 580))
    mark_bbox = mark_crop.getchannel("A").getbbox()
    if not mark_bbox:
        raise SystemExit("no visible mark content found")

    ASSETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    full = trimmed(logo, full_bbox, pad=8)
    mark = square(trimmed(mark_crop, mark_bbox, pad=4))

    fit_height(full, 240).save(ASSETS / "vsf-logo.png", optimize=True)
    mark.resize((160, 160), Image.Resampling.LANCZOS).save(ASSETS / "vsf-mark.png", optimize=True)
    mark.resize((64, 64), Image.Resampling.LANCZOS).save(PUBLIC / "favicon.png", optimize=True)
    for f in (ASSETS / "vsf-logo.png", ASSETS / "vsf-mark.png", PUBLIC / "favicon.png"):
        print(f.relative_to(REPO), Image.open(f).size, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
