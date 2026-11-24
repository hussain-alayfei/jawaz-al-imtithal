"""Smaller copies of the home page's pictures, for srcset.

Run after a picture in src/assets/site/ is replaced:  python scripts/responsive-images.py

For each picture listed below it writes src/assets/site/sized/<name>-<width>.webp at the widths that are
smaller than the original (the original itself is the largest candidate). Same crop and aspect ratio,
Lanczos resampling, WebP at quality 85 (method 6), the colour profile kept. src/screens/landing/images.ts
finds the files by name, so nothing else needs editing.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "assets" / "site"
OUTPUT = SOURCE / "sized"
WIDTHS = (800, 1200, 1600)
QUALITY = 85
PICTURES = (
    "hero",
    "plan-desk",
    "laptop-model",
    "report-desk",
    "story-1",
    "story-2",
    "story-3",
    "story-4",
    "twin",
)


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    for stale in OUTPUT.glob("*.webp"):
        stale.unlink()
    for name in PICTURES:
        with Image.open(SOURCE / f"{name}.webp") as image:
            image.load()
            width, height = image.size
            profile = image.info.get("icc_profile")
            rgb = image.convert("RGB")
            for target in WIDTHS:
                if target >= width:
                    continue
                size = (target, round(height * target / width))
                copy = rgb.resize(size, Image.Resampling.LANCZOS)
                path = OUTPUT / f"{name}-{target}.webp"
                options = {"quality": QUALITY, "method": 6}
                if profile:
                    options["icc_profile"] = profile
                copy.save(path, "WEBP", **options)
                print(f"{path.relative_to(ROOT)}  {size[0]}x{size[1]}  {path.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
