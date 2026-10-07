// bosssim.js — the Boss Sim's model. Loaded by simulator.html, and by
// test_bosssim.mjs, which runs every option through it.
//
// TWO KINDS OF NUMBER, kept apart on purpose:
//   - the game's own numbers, typed below from its files (each with the file
//     it came from) - classes, gear, potions, the bosses' health and hits;
//   - what the game was MEASURED doing, which is bosssim-data.js, generated
//     from the game itself and never typed: how often each boss's swing,
//     spikes, stalker pillars and puddles land on a player who never moves,
//     and how often each pet fires into a boss.
// BOSSSIM.md lists every number, where it came from and how to refresh it.
// test_bosssim.mjs checks them against the game when it is given the game's
// folder, and checks the model with every option.
(function (root) {
  "use strict";

  var VERSION = "0.11.4";
  var CLASSES = ["Warrior", "Mage", "Healer", "Tank"];

  // data/gamedata.json "classes" and "combat.classes"; mana costs and
  // cadences from src/characters/<class>.gd.
  var CLASS = {
    Warrior: { base: 24, cd: 1.00, hp: [180, 12], mana: [180, 10], wear: "plate" },
    Mage:    { base: 9,  cd: 0.45, hp: [110, 5],  mana: [250, 16], wear: "cloth" },
    Healer:  { base: 3,  cd: 0.10, hp: [140, 7],  mana: [220, 14], wear: "cloth" },
    Tank:    { base: 4,  cd: 0.25, hp: [260, 22], mana: [200, 10], wear: "plate" }
  };
  var COST = { wave: 10, spell: 15, shot: 1, auraEvery: 0.5, aura: 2, dynamite: 4 };
  var WAVE_RATIO = 0.75;      // warrior wave_ratio
  var DOUBLE_CHANCE = 0.10;   // combat.double_chance: Meteorite and Dynamite
  var DYNAMITE_TICKS = 4;     // dynamite_cooldown / aura tick (1.0 / 0.25)
  var SKILL_STEP = 0.01, AGILITY_STEP = 0.01, AGILITY_CAP = 2.0;

  var TIER_NAMES = ["Naked", "Iron", "Jade", "Cobalt", "Amethyst", "Ember"];
  var TIER_LEVEL = [1, 1, 5, 10, 16, 22];   // required_level of each tier
  // data/items/weapons: [damage, damage %] for tiers 1-5.
  var WEAPON = {
    Warrior: [[20, 0], [32, 2], [48, 3], [70, 5], [100, 8]],
    Mage:    [[8, 0], [12, 2], [18, 3], [26, 5], [38, 8]],
    Healer:  [[2, 0], [3, 2], [4, 3], [6, 5], [8, 8]],
    Tank:    [[3, 0], [5, 2], [8, 3], [12, 5], [17, 8]]
  };
  var WEAPON_NAME = { Warrior: "sword", Mage: "staff", Healer: "scepter", Tank: "maul" };
  var MYTHIC = {
    Warrior: { name: "Double Axe", dmg: 110, pct: 9 },
    Mage:    { name: "Meteorite", dmg: 41, pct: 9 },
    Tank:    { name: "Dynamite", dmg: 18, pct: 9 }
  };
  var MYTHIC_LEVEL = 22;
  var WEAPON_SPREAD = 0.25;   // damage_spread on every weapon
  // Worn pieces, tiers 1-5: [armour, health, mana, damage %].
  var PIECES = {
    plate: [
      [[4, 0, 0, 0], [7, 3, 0, 0], [11, 6, 0, 0], [16, 10, 0, 0], [23, 16, 0, 0]],   // helm
      [[8, 0, 0, 0], [14, 6, 0, 0], [22, 12, 0, 0], [32, 20, 0, 0], [46, 30, 0, 0]], // chest
      [[6, 0, 0, 0], [10, 4, 0, 0], [16, 9, 0, 0], [24, 14, 0, 0], [34, 22, 0, 0]],  // legs
      [[3, 0, 0, 0], [5, 3, 0, 0], [8, 6, 0, 0], [12, 9, 0, 0], [17, 14, 0, 0]],     // boots
      [[5, 0, 0, 0], [9, 4, 0, 0], [14, 7, 0, 0], [20, 12, 0, 0], [29, 18, 0, 0]]    // shield
    ],
    cloth: [
      [[2, 0, 0, 0], [4, 0, 5, 0], [7, 0, 10, 0], [10, 0, 16, 0], [14, 0, 25, 0]],   // hood
      [[5, 0, 0, 0], [8, 0, 8, 0], [13, 0, 16, 0], [19, 0, 26, 0], [28, 0, 40, 0]],  // robe
      [[4, 0, 0, 0], [6, 0, 6, 0], [10, 0, 12, 0], [14, 0, 20, 0], [20, 0, 30, 0]],  // trousers
      [[2, 0, 0, 0], [3, 0, 5, 0], [5, 0, 10, 0], [7, 0, 16, 0], [10, 0, 25, 0]]     // slippers
    ],
    jewels: [
      [[1, 3, 3, 1], [2, 6, 8, 1], [4, 10, 12, 1], [6, 15, 20, 2], [9, 20, 25, 3]], // ring
      [[1, 5, 5, 1], [2, 10, 12, 1], [4, 15, 20, 2], [6, 22, 30, 3], [9, 30, 40, 4]] // amulet
    ]
  };
  var ARMOUR_HALF_POINT = 200;   // constants.armour_half_point
  // PlayerStats.DEFENSE_TIERS: [from level, damage taken off, name]
  var DEFENSE_TIERS = [[80, 0.50, "Unbreakable"], [60, 0.40, "Hardened"], [40, 0.30, "Veteran"], [20, 0.20, "Trained"], [1, 0.10, "Novice"]];
  // data/items/consumables: [required level, restore, name]
  var POTIONS = [[22, 260, "Greater"], [16, 160, "Large"], [10, 90, "Medium"], [5, 45, "Small"], [1, 20, "Tiny"]];
  var POTION_AT = 0.40;          // the sim drinks below this share of health
  var RESIST_CAP = 50;           // constants.resist_cap
  var RESIST_ELEMENTS = ["Light", "Wind", "Water", "Ice", "Earth", "Fire", "Dark"];

  // The bosses: gamedata.json max_hp; data/enemies/<boss>.tres
  // projectile_damage; bossprojectile.gd ELEMENT_PROFILE's damage and
  // telegraph for the boss's element; bossenemy.gd's shares for the swing and
  // a stalker's pillar.
  var BOSS = {
    light:   { name: "Light",   el: "Light", hp: 4576,  pd: 21, dmg: 1.15, tel: 0.55, col: "var(--el-light)" },
    wind:    { name: "Wind",    el: "Wind",  hp: 4992,  pd: 21, dmg: 0.90, tel: 0.60, col: "var(--el-wind)" },
    water:   { name: "Water",   el: "Water", hp: 5616,  pd: 30, dmg: 0.85, tel: 1.00, col: "var(--el-water)" },
    ice:     { name: "Ice",     el: "Ice",   hp: 6188,  pd: 30, dmg: 0.90, tel: 1.35, col: "var(--el-ice)" },
    earth:   { name: "Earth",   el: "Earth", hp: 7384,  pd: 42, dmg: 1.25, tel: 1.30, col: "var(--el-earth)" },
    fire:    { name: "Fire",    el: "Fire",  hp: 9200,  pd: 60, dmg: 1.00, tel: 1.00, col: "var(--el-fire)" },
    crowned: { name: "Crowned", el: "Dark",  hp: 13800, pd: 83, dmg: 1.10, tel: 1.00, col: "var(--el-dark)" }
  };
  // scene/bossarena.tscn's gates (wave 1, 2, 3), then scene/boss.tscn.
  var WAVES = [
    { label: "Wave 1", bosses: ["light"] },
    { label: "Wave 2", bosses: ["wind", "water"] },
    { label: "Wave 3", bosses: ["ice", "earth", "fire"] },
    { label: "The Crowned", bosses: ["crowned"] }
  ];
  // Puddles, for the page's explanation (the sim itself uses what was
  // measured): ELEMENT_PROFILE's chance multiplier and extra pools, and the
  // element's puddle scene's lifetime and tick. A pillar leaves one on
  // PUDDLE_CHANCE x the multiplier, it lasts lifetime x PUDDLE_LIFE_SCALE, and
  // it ticks every PUDDLE_TICK_EVERY seconds on whoever stands in it.
  var PUDDLE_CHANCE = 0.35, PUDDLE_LIFE_SCALE = 0.6, PUDDLE_TICK_EVERY = 0.5;
  var PUDDLES = {
    Light: { chance: 0.0, extra: 0, life: 1.5, tick: 3 },
    Wind:  { chance: 0.0, extra: 0, life: 1.0, tick: 2 },
    Water: { chance: 0.5, extra: 2, life: 3.5, tick: 2 },
    Ice:   { chance: 0.8, extra: 0, life: 5.0, tick: 2 },
    Earth: { chance: 1.0, extra: 0, life: 2.0, tick: 4 },
    Fire:  { chance: 1.3, extra: 0, life: 4.5, tick: 5 },
    Dark:  { chance: 1.0, extra: 0, life: 3.0, tick: 4 }
  };
  var MELEE_SHARE = 45 / 34, TRAIL_SHARE = 22 / 34;
  var PHASE_AT = [0.66, 0.33];   // bossenemy.gd PHASE_TWO_AT, PHASE_THREE_AT
  var PETS = {
    petboss: "Crowned pet", petelectricsprite: "Electric Sprite", petfiresprite: "Fire Sprite",
    petmage: "Bush Mage", petpoisonslimelarge: "Large Slime", petpoisonslimesmall: "Small Slime",
    petsniper: "Bush Sniper"
  };
  var PET_SHARE = 0.5;           // combat.pet_share: a pet's shot is half the owner's multiplier
  var DT = 0.1, CAP = 600;       // a tick, and the longest a wave is run before calling it

  function data() {
    var d = root.BOSSSIM_DATA;
    if (!d || !d.bosses) throw new Error("bosssim-data.js is not loaded");
    return d;
  }
  function round(x) { return Math.round(x); }
  // ItemRegistry.scale_stat / gamedata.scale_stat: integer, halves up.
  function scaleStat(v, q) { return v <= 0 ? v : Math.floor((v * q + 50) / 100); }
  function spike(b) { return round(b.pd * b.dmg); }
  function melee(b) { return round(b.pd * MELEE_SHARE); }
  function trail(b) { return round(round(b.pd * TRAIL_SHARE) * b.dmg); }
  function defense(skill) {
    for (var i = 0; i < DEFENSE_TIERS.length; i++) if (skill >= DEFENSE_TIERS[i][0]) return DEFENSE_TIERS[i];
    return DEFENSE_TIERS[DEFENSE_TIERS.length - 1];
  }
  function potion(level) {
    for (var i = 0; i < POTIONS.length; i++) if (level >= POTIONS[i][0]) return POTIONS[i];
    return POTIONS[POTIONS.length - 1];
  }
  function wearableTier(tier, level) {
    var t = tier;
    while (t > 0 && level < TIER_LEVEL[t]) t--;
    return t;
  }
  function phaseOf(frac) { return frac > PHASE_AT[0] ? 0 : frac > PHASE_AT[1] ? 1 : 2; }
  function lerp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) {
      if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    }
    return ys[ys.length - 1];
  }

  function loadout(k, opts) {
    var tier = wearableTier(opts.tier, opts.level), q = opts.quality;
    var armour = 0, hp = 0, mana = 0, pct = 0, i, p;
    if (tier > 0) {
      var sets = PIECES[CLASS[k].wear].concat(PIECES.jewels);
      for (i = 0; i < sets.length; i++) {
        p = sets[i][tier - 1];
        armour += scaleStat(p[0], q); hp += scaleStat(p[1], q); mana += scaleStat(p[2], q); pct += scaleStat(p[3], q);
      }
    }
    var mythic = opts.mythic && MYTHIC[k] && opts.level >= MYTHIC_LEVEL ? MYTHIC[k] : null;
    var wDmg = 0, wPct = 0, wName = "bare hands";
    if (mythic) { wDmg = mythic.dmg; wPct = mythic.pct; wName = mythic.name; }
    else if (tier > 0) { wDmg = WEAPON[k][tier - 1][0]; wPct = WEAPON[k][tier - 1][1]; wName = TIER_NAMES[tier] + " " + WEAPON_NAME[k]; }
    wDmg = scaleStat(wDmg, q); pct += scaleStat(wPct, q);
    // PlayerStats.weapon_damage_range(): rolled each hit between these; the sim
    // uses the middle.
    var wAvg = wDmg > 0 ? (Math.max(1, Math.floor(wDmg * (1 - WEAPON_SPREAD))) + Math.ceil(wDmg * (1 + WEAPON_SPREAD))) / 2 : 0;
    return { tier: tier, armour: armour, hp: hp, mana: mana, pct: pct, weapon: wAvg, weaponName: wName, mythic: mythic };
  }

  function party(opts) {
    var out = {}, skill = opts.skills;
    var skills = 1 + (skill - 1) * SKILL_STEP * 2;   // attack and magic, a level each
    var haste = Math.min(AGILITY_CAP, Math.max(1, 1 + (skill - 1) * AGILITY_STEP));
    var def = defense(skill);
    CLASSES.forEach(function (k) {
      var c = CLASS[k], g = loadout(k, opts);
      var m = skills * (1 + g.pct / 100);
      var unit = round((c.base + g.weapon) * m), period = c.cd / haste, dps, attack;
      if (k === "Warrior") {
        if (g.mythic) { attack = "axe"; dps = unit / period; }
        else { attack = "sword"; dps = (unit + round(WAVE_RATIO * unit)) / period; }
      } else if (k === "Mage") { attack = g.mythic ? "meteor" : "staff"; dps = unit / period * (g.mythic ? 1 + DOUBLE_CHANCE : 1); }
      else if (k === "Healer") { attack = "scepter"; dps = unit / period; }
      else if (g.mythic) {
        attack = "dynamite"; period = 1.0 / haste; unit = round(unit * DYNAMITE_TICKS); dps = unit * (1 + DOUBLE_CHANCE) / period;
      } else { attack = "aura"; dps = unit / period; }
      out[k] = {
        gear: g, mult: m, unit: unit, period: period, dps: dps, attack: attack,
        hpMax: c.hp[0] + c.hp[1] * (opts.level - 1) + g.hp,
        manaMax: c.mana[0] + c.mana[1] * (opts.level - 1) + g.mana,
        def: def[1], defName: def[2], arm: g.armour / (g.armour + ARMOUR_HALF_POINT), haste: haste
      };
    });
    return out;
  }

  // What a pet adds a second: its measured shots at the owner's attack speed,
  // each int(damage x the owner's multiplier x 0.5) (pet.gd), plus anything
  // else it was measured leaving (the Crowned pet's puddles).
  function petDps(petId, owner, stance) {
    if (!petId) return 0;
    var p = data().pets[petId];
    if (!p) throw new Error("no measured pet " + petId);
    var s = p[stance];
    var shots = lerp(s.haste, s.shots, owner.haste), extra = lerp(s.haste, s.extra, owner.haste);
    return shots * Math.floor(p.damage * owner.mult * PET_SHARE) + extra;
  }

  // What one boss puts into one player a second, for a phase: `swing` lands on
  // everyone in its reach, `hazards` on whoever it is on - its spike track,
  // its stalkers' pillars and its puddles, at the measured rate for a player
  // who never moves, times the share dodging lets through. size(n) is what a
  // hit of n raw damage leaves; the identity gives the raw damage.
  function bossRate(id, held, phase, dodge, size) {
    var b = BOSS[id], m = data().bosses[id];
    var r = m[held ? "melee" : "range"][phase];
    // Telegraphed hits land (1 - dodging) ^ telegraph: everything a player who
    // never moves takes at 0%, nothing at 100%, and between them your dodging
    // counts for more against a slow ring (Ice 1.35) than a fast one (Light
    // 0.55). Puddles have no ring - they lie there to be seen - so they land
    // at 1 - dodging.
    var landT = Math.pow(1 - dodge, b.tel), landP = 1 - dodge;
    return {
      swing: r.swing * size(m.swing),
      hazards: (r.spike * size(m.spike) + r.pillar * size(m.pillar)) * landT +
        (m.puddle ? r.puddle * size(m.puddle) * landP : 0)
    };
  }

  function validate(o) {
    var bad = [];
    function num(k, lo, hi) { if (typeof o[k] !== "number" || !isFinite(o[k]) || o[k] < lo || o[k] > hi) bad.push(k); }
    num("tier", 0, 5); num("level", 1, 99); num("skills", 1, 99); num("potions", 0, 99);
    num("dodge", 0, 1); num("uptime", 0, 1); num("resist", 0, 100);
    if ([85, 100, 120].indexOf(o.quality) < 0) bad.push("quality");
    if (o.resistEl !== null && RESIST_ELEMENTS.indexOf(o.resistEl) < 0) bad.push("resistEl");
    if (o.pet !== null && !PETS[o.pet]) bad.push("pet");
    ["mythic", "hold", "rest"].forEach(function (k) { if (typeof o[k] !== "boolean") bad.push(k); });
    if (bad.length) throw new Error("bad options: " + bad.join(", "));
  }

  function simulate(opts) {
    validate(opts);
    data();
    var P = party(opts), pot = potion(opts.level), dodge = opts.dodge, up = opts.uptime;
    var resist = Math.min(RESIST_CAP, opts.resist) / 100;
    var st = {};
    CLASSES.forEach(function (k) {
      st[k] = { hp: P[k].hpMax, mana: P[k].manaMax, alive: true, potH: opts.potions, potM: opts.potions,
        usedH: 0, usedM: 0, dealt: 0, pet: 0, taken: 0, downAt: null, dryAt: null };
    });
    // The game's own per-hit sum (Player.damage_taken): each share off what
    // the one before left, floored to a whole number, never under 1.
    function perHit(k, size, b) {
      var r = opts.resistEl === b.el ? resist : 0;
      return Math.max(1, Math.floor(size * (1 - P[k].def) * (1 - P[k].arm) * (1 - r)));
    }
    function living() { return CLASSES.filter(function (k) { return st[k].alive; }); }
    function hurt(k, x) { st[k].hp -= x; st[k].taken += x; }
    function manaNeed(k) {
      var a = P[k].attack;
      return a === "staff" || a === "meteor" ? COST.spell : a === "sword" ? COST.wave : a === "dynamite" ? COST.dynamite : a === "aura" ? 1 : a === "scepter" ? COST.shot : 0;
    }

    var rows = [], waves = [], clock = 0, cleared = 0, wiped = false, firstDown = null, wipeWave = null, heldMost = 0;
    for (var w = 0; w < WAVES.length && !wiped; w++) {
      if (w === WAVES.length - 1 && opts.rest) {
        CLASSES.forEach(function (k) { if (st[k].alive) { st[k].hp = P[k].hpMax; st[k].mana = P[k].manaMax; } });
      }
      var bosses = WAVES[w].bosses.map(function (id) { return { id: id, b: BOSS[id], hp: BOSS[id].hp, dead: false, at: null }; });
      var t = 0;
      while (t < CAP) {
        var live = bosses.filter(function (x) { return !x.dead; });
        if (!live.length) break;
        var team = living();
        if (!team.length) break;
        var focus = live.reduce(function (a, x) { return x.hp < a.hp ? x : a; });
        var holder = null;
        if (opts.hold) {
          if (st.Tank.alive) holder = "Tank";
          else if (st.Warrior.alive && P.Warrior.attack === "sword") holder = "Warrior";
        }
        if (holder) heldMost = Math.max(heldMost, live.length);

        // ---- the party ----
        team.forEach(function (k) {
          var s = st[k], p = P[k], d = 0, targets = [focus];
          var a = p.attack, step = up * DT;
          if (a === "sword") {
            d = p.unit / p.period;
            if (s.mana >= COST.wave) { d += round(WAVE_RATIO * p.unit) / p.period; s.mana -= COST.wave / p.period * step; }
          } else if (a === "axe") {
            d = p.dps;
          } else if (a === "staff" || a === "meteor") {
            if (s.mana >= COST.spell) { d = p.dps; s.mana -= COST.spell / p.period * step; }
          } else if (a === "scepter") {
            if (s.mana >= COST.shot) { d = p.dps; s.mana -= COST.shot / p.period * step; }
          } else if (a === "dynamite") {
            if (s.mana >= COST.dynamite) { d = p.dps; s.mana -= COST.dynamite / p.period * step; }
          } else if (s.mana > 0) {
            // The aura burns 2 mana every half second while it is up and
            // reaches every boss standing on the tank.
            d = p.dps; s.mana -= COST.aura / COST.auraEvery * step;
            if (holder === "Tank") targets = live;
          }
          if (s.mana < 0) s.mana = 0;
          targets.forEach(function (x) { x.hp -= d * step; s.dealt += d * step; });
          var near = (holder === k) || (holder === "Tank" && k === "Warrior" && a === "sword");
          var pd = petDps(opts.pet, p, near ? "melee" : "range") * DT;
          if (pd > 0) { focus.hp -= pd; s.dealt += pd; s.pet += pd; }
          if (s.dryAt === null && manaNeed(k) > 0 && s.mana < manaNeed(k)) s.dryAt = clock + t;
        });
        bosses.forEach(function (x) { if (!x.dead && x.hp <= 0) { x.dead = true; x.hp = 0; x.at = t + DT; } });

        // ---- the bosses ----
        team = living();
        bosses.forEach(function (x) {
          if (x.dead || !team.length) return;
          var b = x.b, held = !!(holder && st[holder].alive), phase = phaseOf(x.hp / b.hp);
          function rate(k) { return bossRate(x.id, held, phase, dodge, function (n) { return perHit(k, n, b); }); }
          if (held) {
            // The boss is on the holder: its swing lands on everyone in reach
            // (the holder, and a sword warrior beside a tank), and its spike
            // track, stalkers and puddles are aimed at the holder.
            var reach = [holder];
            if (holder === "Tank" && st.Warrior.alive && P.Warrior.attack === "sword") reach.push("Warrior");
            reach.forEach(function (k) { hurt(k, rate(k).swing * DT); });
            hurt(holder, rate(holder).hazards * DT);
          } else {
            // Nobody in reach: the boss is on whoever is nearest, which moves,
            // so its attacks fall across the party.
            team.forEach(function (k) { hurt(k, rate(k).hazards * DT / team.length); });
          }
        });

        CLASSES.forEach(function (k) {
          var s = st[k];
          if (!s.alive) return;
          if (s.hp > 0 && s.hp < P[k].hpMax * POTION_AT && s.potH > 0) { s.hp = Math.min(P[k].hpMax, s.hp + pot[1]); s.potH--; s.usedH++; }
          if (s.hp <= 0) {
            s.alive = false; s.hp = 0; s.downAt = clock + t;
            if (!firstDown) firstDown = { k: k, wave: w, t: clock + t };
            return;
          }
          if (manaNeed(k) > 0 && s.mana < manaNeed(k) && s.potM > 0) { s.mana = Math.min(P[k].manaMax, s.mana + pot[1]); s.potM--; s.usedM++; }
        });
        t += DT;
      }
      var done = bosses.every(function (x) { return x.dead; });
      bosses.forEach(function (x) {
        rows.push({ id: x.id, name: x.b.name, hp: x.b.hp, col: x.b.col, wave: w, at: x.at, cleared: x.dead, left: x.hp });
        if (x.dead) cleared++;
      });
      waves.push({ label: WAVES[w].label, time: t, cleared: done, capped: !done && t >= CAP });
      clock += t;
      if (!done) { wiped = true; wipeWave = w; }
    }
    var total = CLASSES.reduce(function (a, k) { return a + st[k].dealt; }, 0);
    var hurtTotal = CLASSES.reduce(function (a, k) { return a + st[k].taken; }, 0);
    var share = {}, takenShare = {};
    CLASSES.forEach(function (k) {
      share[k] = total > 0 ? st[k].dealt / total : 0;
      takenShare[k] = hurtTotal > 0 ? st[k].taken / hurtTotal : 0;
    });
    return { opts: opts, party: P, st: st, rows: rows, waves: waves, time: clock, cleared: cleared, wiped: wiped,
      wipeWave: wipeWave, firstDown: firstDown, share: share, takenShare: takenShare,
      partyDps: total / Math.max(clock, DT), potion: pot, heldMost: heldMost };
  }

  var api = {
    simulate: simulate, party: party, petDps: petDps, bossRate: bossRate, validate: validate, potion: potion, defense: defense,
    wearableTier: wearableTier, phaseOf: phaseOf, spike: spike, melee: melee, trail: trail, scaleStat: scaleStat,
    data: data, VERSION: VERSION, CLASSES: CLASSES, CLASS: CLASS, BOSS: BOSS, WAVES: WAVES,
    TIER_NAMES: TIER_NAMES, TIER_LEVEL: TIER_LEVEL, WEAPON: WEAPON, MYTHIC: MYTHIC, MYTHIC_LEVEL: MYTHIC_LEVEL,
    PIECES: PIECES, POTIONS: POTIONS, POTION_AT: POTION_AT, RESIST_CAP: RESIST_CAP,
    RESIST_ELEMENTS: RESIST_ELEMENTS, PETS: PETS, PUDDLES: PUDDLES, PUDDLE_CHANCE: PUDDLE_CHANCE,
    PUDDLE_LIFE_SCALE: PUDDLE_LIFE_SCALE, PUDDLE_TICK_EVERY: PUDDLE_TICK_EVERY, DEFENSE_TIERS: DEFENSE_TIERS, CAP: CAP, DT: DT
  };
  root.BossSim = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
