// test_bosssim.mjs — the Boss Sim, with every option, in node and in a browser.
//
//   node build.mjs && node test_bosssim.mjs
//   GAME=<the game's folder> node test_bosssim.mjs     # also checks the numbers against the game
//
// Five parts:
//   1. THE GAME'S NUMBERS. Every number bosssim.js types from the game, read
//      back out of the game's own files and compared. Only with GAME set: the
//      website does not carry the game, and a check that cannot see the game
//      says so (a skip) rather than passing.
//   2. THE MEASURED DATA. bosssim-data.js is generated from the game itself;
//      this holds it to what the game's rules say it must show - swings only in
//      reach, one every 1.5 s; no stalkers before phase 2; no puddles from Light
//      or Wind; every hit the size its attack deals.
//   3. CALIBRATION. At 0% dodging the sim deals exactly the measured damage of a
//      player who never moves - the one point where the model and the game meet.
//   4. EVERY OPTION. Every combination of the sim's choices, every value of every
//      dial from several starting parties, and thousands of random parties:
//      nothing is NaN, nothing is out of range, the same party always gets the
//      same answer, and nothing that should help a party ever hurts it.
//   5. THE PAGE. Every control through every value in a real browser under the
//      site's CSP: no script error, no NaN on screen, the page shows what the
//      model computes, every control has a name, nothing overflows a phone.
//
// Playwright is not a dependency of the site; see test_e2e.mjs for how to get it.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, extname } from "node:path";
import vm from "node:vm";

let passed = 0, failed = 0, skipped = 0;
function check(what, ok, detail) {
	if (ok) { passed += 1; console.log(`  pass  ${what}`); }
	else { failed += 1; console.log(`  FAIL  ${what}${detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`); }
}
function skip(what, why) { skipped += 1; console.log(`  skip  ${what} (${why})`); }
function section(title) { console.log(`\n--- ${title} ---`); }

vm.runInThisContext(await readFile("bosssim-data.js", "utf8"), { filename: "bosssim-data.js" });
vm.runInThisContext(await readFile("bosssim.js", "utf8"), { filename: "bosssim.js" });
const S = globalThis.BossSim, D = globalThis.BOSSSIM_DATA;
const IDS = Object.keys(S.BOSS);
const TIER_IDS = ["iron", "jade", "cobalt", "amethyst", "ember"];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
section("1. the game's numbers");
// ---------------------------------------------------------------------------
const GAME = process.env.GAME;
if (!GAME) {
	skip("every number typed in bosssim.js against the game's files", "set GAME to the game's folder");
} else {
	const read = (rel) => readFile(join(GAME, rel), "utf8");
	const gd = JSON.parse(await read("data/gamedata.json"));
	const items = Array.isArray(gd.items) ? Object.fromEntries(gd.items.map((i) => [i.item_id, i])) : gd.items;
	const enemies = Object.fromEntries(gd.enemies.map((e) => [e.enemy_id, e]));
	const cls = Object.fromEntries(gd.classes.map((c) => [c.class_id, c]));
	const combat = gd.combat;

	const wrongClass = [];
	for (const k of S.CLASSES) {
		const id = k.toLowerCase(), c = cls[id], s = S.CLASS[k], cc = combat.classes[id];
		if (c.hp_base !== s.hp[0] || c.hp_per_lvl !== s.hp[1] || c.mana_base !== s.mana[0] || c.mana_per_lvl !== s.mana[1]) wrongClass.push(k + " pools");
		if (cc.base !== s.base || !near(cc.cooldown, s.cd)) wrongClass.push(k + " base/cooldown");
	}
	check("each class's health, mana, base damage and cadence are gamedata.json's", !wrongClass.length, wrongClass);
	check("the warrior's slash wave is wave_ratio of a swing", near(combat.classes.warrior.wave_ratio, 0.75));
	check("Dynamite's fuse and the double cast are the exported ones",
		near(combat.classes.tank.dynamite_cooldown, 1.0) && near(combat.double_chance, 0.10));
	check("a pet's shot is pet_share of its owner's multiplier", near(combat.pet_share, 0.5));
	check("skills add skill_step a level, agility agility_step to the cap",
		near(combat.skill_step, 0.01) && near(combat.agility_step, 0.01) && near(combat.agility_cap, 2.0));

	const wrongGear = [];
	const PLATE = ["helm", "chest", "legs", "boots", "shield"], CLOTH = ["hood", "robe", "trousers", "slippers"];
	TIER_IDS.forEach((t, i) => {
		for (const k of S.CLASSES) {
			const w = Object.values(items).find((it) => it.tier === i + 1 && it.equip_slot_name === "WEAPON" &&
				(it.required_classes || []).length === 1 && it.required_classes[0] === k.toLowerCase());
			if (!w || w.damage !== S.WEAPON[k][i][0] || w.bonus_damage_percent !== S.WEAPON[k][i][1]) wrongGear.push(`${t} ${k} weapon`);
			if (w && (w.required_level !== S.TIER_LEVEL[i + 1] || !near(w.damage_spread, 0.25))) wrongGear.push(`${t} ${k} level/spread`);
		}
		const piece = (name, row) => {
			const it = items[t + name];
			if (!it || it.armor_value !== row[0] || it.bonus_max_hp !== row[1] || it.bonus_max_mana !== row[2] || it.bonus_damage_percent !== row[3]) wrongGear.push(t + name);
		};
		PLATE.forEach((n, j) => piece(n, S.PIECES.plate[j][i]));
		CLOTH.forEach((n, j) => piece(n, S.PIECES.cloth[j][i]));
		piece("ring", S.PIECES.jewels[0][i]);
		piece("amulet", S.PIECES.jewels[1][i]);
	});
	check("every weapon, plate and cloth piece, ring and amulet, iron to ember, is the catalogue's", !wrongGear.length, wrongGear);
	const myth = { Warrior: "doubleaxe", Mage: "meteorite", Tank: "dynamite" };
	const wrongMyth = Object.entries(myth).filter(([k, id]) => items[id].damage !== S.MYTHIC[k].dmg ||
		items[id].bonus_damage_percent !== S.MYTHIC[k].pct || items[id].required_level !== S.MYTHIC_LEVEL);
	check("the three mythic weapons' damage, damage % and level are the catalogue's", !wrongMyth.length, wrongMyth);
	const POT = ["greater", "large", "medium", "small", "tiny"];
	const wrongPot = S.POTIONS.filter((p, i) => {
		const h = items[POT[i] + "healthpotion"], m = items[POT[i] + "manapotion"];
		return h.restore_amount !== p[1] || m.restore_amount !== p[1] || h.required_level !== p[0] || m.required_level !== p[0];
	});
	check("each potion's restore and level, health and mana alike, are the catalogue's", !wrongPot.length, wrongPot);
	check("armour's half point and the resistance cap are the exported constants",
		gd.constants.armour_half_point === 200 && gd.constants.resist_cap === S.RESIST_CAP);

	const BOSS_FILE = { light: "lightboss", wind: "windboss", water: "waterboss", ice: "iceboss", earth: "earthboss", fire: "fireboss", crowned: "boss" };
	const wrongHp = [], wrongPd = [];
	for (const id of IDS) {
		if (enemies[BOSS_FILE[id]].max_hp !== S.BOSS[id].hp) wrongHp.push(id);
		const tres = await read(`data/enemies/${BOSS_FILE[id]}.tres`);
		if (Number((tres.match(/^projectile_damage = (\d+)/m) || [])[1]) !== S.BOSS[id].pd) wrongPd.push(id);
	}
	check("each boss's health is gamedata.json's", !wrongHp.length, wrongHp);
	check("each boss's projectile_damage is its .tres's", !wrongPd.length, wrongPd);

	const projectile = await read("src/projectiles/bossprojectile.gd");
	const wrongProfile = [];
	for (const id of IDS) {
		const b = S.BOSS[id];
		const m = projectile.match(new RegExp(`Element\\.Type\\.${b.el.toUpperCase()}: \\{\\s*"telegraph": ([0-9.]+), "size": [0-9.]+, "damage": ([0-9.]+)`));
		if (!m || !near(Number(m[1]), b.tel) || !near(Number(m[2]), b.dmg)) wrongProfile.push(id);
	}
	check("each boss's damage and telegraph factors are ELEMENT_PROFILE's for its element", !wrongProfile.length, wrongProfile);
	const enemy = await read("src/enemies/bossenemy.gd");
	check("the swing and a stalker's pillar are MELEE_SHARE 45/34 and TRAIL_SHARE 22/34 of the spike",
		/const MELEE_SHARE := 45\.0 \/ 34\.0/.test(enemy) && /const TRAIL_SHARE := 22\.0 \/ 34\.0/.test(enemy));
	check("the phases change at 66% and 33% of health",
		/const PHASE_TWO_AT := 0\.66/.test(enemy) && /const PHASE_THREE_AT := 0\.33/.test(enemy));

	const stats = await read("src/characters/playerstats.gd");
	const tiers = [...stats.matchAll(/\{"min_level": (\d+),\s*"name": "(\w+)",\s*"reduction": ([0-9.]+)\}/g)].map((m) => [Number(m[1]), Number(m[3]), m[2]]);
	check("the defense tiers are PlayerStats.DEFENSE_TIERS", JSON.stringify(tiers) === JSON.stringify(S.DEFENSE_TIERS), tiers);

	const exp = async (file, name) => Number(((await read(file)).match(new RegExp(`@export var ${name}: (?:int|float) = ([0-9.]+)`)) || [])[1]);
	const costs = [
		["warrior slash wave", await exp("src/characters/warrior.gd", "slashwave_mana_cost"), 10],
		["mage spell", await exp("src/characters/mage.gd", "spell_mana_cost"), 15],
		["mage cadence", await exp("src/characters/mage.gd", "spell_cooldown"), 0.45],
		["healer shot", await exp("src/characters/healer.gd", "mana_cost_per_shot"), 1],
		["healer cadence", await exp("src/characters/healer.gd", "shot_cooldown"), 0.1],
		["aura tick", await exp("src/characters/tank.gd", "aura_tick"), 0.25],
		["aura drain every", await exp("src/characters/tank.gd", "mana_drain_tick"), 0.5],
		["aura drain", await exp("src/characters/tank.gd", "mana_drain_cost"), 2],
		["dynamite", await exp("src/characters/tank.gd", "dynamite_mana_cost"), 4],
	].filter(([, game, sim]) => !near(game, sim));
	check("every mana cost and cadence is the class scripts' @export", !costs.length, costs);

	const arena = await read("scene/bossarena.tscn");
	const gateWave = {};
	for (const m of arena.matchAll(/\[node name="gate_(\w+)boss"[^\]]*\]\n((?:[^[\n].*\n)*)/g)) gateWave[m[1]] = Number((m[2].match(/wave = (\d+)/) || [0, 1])[1]);
	const simWave = {};
	S.WAVES.slice(0, 3).forEach((w, i) => w.bosses.forEach((id) => { simWave[id] = i + 1; }));
	check("the arena's waves are its gates' (light 1; wind, water 2; ice, earth, fire 3)",
		JSON.stringify(gateWave) === JSON.stringify(Object.fromEntries(Object.keys(gateWave).map((k) => [k, simWave[k]]))) && Object.keys(gateWave).length === 6, gateWave);

	const wrongPuddle = [];
	for (const id of IDS) {
		const el = S.BOSS[id].el.toLowerCase();
		const scene = await read(`scene/projectiles/${el}puddle.tscn`).catch(() => "");
		const tick = Number((scene.match(/^tick_damage = (\d+)/m) || [])[1]);
		const chance = Number((projectile.match(new RegExp(`Element\\.Type\\.${el.toUpperCase()}: \\{[^}]*"puddle": ([0-9.]+)`)) || [])[1]);
		const measured = D.bosses[id].puddle;
		if (chance === 0 ? measured !== null : measured !== tick) wrongPuddle.push([id, tick, chance, measured]);
	}
	check("every measured puddle tick is its element's puddle scene's, and no puddles where the profile gives none", !wrongPuddle.length, wrongPuddle);
	const wrongPuddleRules = [];
	for (const [el, rule] of Object.entries(S.PUDDLES)) {
		const prof = projectile.match(new RegExp(`Element\\.Type\\.${el.toUpperCase()}: \\{[^}]*"puddle": ([0-9.]+), "extra": (\\d+)`));
		const scene = await read(`scene/projectiles/${el.toLowerCase()}puddle.tscn`);
		const life = Number((scene.match(/^lifetime = ([0-9.]+)/m) || [])[1]), tick = Number((scene.match(/^tick_damage = (\d+)/m) || [])[1]);
		const every = Number((scene.match(/^tick_interval = ([0-9.]+)/m) || [0, S.PUDDLE_TICK_EVERY])[1]);
		if (!prof || !near(Number(prof[1]), rule.chance) || Number(prof[2]) !== rule.extra || !near(life, rule.life) || tick !== rule.tick || !near(every, S.PUDDLE_TICK_EVERY)) wrongPuddleRules.push(el);
	}
	const boltScript = projectile;
	check("each element's puddle chance, extra pools, lifetime and tick are the game's", !wrongPuddleRules.length, wrongPuddleRules);
	check("a pillar leaves a puddle on 0.35 x the element's multiplier, lasting 0.6 of the scene's lifetime",
		/const PUDDLE_CHANCE := 0\.35/.test(enemy) && /var puddle_life_scale: float = 0\.6/.test(boltScript) &&
		/@export var tick_interval: float = 0\.5/.test(await read("src/projectiles/acidpuddle.gd")));
	const wrongPets = Object.keys(S.PETS).filter((id) => combat.pets[id].damage !== D.pets[id].damage || !near(combat.pets[id].cooldown, D.pets[id].cooldown));
	check("each measured pet's damage and cooldown are gamedata.json's", !wrongPets.length, wrongPets);
}

// ---------------------------------------------------------------------------
section("2. the measured data");
// ---------------------------------------------------------------------------
check("all seven bosses were measured", JSON.stringify(Object.keys(D.bosses).sort()) === JSON.stringify([...IDS].sort()), Object.keys(D.bosses));
const holes = [];
for (const id of IDS) for (const s of ["melee", "range"]) for (let p = 0; p < 3; p++) {
	const r = D.bosses[id][s][p];
	if (!r || ["swing", "spike", "pillar", "puddle"].some((k) => typeof r[k] !== "number" || !isFinite(r[k]) || r[k] < 0)) holes.push(`${id} ${s} ${p}`);
}
check("every boss, stance and phase has a finite, non-negative rate for every attack", !holes.length, holes);
check("every hit was the size its attack deals (spike, swing, pillar from the game's arithmetic)",
	IDS.every((id) => D.bosses[id].spike === S.spike(S.BOSS[id]) && D.bosses[id].swing === S.melee(S.BOSS[id]) && D.bosses[id].pillar === S.trail(S.BOSS[id])),
	IDS.map((id) => [id, D.bosses[id].spike, S.spike(S.BOSS[id]), D.bosses[id].swing, S.melee(S.BOSS[id]), D.bosses[id].pillar, S.trail(S.BOSS[id])]));
const swings = IDS.flatMap((id) => [0, 1, 2].map((p) => D.bosses[id].melee[p].swing));
check("a boss in reach swings once every 1.5 s (attack_cooldown), within 2%", swings.every((x) => Math.abs(x - 1 / 1.5) / (1 / 1.5) < 0.02), swings);
check("a boss nobody is in reach of never swings", IDS.every((id) => [0, 1, 2].every((p) => D.bosses[id].range[p].swing === 0)));
check("no stalker pillars in the first phase (stalkers come from phase 2)", IDS.every((id) => ["melee", "range"].every((s) => D.bosses[id][s][0].pillar === 0)));
check("more stalker pillars in phase 3 than phase 2 (one every 5.5 s, not 9)", IDS.every((id) => ["melee", "range"].every((s) => D.bosses[id][s][2].pillar > D.bosses[id][s][1].pillar)));
const stalkers = IDS.flatMap((id) => ["melee", "range"].flatMap((s) => [D.bosses[id][s][1].floor.stalkers, D.bosses[id][s][2].floor.stalkers]));
check("stalkers come out about every 9 s, then every 5.5 s", stalkers.every((n, i) => Math.abs(n - (i % 2 ? 60 / 5.5 : 60 / 9)) <= 1), stalkers);
check("Light and Wind leave no puddles; every other boss does",
	D.bosses.light.puddle === null && D.bosses.wind.puddle === null && IDS.filter((id) => !["light", "wind"].includes(id)).every((id) => D.bosses[id].puddle > 0));
check("in reach, the only pillars are the stalkers' (the boss swings instead of casting its pillar track)",
	IDS.every((id) => [0, 1, 2].every((p) => D.bosses[id].melee[p].floor.pillars <= D.bosses[id].melee[p].floor.stalkers * 15)));
check("at range the pillar track adds hundreds of pillars a minute",
	IDS.every((id) => [0, 1, 2].every((p) => D.bosses[id].range[p].floor.pillars - D.bosses[id].melee[p].floor.pillars > 500)));
check("the spike track runs either way", IDS.every((id) => ["melee", "range"].every((s) => [0, 1, 2].every((p) => D.bosses[id][s][p].floor.spikes > 0))));
check("all seven pets were measured", Object.keys(S.PETS).every((id) => D.pets[id]));
check("every pet fires at least as often at higher attack speed",
	Object.values(D.pets).every((p) => ["melee", "range"].every((s) => p[s].shots.every((x, i, a) => i === 0 || x >= a[i - 1] - 0.02))));
check("at base speed a pet fires about once per cooldown (or slower, held by its animation)",
	Object.values(D.pets).every((p) => p.melee.shots[0] <= 1 / p.cooldown + 0.01));
check("the Crowned pet leaves puddles; the others deal only their shot",
	D.pets.petboss.melee.extra[0] > 0 && Object.keys(S.PETS).filter((id) => id !== "petboss").every((id) => D.pets[id].melee.extra.every((x) => x === 0)));
check("FOUND: the Electric Sprite pet's orb (speed 20, 4 s) never reaches a boss from range",
	D.pets.petelectricsprite.range.shots.every((x) => x === 0) && D.pets.petelectricsprite.melee.shots[0] > 0);

// ---------------------------------------------------------------------------
section("3. calibration: 0% dodging is the measured damage");
// ---------------------------------------------------------------------------
const raw = (n) => n;
const calib = [];
for (const id of IDS) for (const held of [true, false]) for (let p = 0; p < 3; p++) {
	const r = D.bosses[id][held ? "melee" : "range"][p], m = D.bosses[id];
	const measured = r.swing * m.swing + r.spike * m.spike + r.pillar * m.pillar + (m.puddle ? r.puddle * m.puddle : 0);
	const sim = S.bossRate(id, held, p, 0, raw);
	if (!near(sim.swing + sim.hazards, measured, 1e-9)) calib.push([id, held, p, measured, sim]);
}
check("at 0% dodging, every boss, stance and phase deals exactly what it dealt the stand-in", !calib.length, calib);
check("dodging lets through (1 - dodging) ^ telegraph of the rings and 1 - dodging of the puddles; the swing always lands",
	IDS.every((id) => [0.5, 0.85, 0.99].every((d) => {
		const r = S.bossRate(id, true, 2, d, raw), m = D.bosses[id], q = m.melee[2];
		const want = (q.spike * m.spike + q.pillar * m.pillar) * Math.pow(1 - d, S.BOSS[id].tel) + (m.puddle ? q.puddle * m.puddle * (1 - d) : 0);
		return near(r.swing, q.swing * m.swing) && near(r.hazards, want);
	})));
check("a fast ring (Light) lets more through than a slow one (Ice) at the same dodging",
	Math.pow(0.15, S.BOSS.light.tel) > Math.pow(0.15, S.BOSS.ice.tel));

// ---------------------------------------------------------------------------
section("4. every option");
// ---------------------------------------------------------------------------
const BASE = { tier: 5, level: 22, skills: 30, quality: 100, mythic: false, resistEl: null, resist: 0,
	potions: 3, pet: null, dodge: 0.85, uptime: 0.85, hold: true, rest: true };
const STARTS = {
	fresh: { ...BASE, tier: 2, level: 8, skills: 10, potions: 0, dodge: 0.75 },
	wall: { ...BASE, tier: 4, level: 18, skills: 25 },
	clear: BASE,
	mythic: { ...BASE, mythic: true, skills: 40, dodge: 0.9 },
};

function walk(v, path, out) {
	if (typeof v === "number" && !isFinite(v)) out.push(path);
	else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path + "." + k, out);
	return out;
}
function invariants(o, r) {
	const bad = walk(r, "r", []);
	if (!(r.time >= 0 && r.time <= S.CAP * 4 + 1)) bad.push("time");
	if (!(r.cleared >= 0 && r.cleared <= 7)) bad.push("cleared");
	if (r.wiped !== (r.cleared < 7)) bad.push("wiped vs cleared");
	const reached = r.waves.length;
	if (r.rows.length !== S.WAVES.slice(0, reached).reduce((a, w) => a + w.bosses.length, 0)) bad.push("rows");
	for (const row of r.rows) {
		const w = r.waves[row.wave];
		if (row.cleared && !(row.at > 0 && row.at <= w.time + S.DT + 1e-9)) bad.push("row time " + row.id);
		if (!row.cleared && row.left <= 0) bad.push("standing boss with no health " + row.id);
	}
	if (r.wiped) {
		const last = r.waves[r.waves.length - 1];
		if (last.cleared) bad.push("wiped on a cleared wave");
		if (!last.capped && S.CLASSES.some((k) => r.st[k].alive)) bad.push("wiped with someone standing and no cap");
	}
	for (const k of S.CLASSES) {
		const s = r.st[k], p = r.party[k];
		if (s.hp < 0 || s.hp > p.hpMax + 1e-9) bad.push(k + " hp");
		if (s.mana < -1e-9 || s.mana > p.manaMax + 1e-9) bad.push(k + " mana");
		if (s.usedH > o.potions || s.usedM > o.potions || s.usedH < 0 || s.usedM < 0) bad.push(k + " potions");
		if (!s.alive && (s.hp !== 0 || s.downAt === null)) bad.push(k + " down");
		if (s.dealt < 0 || s.taken < 0 || s.pet < 0 || s.pet > s.dealt + 1e-9) bad.push(k + " totals");
		if (!o.pet && s.pet !== 0) bad.push(k + " pet with no pet");
		if (p.hpMax <= 0 || p.manaMax <= 0 || p.unit <= 0 || p.dps <= 0) bad.push(k + " stats");
	}
	// A pet that was chosen deals something (all but the Electric Sprite, which
	// only lands from beside a boss, and only if anybody holds one).
	const petTotal = S.CLASSES.reduce((a, k) => a + r.st[k].pet, 0);
	if (o.pet && o.pet !== "petelectricsprite" && r.time > 1 && !(petTotal > 0)) bad.push("pet dealt nothing");
	const sums = [r.share, r.takenShare].map((x) => S.CLASSES.reduce((a, k) => a + x[k], 0));
	if (sums.some((x) => !(near(x, 1, 1e-9) || x === 0))) bad.push("shares " + sums);
	return bad;
}

let runs = 0, worst = 0;
function run(o) {
	const t0 = performance.now();
	const r = S.simulate(o);
	worst = Math.max(worst, performance.now() - t0);
	runs += 1;
	return r;
}

// 4a. Every combination of the choices.
const ELS = [null, ...S.RESIST_ELEMENTS], PETS = [null, ...Object.keys(S.PETS)];
let comboBad = [], combos = 0;
for (let tier = 0; tier <= 5; tier++) for (const mythic of [false, true]) for (const quality of [85, 100, 120])
	for (const resistEl of ELS) for (const pet of PETS) for (const hold of [true, false]) for (const rest of [true, false]) {
		const o = { ...BASE, tier, mythic, quality, resistEl, resist: resistEl ? 25 : 0, pet, hold, rest };
		const bad = invariants(o, run(o));
		combos += 1;
		if (bad.length && comboBad.length < 5) comboBad.push([o, bad]);
	}
check(`every combination of tier, weapons, rolls, resistance, pet, formation and rest holds together (${combos})`, !comboBad.length, comboBad);

// 4b. Every value of every dial, from four starting parties, with the
// direction each one must move the result.
const DIALS = {
	tier: [0, 1, 2, 3, 4, 5], level: Array.from({ length: 30 }, (_, i) => i + 1),
	skills: Array.from({ length: 99 }, (_, i) => i + 1), potions: Array.from({ length: 11 }, (_, i) => i),
	dodge: Array.from({ length: 60 }, (_, i) => +(0.40 + i * 0.01).toFixed(2)),
	resist: Array.from({ length: 51 }, (_, i) => i), uptime: Array.from({ length: 11 }, (_, i) => +(0.5 + i * 0.05).toFixed(2)),
};
function noWorse(a, b) {
	// b is a party that is better in one way than a. It must down at least as
	// many bosses, and, if both clear, not take longer.
	if (b.cleared < a.cleared) return false;
	if (a.cleared === 7 && b.cleared === 7 && b.time > a.time + 1e-9) return false;
	return true;
}
for (const [name, start] of Object.entries(STARTS)) {
	let bad = [], worse = [];
	for (const [dial, values] of Object.entries(DIALS)) {
		let prev = null;
		for (const v of values) {
			const o = { ...start, [dial]: v };
			if (dial === "resist") o.resistEl = "Fire";
			const r = run(o);
			const inv = invariants(o, r);
			if (inv.length) bad.push([dial, v, inv]);
			if (prev && !noWorse(prev.r, r)) worse.push([dial, prev.v, v, prev.r.cleared, r.cleared, +prev.r.time.toFixed(2), +r.time.toFixed(2)]);
			prev = { r, v };
		}
	}
	check(`${name}: every value of every dial holds together`, !bad.length, bad.slice(0, 5));
	check(`${name}: more gear, level, skills, potions, dodging, resistance or time attacking never makes a run worse`, !worse.length, worse.slice(0, 8));
}

// 4c. Random parties across every range, each with every one-step improvement.
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(20261007);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const STEPS = {
	potions: (o) => o.potions < 10 && { ...o, potions: o.potions + 1 },
	dodge: (o) => o.dodge <= 0.94 && { ...o, dodge: +(o.dodge + 0.05).toFixed(2) },
	resist: (o) => o.resistEl && o.resist <= 40 && { ...o, resist: o.resist + 10 },
	quality: (o) => o.quality < 120 && { ...o, quality: o.quality === 85 ? 100 : 120 },
	rest: (o) => !o.rest && { ...o, rest: true },
	level: (o) => o.level < 30 && { ...o, level: o.level + 1 },
	skills: (o) => o.skills <= 94 && { ...o, skills: o.skills + 5 },
	uptime: (o) => o.uptime <= 0.9 && { ...o, uptime: +(o.uptime + 0.1).toFixed(2) },
	pet: (o) => !o.pet && { ...o, pet: "petfiresprite" },
	tier: (o) => o.tier < 5 && { ...o, tier: o.tier + 1 },
};
let randBad = [], randWorse = [], randDet = [], randN = 0;
for (let i = 0; i < 1500; i++) {
	const o = {
		tier: pick([0, 1, 2, 3, 4, 5]), level: 1 + Math.floor(rnd() * 30), skills: 1 + Math.floor(rnd() * 99),
		quality: pick([85, 100, 120]), mythic: rnd() < 0.3, resistEl: pick(ELS), resist: Math.floor(rnd() * 51),
		potions: Math.floor(rnd() * 11), pet: pick(PETS), dodge: +(0.4 + rnd() * 0.59).toFixed(2),
		uptime: +(0.5 + rnd() * 0.5).toFixed(2), hold: rnd() < 0.7, rest: rnd() < 0.7,
	};
	if (!o.resistEl) o.resist = 0;
	const r = run(o);
	randN += 1;
	const inv = invariants(o, r);
	if (inv.length && randBad.length < 5) randBad.push([o, inv]);
	if (i % 10 === 0) {
		const again = run(o);
		if (JSON.stringify(again) !== JSON.stringify(r) && randDet.length < 3) randDet.push(o);
	}
	for (const [name, step] of Object.entries(STEPS)) {
		const better = step(o);
		if (!better) continue;
		const rb = run(better);
		if (!noWorse(r, rb) && randWorse.length < 8) randWorse.push([name, o, r.cleared, rb.cleared, +r.time.toFixed(2), +rb.time.toFixed(2)]);
	}
}
check(`${randN} random parties hold together`, !randBad.length, randBad);
check("every one of them gets the same answer twice", !randDet.length, randDet);
check("and no single improvement to any of them makes its run worse", !randWorse.length, randWorse);

let threw = 0;
for (const bad of [{ tier: 9 }, { quality: 90 }, { resistEl: "Lightning" }, { pet: "dragon" }, { dodge: 1.5 }, { level: 0 }, { hold: "yes" }, { skills: NaN }]) {
	try { S.simulate({ ...BASE, ...bad }); } catch { threw += 1; }
}
check("an option the sim does not know is refused, not guessed at", threw === 8, threw);
check(`${runs} runs, the slowest in ${worst.toFixed(1)} ms (a page redraws on every dial move)`, worst < 250, worst);

// ---------------------------------------------------------------------------
section("5. the page");
// ---------------------------------------------------------------------------
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* not installed */ }
try { await stat("dist/simulator.html"); } catch { chromium = null; console.log("  (dist/ is missing: run node build.mjs)"); }
if (!chromium) {
	skip("the page in a browser", "playwright or dist/ missing");
} else {
	const toml = await readFile("netlify.toml", "utf8");
	const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1];
	const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".gif": "image/gif", ".png": "image/png" };
	const site = createServer(async (req, res) => {
		const rel = new URL(req.url, "http://x").pathname.slice(1) || "index.html";
		try {
			const body = await readFile(join("dist", rel));
			res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream", "content-security-policy": csp });
			res.end(body);
		} catch { res.writeHead(404); res.end(); }
	});
	await new Promise((r) => site.listen(0, r));
	const url = `http://localhost:${site.address().port}/simulator.html`;
	const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e)));
	page.on("console", (m) => { if (m.type() === "error" && !/hit|favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
	await page.goto(url, { waitUntil: "load" });
	await page.waitForFunction(() => window.BossSimPage);

	const state = () => page.evaluate(() => {
		const sim = document.querySelector(".sim");
		return { opts: window.BossSimPage.readOpts(), time: document.getElementById("tTime").textContent,
			cleared: document.getElementById("tCleared").textContent, verdict: document.getElementById("tVerdict").textContent,
			bad: /NaN|undefined|Infinity|\[object/.test(sim.innerText) };
	});
	function expected(o) {
		const r = S.simulate(o);
		return { time: r.wiped ? "WIPE" : r.time.toFixed(0) + "s", cleared: String(r.cleared) };
	}
	// What the dials SHOW, read straight off the DOM - not through the page's own
	// readOpts(), which is the thing being checked.
	const shown = () => page.evaluate(() => {
		const v = (id) => document.getElementById(id).value, on = (id) => document.getElementById(id).getAttribute("aria-pressed") === "true";
		const el = v("resistEl") || null;
		return { tier: +v("gear"), level: +v("level"), skills: +v("skills"), potions: +v("potions"),
			dodge: +v("dodge") / 100, uptime: +v("uptime") / 100, resistEl: el, resist: el ? +v("resist") : 0, pet: v("pet") || null,
			quality: on("qLow") ? 85 : on("qPerf") ? 120 : 100, mythic: on("wMythic"), hold: on("fHold"), rest: on("rRest") };
	});
	let mismatched = [], nan = [], misread = [], steps = 0;
	async function look(label) {
		steps += 1;
		const s = await state();
		const dials = await shown();
		const off = Object.keys(dials).filter((k) => dials[k] !== s.opts[k]);
		if (off.length && misread.length < 5) misread.push([label, off.map((k) => [k, dials[k], s.opts[k]])]);
		if (s.bad && nan.length < 5) nan.push(label);
		const e = expected(s.opts);
		if ((e.time !== s.time || e.cleared !== s.cleared) && mismatched.length < 5) mismatched.push([label, e, s.time, s.cleared]);
	}

	const presets = await page.$$eval(".presets button", (b) => b.map((x) => x.dataset.preset));
	for (const p of presets) { await page.click(`[data-preset=${p}]`); await look("preset " + p); }
	const ranges = await page.$$eval(".sim input[type=range]", (els) => els.map((e) => ({ id: e.id, min: +e.min, max: +e.max, step: +e.step || 1 })));
	await page.click("[data-preset=clear]");
	for (const r of ranges) {
		for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
			await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, [r.id, v]);
			await look(`${r.id}=${v}`);
		}
		await page.click("[data-preset=clear]");
	}
	const buttons = await page.$$eval(".sim .seg button", (b) => b.map((x) => x.id));
	for (const id of buttons) { await page.click("#" + id); await look("button " + id); }
	const selects = await page.$$eval(".sim select", (s) => s.map((x) => ({ id: x.id, values: [...x.options].map((o) => o.value) })));
	for (const s of selects) for (const v of s.values) { await page.selectOption("#" + s.id, v); await look(`${s.id}=${v}`); }
	const want = presets.length + buttons.length + ranges.reduce((a, r) => a + Math.round((r.max - r.min) / r.step) + 1, 0) +
		selects.reduce((a, s) => a + s.values.length, 0);
	check(`the page drove ${presets.length} presets, ${ranges.length} dials through every value, ${buttons.length} buttons and ${selects.length} lists (${steps} states)`,
		steps === want && ranges.length === 7 && buttons.length === 9 && selects.length === 2 && presets.length === 5, [steps, want]);
	check("  read every dial as it is shown, every time", !misread.length, misread);
	check("  and showed the model's own answer every time", !mismatched.length, mismatched);
	check("  with no NaN, undefined or Infinity on screen", !nan.length, nan);
	check("  and no script error", !errors.length, errors.slice(0, 5));

	// A button is named by its text; a dial or a list only by a label pointing
	// at it or an aria-label - the text of a list's options is not its name.
	const unnamed = await page.$$eval(".sim input, .sim select, .sim button", (els) => els.filter((e) => {
		const label = e.id && document.querySelector(`label[for="${e.id}"]`);
		const text = e.tagName === "BUTTON" && e.textContent.trim();
		return !(label || (e.getAttribute("aria-label") || "").trim() || text);
	}).map((e) => e.id || e.outerHTML.slice(0, 60)));
	check("every control has a name a screen reader can read", !unnamed.length, unnamed);

	const wide = [];
	for (const width of [1280, 768, 390, 340]) {
		await page.setViewportSize({ width, height: 900 });
		for (const p of presets) {
			await page.click(`[data-preset=${p}]`);
			const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
			if (over > 0) wide.push([width, p, over]);
		}
	}
	check("nothing scrolls sideways at 1280, 768, 390 or 340 wide, on any preset", !wide.length, wide);
	await browser.close();
	site.close();
}

console.log(`\n=== ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""} ===`);
process.exit(failed ? 1 : 0);
