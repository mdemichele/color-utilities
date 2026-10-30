#!/usr/bin/env python3
"""Resizes an image for color extraction (see dev_guide/extracting_colors.md).

The image is scaled to exact dimensions (128 x 128 by default) without
preserving aspect ratio, so every part of the image contributes to the result.
Output is written as PNG so lossy compression does not alter the colors.

Usage:
  python tools/resize_image.py sunday-image.jpg
  python tools/resize_image.py in.jpg -o out.png --width 64 --height 64

Requires Pillow (pip install pillow).
"""

import argparse
import pathlib
import sys

from PIL import Image, ImageOps


def resize_image(src, dst, width=128, height=128):
  with Image.open(src) as image:
    # Apply EXIF orientation so phone photos are not rotated.
    image = ImageOps.exif_transpose(image)
    mode = "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
    resized = image.convert(mode).resize((width, height), Image.Resampling.LANCZOS)
    resized.save(dst, format="PNG")


def main(argv=None):
  parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  parser.add_argument("input", type=pathlib.Path, help="source image")
  parser.add_argument(
      "-o", "--output", type=pathlib.Path,
      help="destination PNG (default: <input>-<W>x<H>.png beside the input)")
  parser.add_argument("--width", type=int, default=128)
  parser.add_argument("--height", type=int, default=128)
  args = parser.parse_args(argv)

  if args.width <= 0 or args.height <= 0:
    parser.error("width and height must be positive")
  output = args.output or args.input.with_name(
      f"{args.input.stem}-{args.width}x{args.height}.png")

  try:
    resize_image(args.input, output, args.width, args.height)
  except (OSError, ValueError) as e:
    print(f"error: {e}", file=sys.stderr)
    return 1
  print(output)
  return 0


if __name__ == "__main__":
  sys.exit(main())
