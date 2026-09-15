"""Build web logo assets from docs/wireframe/logo.png.

The source PNG is fully opaque: the "transparent" checkerboard is painted into
the pixels. The logo is a single flat red (#E6102F), so alpha is recovered from
how much redder than neutral each pixel is, and the colour is set to the pure
brand red. Neutral pixels (checkerboard, the star's white negative space,
compression streaks) become transparent.

    python3 tools/brand/extract_logo.py

Writes frontend/src/assets/brand/{vsf-logo,vsf-mark}.png and frontend/public/favicon.png.
"""

from pathlib import Path

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "docs/wireframe/logo.png"
ASSETS = REPO / "frontend/src/assets/brand"
PUBLIC = REPO / "frontend/public"

BRAND_RED = (230, 16, 47)  # measured from the source artwork
FULL_REDNESS = BRAND_RED[0] - max(BRAND_RED[1], BRAND_RED[2])


def key_out(img: Image.Image) -> Image.Image:
    r, g, b = img.convert("RGB").split()
    redness = ImageChops.subtract(r, ImageChops.lighter(g, b))
    alpha = redness.point(lambda v: 0 if v < 12 else min(255, round(v * 255 / FULL_REDNESS)))
    out = Image.new("RGBA", img.size, BRAND_RED + (0,))
    out.putalpha(alpha)
    return out


def rows_with_ink(alpha: Image.Image) -> list[tuple[int, int]]:
    """Vertical runs of rows that contain visible pixels."""
    w, h = alpha.size
    col_max = alpha.resize((1, h), Image.Resampling.BOX)  # mean per row
    runs, start = [], None
    for y in range(h):
        ink = col_max.getpixel((0, y)) > 0
        if ink and start is None:
            start = y
        if not ink and start is not None:
            runs.append((start, y))
            start = None
    if start is not None:
        runs.append((start, h))
    return runs


def trimmed(img: Image.Image, box: tuple[int, int, int, int], pad: int) -> Image.Image:
    crop = img.crop(box)
    bbox = crop.getchannel("A").getbbox()
    crop = crop.crop(bbox)
    canvas = Image.new("RGBA", (crop.width + pad * 2, crop.height + pad * 2), BRAND_RED + (0,))
    canvas.alpha_composite(crop, (pad, pad))
    return canvas


def square(img: Image.Image) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), BRAND_RED + (0,))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def fit_height(img: Image.Image, height: int) -> Image.Image:
    return img.resize((round(img.width * height / img.height), height), Image.Resampling.LANCZOS)


def main() -> None:
    logo = key_out(Image.open(SRC))
    w, h = logo.size
    runs = rows_with_ink(logo.getchannel("A"))
    if len(runs) < 2:
        raise SystemExit(f"expected mark + wordmark rows, found {runs}")
    mark_rows = runs[0]
    full_rows = (runs[0][0], runs[-1][1])

    ASSETS.mkdir(parents=True, exist_ok=True)
    full = trimmed(logo, (0, full_rows[0], w, full_rows[1]), pad=8)
    mark = square(trimmed(logo, (0, mark_rows[0], w, mark_rows[1]), pad=4))

    fit_height(full, 240).save(ASSETS / "vsf-logo.png", optimize=True)
    mark.resize((160, 160), Image.Resampling.LANCZOS).save(ASSETS / "vsf-mark.png", optimize=True)
    mark.resize((64, 64), Image.Resampling.LANCZOS).save(PUBLIC / "favicon.png", optimize=True)
    for f in (ASSETS / "vsf-logo.png", ASSETS / "vsf-mark.png", PUBLIC / "favicon.png"):
        print(f.relative_to(REPO), Image.open(f).size, f.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
