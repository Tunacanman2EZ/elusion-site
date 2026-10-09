# tools/arena_stage.py - builds the home page's arena from the game's own art.
#
#   python tools/arena_stage.py <your-path>/Elusion_RPG
#
# Writes images/arena/: the room the monsters stand in (stage.png) and the
# three shadows. Not published itself (build.mjs ships only what it names); run
# it again if the game's floor or crypt props change.
#
# The health bars it used to copy are drawn in the death strips now
# (images/deaths/, recorded from the game), where they drop with each hit and
# go when the monster does.
#
# Everything here is Elusion Studios' own art (assetlicense.md: commissioned
# from Ahvassa with rights assigned). Nothing is taken from art/pack/, which is
# Clockwork Raven's and private.
#
# The room is drawn at the game's own size, one pixel per game pixel. The page
# shows it at three screen pixels to one (two in a small box), the same scale
# as the monsters, so they stand on it at their true size.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

if len(sys.argv) != 2:
    sys.exit("usage: python tools/arena_stage.py <path to the Elusion_RPG project>")
GAME = Path(sys.argv[1])
ART = GAME / "art"
OUT = Path(__file__).resolve().parent.parent / "images" / "arena"
OUT.mkdir(parents=True, exist_ok=True)

floor = Image.open(ART / "tiles" / "underground.png").convert("RGBA")   # the Field's floor
crypt = Image.open(ART / "floordecoration" / "floorwalls.png").convert("RGBA")

# 192 x 192: wider than any box it is shown in, so the page can centre it and
# crop the edges. The middle (where the monster stands) is base pixel 96, 128.
SIZE = 192
SLATE = (0x3A, 0x38, 0x43, 255)  # underground.png's floor colour
VOID = (0x16, 0x14, 0x1A, 255)
stage = Image.new("RGBA", (SIZE, SIZE), SLATE)


def part(img, x, y, w, h):
    return img.crop((x, y, x + w, y + h))


def put(img, x, y):
    stage.paste(img, (x, y), img)


# The back wall: dark above it, the crypt's wall runs end to end (their regions
# are the ones scene/crypt/wallrun4, wallrun2 and wallrun1 use), two pillars.
WALL_Y = 26
stage.paste(VOID, (0, 0, SIZE, WALL_Y + 4))
runs = [part(crypt, 154, 11, 101, 28), part(crypt, 100, 11, 51, 28), part(crypt, 71, 11, 26, 28)]
x, i = -14, 0
while x < SIZE:
    put(runs[i % 3], x, WALL_Y)
    x += runs[i % 3].width
    i += 1
pillar = part(crypt, 260, 9, 17, 30)
put(pillar, 44, WALL_Y - 2)
put(pillar, 131, WALL_Y - 2)

# The dirt patch the monster stands on, centred on 96, 130. It is also what
# makes the Crowned readable: its grey on the grey floor all but vanishes.
put(part(floor, 0, 128, 96, 96), 48, 82)

# Candles by the wall, and rubble kept away from the middle but inside the
# 138 game pixels a large box shows. Regions from
# scene/crypt/candelabra, skullcandles, rockcluster1 and 3, bones, skullsmall,
# rubble1, 2, 3 and 6, dirtpile1.
put(part(crypt, 67, 197, 19, 25), 34, WALL_Y + 20)
put(part(crypt, 178, 203, 15, 17), 143, WALL_Y + 26)
put(part(crypt, 152, 124, 32, 21), 22, 150)
put(part(crypt, 245, 130, 20, 14), 150, 158)
put(part(crypt, 197, 91, 15, 9), 146, 126)
put(part(crypt, 123, 91, 9, 9), 34, 118)
put(part(crypt, 75, 131, 14, 12), 148, 94)
put(part(crypt, 57, 134, 9, 8), 32, 98)
put(part(crypt, 161, 144, 6, 5), 120, 176)
put(part(crypt, 39, 136, 6, 5), 60, 182)
put(part(crypt, 199, 175, 11, 8), 34, 176)
stage.save(OUT / "stage.png")

# A shadow under each monster: a hard-edged ellipse, no blur, like the art.
# xs is the small slime's.
for name, (w, h) in {"shadow-xs": (18, 4), "shadow-s": (30, 6), "shadow-l": (44, 8)}.items():
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((0, 0, w - 1, h - 1), fill=(10, 8, 14, 110))
    img.save(OUT / f"{name}.png")

print("wrote", ", ".join(sorted(p.name for p in OUT.iterdir())))
