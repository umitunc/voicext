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


def resize_asset(asset: Image.Image, target: int) -> Image.Image:
    ratio = target / max(asset.width, asset.height)
    new_size = (max(1, int(asset.width * ratio)), max(1, int(asset.height * ratio)))
    return asset.resize(new_size, Image.Resampling.LANCZOS)


def paste_centered(canvas: Image.Image, asset: Image.Image, y_ratio: float, scale: float) -> None:
    target = int(min(canvas.width, canvas.height) * scale)
    resized = resize_asset(asset, target)
    x = (canvas.width - resized.width) // 2
    y = int(canvas.height * y_ratio) - resized.height // 2
    canvas.alpha_composite(resized, (x, y))


def paste_at(
    canvas: Image.Image,
    asset: Image.Image,
    x_ratio: float,
    y_ratio: float,
    scale: float,
    *,
    anchor: str = "center",
) -> None:
    target = int(min(canvas.width, canvas.height) * scale)
    resized = resize_asset(asset, target)
    if anchor == "center":
        x = int(canvas.width * x_ratio) - resized.width // 2
        y = int(canvas.height * y_ratio) - resized.height // 2
    else:
        x = int(canvas.width * x_ratio)
        y = int(canvas.height * y_ratio)
    canvas.alpha_composite(resized, (x, y))


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_name = "segoeuib.ttf" if bold else "segoeui.ttf"
    try:
        return ImageFont.truetype(f"C:/Windows/Fonts/{font_name}", size)
    except OSError:
        return ImageFont.load_default()


def logo_text_only(logo: Image.Image) -> Image.Image:
    # Keep the wordmark by trimming only the icon on the left side.
    alpha = logo.split()[-1]
    width, height = logo.size
    icon_right = 0

    for x in range(int(width * 0.48)):
        column = [alpha.getpixel((x, y)) for y in range(0, height, 6)]
        if max(column) > 20:
            icon_right = x

    left = min(icon_right + int(width * 0.015), int(width * 0.36))
    return logo.crop((left, 0, width, height))


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


def draw_footer_tagline(canvas: Image.Image, text: str, y_ratio: float = 0.86) -> None:
    draw = ImageDraw.Draw(canvas)
    font = load_font(max(14, canvas.height // 38))
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (canvas.width - text_w) // 2
    text_y = int(canvas.height * y_ratio)
    draw.text((text_x, text_y), text, fill=(160, 210, 220, 220), font=font)


def create_poster_art(width: int, height: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((width, height))

    paste_centered(canvas, icon, 0.36, 0.38)
    paste_centered(canvas, text, 0.58, 0.72)
    draw_footer_tagline(canvas, "Yerel AI ile sesi metne dönüştürün")
    return canvas


def create_super_hero_art(width: int, height: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((width, height))

    paste_at(canvas, icon, 0.28, 0.46, 0.52)
    paste_at(canvas, text, 0.62, 0.42, 0.62)

    draw = ImageDraw.Draw(canvas)
    features = [
        "Whisper AI ile yerel transkripsiyon",
        "GPU hızlandırmalı · Tamamen çevrimdışı",
    ]
    font = load_font(max(16, height // 28))
    y = int(height * 0.72)
    for line in features:
        draw.text((int(width * 0.46), y), line, fill=(170, 200, 215, 210), font=font)
        y += int(height * 0.07)
    return canvas


def create_titled_hero_art(width: int, height: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((width, height))

    paste_at(canvas, icon, 0.5, 0.34, 0.34)
    paste_at(canvas, text, 0.5, 0.62, 0.58)
    draw_footer_tagline(canvas, "Yerel AI ile sesi metne dönüştürün", y_ratio=0.84)
    return canvas


def create_branded_key_art(width: int, height: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((width, height))

    paste_centered(canvas, icon, 0.34, 0.36)
    paste_centered(canvas, text, 0.56, 0.58)
    draw_footer_tagline(canvas, "Yerel AI ile sesi metne dönüştürün", y_ratio=0.88)
    return canvas


def create_featured_promo_square(size: int) -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA")
    text = logo_text_only(Image.open(LOGO_PATH).convert("RGBA"))
    canvas = radial_background((size, size))

    paste_centered(canvas, icon, 0.38, 0.34)
    paste_centered(canvas, text, 0.66, 0.58)
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
        "promotional/super-hero-art-1920x1080.png": create_super_hero_art(1920, 1080),
        "promotional/super-hero-art-3840x2160.png": create_super_hero_art(3840, 2160),
        "promotional/titled-hero-art-1920x1080.png": create_titled_hero_art(1920, 1080),
        "promotional/branded-key-art-584x800.png": create_branded_key_art(584, 800),
        "promotional/featured-promo-square-1080x1080.png": create_featured_promo_square(1080),
    }

    for relative_path, image in assets.items():
        save_asset(image, OUTPUT_DIR / relative_path)

    print(f"\nAll store assets saved to {OUTPUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
