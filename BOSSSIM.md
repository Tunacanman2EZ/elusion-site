# The Boss Sim

`simulator.html` — the Crowned Behemoth Balance Console. A four-class party runs
the boss arena's three waves and then the Crowned Behemoth, ten ticks a second,
and the page shows how long it takes, who carries it, where the hits land and
where it breaks. This file is everything behind it: where each number comes
from, what was measured and how, every assumption the model makes, what the
tests hold it to, and what to do when the game changes.

The sim is **in development, like the game** — every number below is the game's
as of the version named in `bosssim.js` (`VERSION`) and the date in
`bosssim-data.js` (`measured`).

---

## The files

| File | What it is | Published |
|---|---|---|
| `simulator.html` | The page: dials, results, and a "How it works" section built from the data | yes |
| `bosssim.js` | The model. Every number typed from the game, with the file it came from | yes |
| `bosssim-data.js` | What the game was **measured** doing. Generated — never edit it by hand | yes |
| `tools/bossmeasure.gd` | Measures each boss in the game engine | no |
| `tools/petmeasure.gd` | Measures each pet in the game engine | no |
| `tools/bosssim_data.mjs` | Turns the two measurements into `bosssim-data.js` | no |
| `test_bosssim.mjs` | The test suite: the game's numbers, the data, the model with every option, the page | no |

`build.mjs` publishes the first three and nothing else.

---

## Two kinds of number

**The game's own numbers** are typed into `bosssim.js` from the game's files.
`test_bosssim.mjs`, given the game's folder (`GAME=...`), reads every one of them
back out of those files and fails on any that differ.

**What the game does** — how often a boss's swing, spikes, stalker pillars and
puddles actually land, how often a pet actually fires — is not a number in any
one file. It comes out of two independent clocks, a dozen spike patterns, random
pattern choices, animation timing and collision shapes. So it is **measured, in
the game engine itself**, and written to `bosssim-data.js` by a script. Nothing
in that file is typed.

### The game's numbers, and where each comes from

| Number | Value | Game file |
|---|---|---|
| Class health and mana (base, per level) | warrior 180+12 / 180+10, mage 110+5 / 250+16, healer 140+7 / 220+14, tank 260+22 / 200+10 | `data/gamedata.json` `classes` |
| Class base damage and cadence | warrior 24 / 1.0 s, mage 9 / 0.45 s, healer 3 / 0.1 s, tank 4 / 0.25 s | `gamedata.json` `combat.classes` |
| Slash wave | 0.75 of a swing, 10 mana | `combat.classes.warrior.wave_ratio`; `warrior.gd` `slashwave_mana_cost` |
| Spell, shot, aura, Dynamite | 15 mana; 1 mana; 2 mana every 0.5 s; 4 mana, 1 s fuse | `mage.gd`, `healer.gd`, `tank.gd` `@export`s |
| Double cast | 10% | `combat.double_chance` |
| Skills and agility | +1% damage a level of attack and of magic; cooldowns ÷ (1 + 1% a level of agility), at most ×2 | `combat.skill_step`, `agility_step`, `agility_cap` |
| Weapons, armour, rings, amulets, iron to ember | damage, damage %, armour, health, mana, level | `gamedata.json` `items` |
| Mythic weapons | Double Axe 110, Meteorite 41, Dynamite 18; +9%; level 22 | `gamedata.json` `items` |
| Weapon roll | ±25% (`damage_spread`); the sim uses the middle | `items` |
| Stat rolls | every stat at 85%, 100% or 120% (Perfect), integer arithmetic halving up | `constants.quality_*`; `ItemRegistry.scale_stat` |
| Defense tiers | 10% (skill 1), 20% (20), 30% (40), 40% (60), 50% (80) | `src/characters/playerstats.gd` `DEFENSE_TIERS` |
| Armour | armour ÷ (armour + 200) | `constants.armour_half_point` |
| Resistance | up to 50%, matching element only | `constants.resist_cap` |
| The order damage is cut in | defense tier, then armour, then resistance; floored; never under 1 | `player.gd` `damage_taken()` |
| Potions | tiny 20 (lv 1), small 45 (5), medium 90 (10), large 160 (16), greater 260 (22), health and mana | `items` |
| Boss health | Light 4,576 · Wind 4,992 · Water 5,616 · Ice 6,188 · Earth 7,384 · Fire 9,200 · Crowned 13,800 | `gamedata.json` `enemies` |
| Boss spike before its element | 21, 21, 30, 30, 42, 60, 83 | `data/enemies/<boss>.tres` `projectile_damage` |
| Element damage and telegraph | Light ×1.15 / 0.55, Wind ×0.90 / 0.60, Water ×0.85 / 1.00, Ice ×0.90 / 1.35, Earth ×1.25 / 1.30, Fire ×1.00 / 1.00, Dark ×1.10 / 1.00 | `src/projectiles/bossprojectile.gd` `ELEMENT_PROFILE` |
| Swing and stalker pillar | 45/34 and 22/34 of the spike | `src/enemies/bossenemy.gd` `MELEE_SHARE`, `TRAIL_SHARE` |
| Phases | at 66% and 33% of health | `bossenemy.gd` `PHASE_TWO_AT`, `PHASE_THREE_AT` |
| The waves | Light; Wind + Water; Ice + Earth + Fire; then the Crowned's room | `scene/bossarena.tscn` gates' `wave`; `boss.tscn` |
| Puddles | a pillar leaves one on 35% × the element's chance (Fire 1.3, Ice 0.8, Water 0.5 with 2 extra pools, Earth and Dark 1.0, Light and Wind none); it lasts its scene's lifetime × 0.6 and ticks every 0.5 s (Fire 5, Earth and Dark 4, Light 3, the rest 2) | `ELEMENT_PROFILE`; `bossenemy.gd` `PUDDLE_CHANCE`; `bossprojectile.gd` `puddle_life_scale`; `scene/projectiles/<element>puddle.tscn`; `acidpuddle.gd` `tick_interval` |
| Pet damage | half the owner's multiplier on the pet's own damage | `combat.pet_share`; `pet.gd` `PET_STAT_SHARE` |

---

## What was measured, and how

### The bosses — `tools/bossmeasure.gd`

Each of the seven bosses fights a **stand-in player that never moves**: a
`CharacterBody2D` in the `player` group, on the player's collision layer, with an
8 px body named `bodyshape` (where every boss aims). The boss is held where it
stands — it attacks exactly as it would, but cannot walk onto the stand-in or
away from what it has put on the floor — and its health is held at 83%, 50% and
17%, one run per phase. Each phase is run twice: the stand-in **28 px away**,
inside the boss's 40 px swing, and **90 px away**, inside its 120 px attack range
but out of reach. Five minutes of game time each, 42 runs, at 80 physics ticks a
second with real-time pacing off.

Every hit on the stand-in is recorded by its size, which names what dealt it:
the swing is `melee_damage()`, a stalker's pillar the profiled `trail_damage()`, a
spike (from either track) the profiled spike, and a tick of 10 or less a puddle.
`tools/bosssim_data.mjs` refuses a hit of any other size — an attack the sim
cannot name is one it does not know about. Everything the boss puts on the floor
is counted too.

What it showed, and what the tests now hold the data to:

- A boss with a player in reach swings **once every 1.5 s** (`attack_cooldown`).
  Out of reach it never swings and casts its pillar track instead — several
  hundred pillars a minute.
- The **spike track never stops**, in reach or not: about 340–360 spikes a minute in
  the first phase, about 700–760 in the third.
- **Stalkers** come out every 9 s in phase 2 and every 5.5 s in phase 3, and each
  raises 12–13 pillars under its target. None in phase 1.
- **Light and Wind leave no puddles.** Water leaves the most (about 680 a minute at
  range in the first phase), then Fire, then Earth and Dark, then Ice.

Raw damage a second on the stand-in, before any armour (measured 2026-10-07,
v0.11.4 — `bosssim-data.js` holds the current figures, and the page draws this
table from it):

| Boss | In reach (phase 1 / 2 / 3) | At range (phase 1 / 2 / 3) |
|---|---|---|
| Light | 34 / 58 / 74 | 25 / 46 / 58 |
| Wind | 31 / 50 / 63 | 19 / 37 / 46 |
| Water | 45 / 70 / 88 | 32 / 52 / 65 |
| Ice | 46 / 78 / 94 | 32 / 58 / 70 |
| Earth | 75 / 146 / 186 | 59 / 123 / 149 |
| Fire | 100 / 158 / 199 | 76 / 125 / 154 |
| Crowned | 135 / 224 / 284 | 99 / 174 / 220 |

### The pets — `tools/petmeasure.gd`

Each of the seven pets is summoned beside a stand-in owner with a damage
multiplier of 1 and an attack speed of 1.0, 1.25, 1.5, 1.75 and 2.0, with the
owner 28 px and 90 px from the Fire Crowned, held still with its health topped
up every frame. Every point of health the boss loses is recorded by size: the
pet's shot is `int(damage × 1 × 0.5)`, anything else is something it left behind.
Two minutes each, 70 runs.

- A pet fires **once every 2 s** at base speed, rising to 0.75 shots a second at
  the owner's top speed (half the owner's speed bonus, as `pet.gd` says). The
  **Small Slime** is slower (0.42–0.61), held back by its long attack animation.
- The **Crowned pet** also leaves puddles: about 7–12 damage a second more, not
  scaled by the owner.
- **Found: the Electric Sprite pet never hits a boss from range.** Its orb
  (`petmagicprojectile.tscn`) flies at **20 px/s** — every other pet shot uses the
  script's default of 300 — and lives 4 s, so it reaches about 80 px. It lands
  from beside the boss and never from 90 px. That looks like a bug in the game
  rather than a design; the sim shows it as it is, and the test names it so it is
  noticed the day it is fixed.

---

## The model

Ten times a second, for each wave in turn:

1. **The party attacks.** Single-target attacks go into the living boss with the
   least health. The tank's aura reaches every boss standing on the tank. Each
   attack costs its mana; an attack with no mana to pay does nothing. Each player
   attacks for the share of the time set by *Time attacking*. Pets fight all the
   time, into the same boss.
2. **The bosses attack.** Each boss deals, a second, what it was measured dealing
   a player who never moves — in reach if someone holds it, at range if not — for
   its current phase. Each hit is cut by the target's defense tier, armour and
   resistance the way the game cuts it (per hit, floored, never under 1), and only
   part of it lands:
   - spikes and stalker pillars land **(1 − dodging) ^ telegraph** — everything at
     0%, nothing at 100%, and the same dodging counts for more against a slow ring
     (Ice 1.35) than a fast one (Light 0.55);
   - puddles land **1 − dodging**; they lie there to be seen;
   - **the swing always lands** on whoever is in reach. Holding is the job.
3. **Who is hit.** *Tank holds:* every boss is on the tank. Its swing lands on
   everyone in reach — the tank, and a warrior beside it with a sword (a warrior
   with the Double Axe fights from range) — and its spike track, stalkers and
   puddles on the tank. If the tank goes down, a sword warrior holds; then nobody.
   *Spread out*, or nobody left to hold: the bosses cast instead of swinging, and
   their attacks fall evenly across the living party as their target moves.
4. **Potions.** Below 40% health a player drinks the best health potion their
   level allows; when an attack cannot be paid for, the best mana potion.
5. **Down is out.** A player at 0 health is out for the rest of the run — a
   revive in the game lands in town.
6. **Waves.** A wave ends when its last boss falls and the next opens at once. The
   only rest is before the Crowned's room, if *Rest* is chosen. A wave still going
   after ten minutes is called a wipe.

At **0% dodging** the sim deals exactly the measured damage — the test checks it to
the last decimal for every boss, stance and phase. That is where the model and
the game meet; everything above it is the dodging dial.

### Assumptions, all of them

- **Dodging is a dial, not a number from the game.** Nothing in the game says how
  well a person dodges. The telegraph exponent is the sim's way of making fast
  rings harder; it is a modelling choice, not a measurement.
- **Time attacking** (default 85%) is the same kind of dial: the rest of the time
  is spent moving.
- The holder **takes every swing**; nobody steps out of reach mid-wind-up.
- In a **spread** party the bosses' attacks are split evenly; in the game the
  nearest player takes them, and that moves.
- Everyone focuses the **weakest boss**; only the tank's aura reaches more than
  one, and only bosses holding on the tank.
- Weapons hit at the **middle of their roll**.
- Each player **drinks on time**, at 40% health or an empty bar.
- Every player brings the **same pet**, and pets fire at the boss everyone is on.
- **The Crowned's dark rings are dim** (`ring_alpha` 0.22) and harder to read.
  The game has no number for how much harder, so the sim does not invent one —
  lower the dodging to try it.
- It is the **average**: no luck, no positions, no boss walking.

---

## The tests

```powershell
node build.mjs
node test_bosssim.mjs
$env:GAME = "<path to the game folder>"; node test_bosssim.mjs   # with the game's numbers
```

Playwright, as for `test_e2e.mjs` (see `DEPLOY.md`). Without `GAME`, the game's
numbers are skipped and the run says so.

1. **The game's numbers** — every number in the table above, read back out of the
   game's files.
2. **The measured data** — complete; every hit the size its attack deals; swings
   only in reach, one every 1.5 s; no stalker pillars before phase 2, more in phase
   3 than 2, stalkers every 9 then 5.5 s; no puddles from Light or Wind; the pillar
   track only at range; every pet faster at higher speed; the Electric Sprite
   finding.
3. **Calibration** — at 0% dodging, exactly the measured damage; the dodging
   formula; a fast ring lets more through than a slow one.
4. **Every option** — every combination of gear tier, weapons, stat rolls,
   resistance element, pet, formation and rest (9,216); every value of every dial
   from four starting parties; 1,500 random parties, each run twice and each with
   every one-step improvement. Nothing is NaN or out of range, the same party gets
   the same answer, and **no improvement** — more gear, level, skills, potions,
   dodging, resistance, time attacking, a pet, better rolls, a rest — **ever makes a
   run worse**. Unknown options are refused, and the slowest run is timed.
5. **The page**, in Chromium under the site's real Content-Security-Policy —
   every preset, every dial through every value, every button, every list: the
   page reads every dial as it is shown and shows the model's answer every time, no NaN on screen, no script error,
   every control has a name, and nothing scrolls sideways at 1280, 768, 390 or 340
   wide.

**Every check has been seen to fail.** Fifteen deliberate breaks, each caught:
a wrong boss number, a potion that hurts, dodging backwards, mana below zero, a
random choice, a boss in the wrong wave, a pet dealing NaN, a hand-edited rate, the
page dropping the pet, the page rounding its own way, a wrong defense tier, a wrong
level for ember, controls overflowing a phone, a control without a name, and bad
options let through.

---

## When the game changes

1. **A typed number moved** (a price, a curve, a boss's health or damage):
   `GAME=... node test_bosssim.mjs` names it. Change it in `bosssim.js`.
2. **A boss or a pet behaves differently** (a pattern, a cooldown, a puddle, an
   animation): measure again, from the game's folder:

   ```powershell
   godot --headless --path <game> --fixed-fps 80 --script <site>\tools\bossmeasure.gd -- seconds=300 > boss.txt
   godot --headless --path <game> --fixed-fps 80 --script <site>\tools\petmeasure.gd -- seconds=120 > pet.txt
   node tools\bosssim_data.mjs boss.txt pet.txt <game version>
   ```

   (`godot` is the editor binary; the boss run takes a few minutes. The game's
   art must be present — the bosses are real scenes.)
3. `node build.mjs`, then `GAME=... node test_bosssim.mjs`. If the game's rules
   changed (a new phase, a new attack), a check in part 2 says so — that is the
   point.
4. Set `VERSION` in `bosssim.js` to the game's version.
