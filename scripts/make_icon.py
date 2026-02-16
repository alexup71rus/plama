from __future__ import annotations

from pathlib import Path

from PIL import Image


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    electron_dir = repo / "electron"

    # Current file is misnamed: it's actually a PNG.
    source_png = electron_dir / "logo.icns"
    if not source_png.exists():
        raise SystemExit(f"Missing source icon: {source_png}")

    logo = Image.open(source_png).convert("RGBA")

    # Dark background so a white logo doesn't disappear on light system icon backdrops.
    bg_color = (11, 18, 32, 255)  # #0B1220
    canvas_size = (1024, 1024)
    canvas = Image.new("RGBA", canvas_size, bg_color)

    max_w = int(canvas_size[0] * 0.62)
    max_h = int(canvas_size[1] * 0.62)
    scale = min(max_w / logo.width, max_h / logo.height)
    new_size = (
        max(1, int(logo.width * scale)),
        max(1, int(logo.height * scale)),
    )

    logo = logo.resize(new_size, Image.LANCZOS)

    # Force the logo pixels to white wherever alpha exists (keeps silhouette crisp).
    _, _, _, alpha = logo.split()
    white = Image.new("RGBA", logo.size, (255, 255, 255, 255))
    logo = Image.composite(white, logo, alpha)

    pos = ((canvas_size[0] - logo.width) // 2, (canvas_size[1] - logo.height) // 2)
    canvas.alpha_composite(logo, dest=pos)

    # Save a PNG variant (useful for Linux) and for generating .ico/.icns.
    out_png = electron_dir / "logo.png"
    canvas.save(out_png, "PNG")

    # Build iconset for macOS .icns
    iconset_dir = electron_dir / "AppIcon.iconset"
    iconset_dir.mkdir(parents=True, exist_ok=True)

    sizes = [16, 32, 128, 256, 512]
    for s in sizes:
        for scale in (1, 2):
            px = s * scale
            resized = canvas.resize((px, px), Image.LANCZOS)
            name = f"icon_{s}x{s}" + ("@2x" if scale == 2 else "") + ".png"
            resized.save(iconset_dir / name, "PNG")

    # Generate a proper multi-size .ico
    out_ico = electron_dir / "logo.ico"
    canvas.save(
        out_ico,
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )

    print(f"Wrote {out_png}")
    print(f"Wrote iconset {iconset_dir}")
    print(f"Wrote {out_ico}")


if __name__ == "__main__":
    main()
