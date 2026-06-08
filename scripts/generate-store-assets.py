"""
Generate Microsoft Store logo assets for VoiceXt.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "docs" / "logo" / "voicext-icon.png"
LOGO_PATH = ROOT / "docs" / "logo" / "voicext-logo.png"
OUTPUT_DIR = ROOT / "docs" / "store-assets"

BG_DARK = (11, 12, 20)
CYAN = (0, 242, 255)
MAGENTA = (255, 0, 229)


def radial_background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    img = Image.new("RGBA", size, BG_DARK + (255,))
    draw = ImageDraw.Draw(img)

    cx, cy = width // 2, int(height * 0.35)
    max_radius = int(max(width, height) * 0.75)

    for radius in range(max_radius, 0, -4):
        ratio = radius / max_radius
        r = int(BG_DARK[0] + (26 - BG_DARK[0]) * (1 - ratio) * 0.35)
        g = int(BG_DARK[1] + (27 - BG_DARK[1]) * (1 - ratio) * 0.35)
        b = int(BG_DARK[2] + (46 - BG_DARK[2]) * (1 - ratio) * 0.35)
        draw.ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            fill=(r, g, b, 255),
        )

    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (
            int(width * 0.15),
            int(height * 0.08),
            int(width * 0.55),
            int(height * 0.45),
        ),
        fill=(*CYAN, 28),
    )
    glow_draw.ellipse(
        (
            int(width * 0.45),
            int(height * 0.12),
            int(width * 0.9),
            int(height * 0.5),
        ),
        fill=(*MAGENTA, 24),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(width, height) // 18))
    return Image.alpha_composite(img, glow)


def paste_centered(canvas: Image.Image, asset: Image.Image, y_ratio: float, scale: float) -> None:
    target = int(min(canvas.width, canvas.height) * scale)
    ratio = target / max(asset.width, asset.height)
    new_size = (max(1, int(asset.width * ratio)), max(1, int(asset.height * ratio)))
    resized = asset.resize(new_size, Image.Resampling.LANCZOS)
    x = (canvas.width - resized.width) // 2
    y = int(canvas.height * y_ratio) - resized.height // 2
    canvas.alpha_composite(resized, (x, y))


def logo_text_only(logo: Image.Image) -> Image.Image:
    # Split the horizontal lockup after the icon by finding the text column gap.
    alpha = logo.split()[-1]
    width, height = logo.size
    icon_end = int(width * 0.34)

    for x in range(icon_end, int(width * 0.5)):
        column = [alpha.getpixel((x, y)) for y in range(height // 4, height * 3 // 4, 8)]
        if max(column) < 12:
            icon_end = x
            break

    return logo.crop((icon_end, 0, width, height))


def create_square_icon(size: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BG_DARK + (255,))
    padding = int(size * 0.12)
    target = size - padding * 2
    ratio = target / max(icon.width, icon.height)
    new_size = (max(1, int(icon.width * ratio)), max(1, int(icon.height * ratio)))
    resized = icon.resize(new_size, Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def create_box_art(size: int) -> Image.Image:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    canvas = radial_background((size, size))
    paste_centered(canvas, logo, 0.5, 0.78)
    return canvas


def create_poster_art(width: int, height: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((width, height))

    paste_centered(canvas, icon, 0.36, 0.38)
    paste_centered(canvas, text, 0.58, 0.72)

    draw = ImageDraw.Draw(canvas)
    font_size = max(14, height // 38)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()

    subtitle = "Yerel AI ile sesi metne dönüştürün"
    bbox = draw.textbbox((0, 0), subtitle, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (width - text_w) // 2
    text_y = int(height * 0.86)
    draw.text((text_x, text_y), subtitle, fill=(160, 210, 220, 220), font=font)
    return canvas


def save_asset(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "PNG", optimize=True)
    print(f"Created {path.relative_to(ROOT)} ({image.width}x{image.height})")


def main() -> None:
    assets = {
        "icons/app-tile-300x300.png": create_square_icon(300),
        "icons/icon-medium-150x150.png": create_square_icon(150),
        "icons/icon-small-71x71.png": create_square_icon(71),
        "store-logos/box-art-1080x1080.png": create_box_art(1080),
        "store-logos/box-art-2160x2160.png": create_box_art(2160),
        "store-logos/poster-art-720x1080.png": create_poster_art(720, 1080),
        "store-logos/poster-art-1440x2160.png": create_poster_art(1440, 2160),
    }

    for relative_path, image in assets.items():
        save_asset(image, OUTPUT_DIR / relative_path)

    print(f"\nAll store assets saved to {OUTPUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
