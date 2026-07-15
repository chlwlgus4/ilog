from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS = 1024
BACKGROUND = "#DCEEFF"
BACKGROUND_CENTER = "#F7FBFF"
BACKGROUND_ALT = "#CDE4FF"
SKIN = "#FFE8AF"
SKIN_SHADOW = "#F6D88F"
HAIR = "#FFD54F"
HAIR_ALT = "#F2C43A"
HAIR_HIGHLIGHT = "#FFE585"
OUTLINE = "#4A3427"
WHITE = "#FFFDFB"


def rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[index:index + 2], 16) for index in range(0, 6, 2))


def blend(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(round(a[index] * (1 - t) + b[index] * t)) for index in range(3))


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def radial_gradient(size: int, inner: str, outer: str, center: tuple[float, float], radius: float) -> Image.Image:
    inner_rgb = rgb(inner)
    outer_rgb = rgb(outer)
    image = Image.new("RGBA", (size, size))
    pixels = image.load()

    for y in range(size):
        for x in range(size):
            distance = ((x - center[0]) ** 2 + (y - center[1]) ** 2) ** 0.5
            t = clamp(distance / radius, 0.0, 1.0)
            color = blend(inner_rgb, outer_rgb, t)
            pixels[x, y] = (*color, 255)

    return image


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    return mask


def add_shadow(base: Image.Image, alpha: Image.Image, offset: tuple[int, int], blur: int, opacity: int) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    shadow.putalpha(shadow_alpha)
    tinted = Image.new("RGBA", base.size, (0, 0, 0, opacity))
    shadow = ImageChops.multiply(shadow, tinted)
    base.alpha_composite(shadow, dest=offset)


def paste_centered(base: Image.Image, overlay: Image.Image, center: tuple[int, int]) -> None:
    x = center[0] - overlay.width // 2
    y = center[1] - overlay.height // 2
    base.alpha_composite(overlay, dest=(x, y))


def layer_from_mask(mask: Image.Image, color: str, opacity: int = 255) -> Image.Image:
    layer = Image.new("RGBA", mask.size, (*rgb(color), 0))
    alpha = mask.point(lambda value: value * opacity // 255)
    layer.putalpha(alpha)
    return layer


def polygon(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: str) -> None:
    draw.polygon(list(points), fill=fill)


def create_background() -> Image.Image:
    gradient = radial_gradient(CANVAS, BACKGROUND_CENTER, BACKGROUND, center=(512, 250), radius=960)
    alt = radial_gradient(CANVAS, BACKGROUND_ALT, BACKGROUND, center=(780, 820), radius=1100)
    background = Image.blend(gradient, alt, 0.35)

    bloom = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    bloom_draw = ImageDraw.Draw(bloom)
    bloom_draw.ellipse((120, 40, 904, 824), fill=(255, 255, 255, 96))
    bloom = bloom.filter(ImageFilter.GaussianBlur(86))
    background.alpha_composite(bloom)
    return background


def create_character(transparent_background: bool) -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    shadow = Image.new("L", (CANVAS, CANVAS), 0)
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((278, 228, 746, 692), fill=210)
    shadow_draw.polygon([(484, 642), (540, 642), (560, 760), (512, 796), (464, 760)], fill=170)
    add_shadow(image, shadow, offset=(0, 18), blur=26, opacity=82)

    draw.ellipse((258, 350, 350, 442), fill=SKIN, outline=OUTLINE, width=16)
    draw.ellipse((674, 350, 766, 442), fill=SKIN, outline=OUTLINE, width=16)

    draw.ellipse((282, 214, 742, 674), fill=SKIN, outline=OUTLINE, width=18)

    face_highlight = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    face_highlight_draw = ImageDraw.Draw(face_highlight)
    face_highlight_draw.ellipse((338, 266, 560, 488), fill=(255, 255, 255, 86))
    face_highlight = face_highlight.filter(ImageFilter.GaussianBlur(44))
    image.alpha_composite(face_highlight)

    hair_mask = Image.new("L", (CANVAS, CANVAS), 0)
    hair_mask_draw = ImageDraw.Draw(hair_mask)
    hair_mask_draw.ellipse((432, 112, 646, 326), fill=255)
    hair_mask_draw.ellipse((438, 160, 566, 288), fill=0)
    hair_outline_mask = hair_mask.filter(ImageFilter.MaxFilter(29))
    image.alpha_composite(layer_from_mask(hair_outline_mask, OUTLINE))
    image.alpha_composite(layer_from_mask(hair_mask, HAIR))

    hair_detail = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    hair_detail_draw = ImageDraw.Draw(hair_detail)
    hair_detail_draw.arc((468, 138, 618, 304), start=322, end=66, fill=HAIR_HIGHLIGHT, width=16)
    hair_detail_draw.arc((504, 150, 638, 310), start=332, end=74, fill=HAIR_ALT, width=14)
    image.alpha_composite(hair_detail)

    draw.line([(394, 384), (472, 404)], fill=OUTLINE, width=20)
    draw.line([(552, 404), (630, 384)], fill=OUTLINE, width=20)

    draw.ellipse((390, 404, 462, 488), fill=OUTLINE)
    draw.ellipse((562, 404, 634, 488), fill=OUTLINE)
    draw.ellipse((428, 416, 448, 436), fill=WHITE)
    draw.ellipse((600, 416, 620, 436), fill=WHITE)

    draw.arc((464, 492, 560, 548), start=22, end=158, fill=OUTLINE, width=12)

    draw.rounded_rectangle((496, 650, 528, 692), radius=12, fill=OUTLINE)
    polygon(draw, [(488, 686), (536, 686), (552, 766), (512, 800), (472, 766)], OUTLINE)

    if not transparent_background:
        glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        glow_draw.ellipse((214, 186, 810, 782), fill=(255, 255, 255, 28))
        glow = glow.filter(ImageFilter.GaussianBlur(44))
        image.alpha_composite(glow)

    return image


def create_full_icon() -> Image.Image:
    background = create_background()
    foreground = create_character(transparent_background=False)
    background.alpha_composite(foreground)
    return background


def create_android_background() -> Image.Image:
    background = radial_gradient(CANVAS, BACKGROUND_CENTER, BACKGROUND, center=(512, 240), radius=980)
    halo = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_draw.ellipse((180, 80, 844, 760), fill=(255, 255, 255, 72))
    halo_draw.ellipse((260, 200, 764, 720), fill=(255, 255, 255, 34))
    halo = halo.filter(ImageFilter.GaussianBlur(42))
    background.alpha_composite(halo)
    return background


def create_android_foreground() -> Image.Image:
    foreground = create_character(transparent_background=True)
    alpha = foreground.getchannel("A")
    bounds = alpha.getbbox()
    cropped = foreground.crop(bounds)
    target = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    safe_size = 700
    scaled = cropped.resize(
        (
            int(cropped.width * safe_size / max(cropped.width, cropped.height)),
            int(cropped.height * safe_size / max(cropped.width, cropped.height)),
        ),
        Image.Resampling.LANCZOS,
    )
    paste_centered(target, scaled, (512, 530))
    return target


def create_preview(full_icon: Image.Image) -> Image.Image:
    preview = Image.new("RGBA", (1024, 1024), "#FFF9F2")
    masked = full_icon.copy()
    masked.putalpha(rounded_mask(1024, 220))

    shadow = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((182, 166, 842, 826), radius=220, fill=(0, 0, 0, 72))
    shadow = shadow.filter(ImageFilter.GaussianBlur(42))
    preview.alpha_composite(shadow)

    masked = masked.resize((660, 660), Image.Resampling.LANCZOS)
    paste_centered(preview, masked, (512, 496))
    return preview


def create_monochrome() -> Image.Image:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    stroke = 28
    draw.ellipse((286, 216, 738, 668), outline="#000000", width=stroke)
    draw.ellipse((258, 352, 342, 436), outline="#000000", width=stroke - 4)
    draw.ellipse((682, 352, 766, 436), outline="#000000", width=stroke - 4)
    draw.arc((426, 118, 648, 334), start=214, end=34, fill="#000000", width=stroke)
    draw.line([(396, 386), (474, 406)], fill="#000000", width=stroke - 6)
    draw.line([(550, 406), (628, 386)], fill="#000000", width=stroke - 6)
    draw.ellipse((392, 410, 458, 486), fill="#000000")
    draw.ellipse((566, 410, 632, 486), fill="#000000")
    draw.arc((462, 494, 562, 548), start=22, end=158, fill="#000000", width=stroke - 14)
    draw.rounded_rectangle((496, 650, 528, 696), radius=10, fill="#000000")
    polygon(draw, [(486, 690), (538, 690), (558, 784), (512, 820), (466, 784)], "#000000")

    return image


def save_png(image: Image.Image, path: Path, size: tuple[int, int] | None = None) -> None:
    if size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    image.save(path, format="PNG")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    assets = root / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    full_icon = create_full_icon()
    android_background = create_android_background()
    android_foreground = create_android_foreground()
    monochrome = create_monochrome()
    splash = create_character(transparent_background=True)
    preview = create_preview(full_icon)

    save_png(full_icon, assets / "babyboss-icon-final.png")
    save_png(splash, assets / "babyboss-splash-final.png")
    save_png(preview, assets / "babyboss-icon-final-preview.png")
    save_png(full_icon, assets / "babyboss-favicon-final.png", size=(256, 256))
    save_png(android_background, assets / "babyboss-android-background-final.png")
    save_png(android_foreground, assets / "babyboss-android-foreground-final.png")
    save_png(monochrome, assets / "babyboss-android-monochrome-final.png")


if __name__ == "__main__":
    main()
