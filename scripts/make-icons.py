"""
Home-screen icons, generated from the logo. `python3 scripts/make-icons.py` (needs Pillow
and numpy).

Everything in `public/` comes from one source file in `docs/design/`. Hand-editing an icon
means the next person to touch the logo silently reverts it, so regenerate instead.

Three decisions worth keeping:

  THE MARK ONLY, NOT THE LOCKUP. The wordmark stops being readable somewhere around 256px,
  and an icon carrying an unreadable word is a smudge. The circle-and-book silhouette still
  reads at 192.

  THE BACKGROUND IS RECOLOURED, NOT CROPPED AROUND. The art sits on neutral white
  (254,254,254) while the book's own pages are warm (254,251,243). That difference is the
  only reliable way to tell "background" from "paper the recipe is printed on", so neutral
  near-white becomes `paper` and everything warm is left alone. Get this wrong in the other
  direction and the book's pages turn cream too, which flattens the whole illustration.

  THE MASKABLE ONE IS SMALLER ON PURPOSE. Platforms crop a maskable icon to a circle
  inscribed in the middle 80%. At 62% of the canvas the vine and the book's outer edge
  survive that crop rather than being sliced off.
"""

from PIL import Image
import numpy as np

SOURCE = 'docs/design/ChatGPT Image Aug 15, 2026, 11_07_24 PM.png'
PAPER = (0xF6, 0xF3, 0xE9)  # tailwind `paper`, and the manifest's background_color
MARK = (76, 73, 785, 916)  # the lockup splits at the empty columns 785..828
COLOURS = 128  # illustration, not a photograph — 128 is invisible here and a third the bytes


def flattened() -> Image.Image:
    """The lockup with its neutral-white ground replaced by `paper`."""
    image = Image.open(SOURCE).convert('RGB')
    channels = np.asarray(image).astype(np.int16)
    lo, hi = channels.min(axis=2), channels.max(axis=2)
    ground = (lo >= 249) & ((hi - lo) <= 2)
    pixels = np.asarray(image).copy()
    pixels[ground] = PAPER
    return Image.fromarray(pixels)


def squared_mark() -> Image.Image:
    """The mark alone, trimmed and centred on a square of paper so nothing is cropped."""
    mark = flattened().crop(MARK)
    side = max(mark.size)
    square = Image.new('RGB', (side, side), PAPER)
    square.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    return square


def write(square: Image.Image, size: int, fill: float, path: str) -> None:
    art = int(round(size * fill))
    canvas = Image.new('RGB', (size, size), PAPER)
    canvas.paste(square.resize((art, art), Image.LANCZOS), ((size - art) // 2,) * 2)
    canvas.quantize(colors=COLOURS, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save(
        path, optimize=True
    )
    print(f'{path}  {size}px  art at {fill:.0%}')


if __name__ == '__main__':
    square = squared_mark()
    write(square, 192, 0.96, 'public/icon-192.png')
    write(square, 512, 0.96, 'public/icon-512.png')
    write(square, 512, 0.62, 'public/icon-maskable-512.png')
