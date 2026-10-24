// tools/bosssim_data.mjs — turns the two measurements into bosssim-data.js.
//
//   node tools/bosssim_data.mjs <bossmeasure output> <petmeasure output> [game version]
//
// The inputs are what tools/bossmeasure.gd and tools/petmeasure.gd print when
// run against the game project (see BOSSSIM.md). Every hit is sorted into what
// dealt it, and a hit that is none of them stops the build: a hit the sim
// cannot name is a mechanic it does not know about yet, and that is worth
// stopping for rather than filing under "spikes".
//
// Since game 0.77.0 (seven bosses, seven fights) the measurement tags what it
// can - an orb from the room's bullet zone, a burn tick from the effects - and
// the rest is sorted by size as before: the swing, a stalagmite (spike), a
// stalker's pillar, a puddle tick. An orb the size of the boss's whole spike is
// a boulder's impact. And it runs three stand-ins, not two: in reach, at range,
// and at range dodging.
//
// Nothing in bosssim-data.js is typed by hand. Re-measure, re-run this, run
// test_bosssim.mjs, and the sim follows the game.

import { readFile, writeFile } from "node:fs/promises";

const [bossFile, petFile, version = "unknown"] = process.argv.slice(2);
if (!bossFile || !petFile) {
	console.error("usage: node tools/bosssim_data.mjs <bossmeasure output> <petmeasure output> [game version]");
	process.exit(2);
}

const ELEMENT = { 1: "Dark", 2: "Light", 3: "Ice", 4: "Wind", 5: "Earth", 6: "Fire", 7: "Water" };
const STANCES = ["melee", "range", "dodge"];
const lines = (text, tag) => text.split("\n").filter((l) => l.startsWith(tag + " ")).map((l) => JSON.parse(l.slice(tag.length + 1)));

const bossRows = lines(await readFile(bossFile, "utf8"), "BOSSMEASURE");
const petRows = lines(await readFile(petFile, "utf8"), "PETMEASURE");
if (bossRows.length !== 63) throw new Error(`expected 63 boss runs (7 bosses x 3 stances x 3 phases), got ${bossRows.length}`);
if (petRows.length !== 70) throw new Error(`expected 70 pet runs (7 pets x 2 distances x 5 speeds), got ${petRows.length}`);

const r3 = (x) => Math.round(x * 1000) / 1000;
const bosses = {};
for (const row of bossRows) {
	if (!STANCES.includes(row.stance)) throw new Error(`${row.boss}: a stance of ${row.stance}`);
	const b = (bosses[row.boss] ??= {
		element: ELEMENT[row.element], maxHp: row.max_hp, effect: row.effect,
		spike: row.spike, swing: row.melee, pillar: row.trail, puddle: null, orb: row.orb, impact: row.spike_raw,
		melee: [], range: [], dodge: [],
	});
	const per = { swing: 0, spike: 0, pillar: 0, puddle: 0, orb: 0, impact: 0 };
	for (const [amountText, n] of Object.entries(row.hits)) {
		const amount = Number(amountText);
		let kind;
		if (amount === row.melee) kind = "swing";
		else if (amount === row.spike) kind = "spike";
		else if (amount === row.trail) kind = "pillar";
		else if (amount <= 10) {
			kind = "puddle";
			if (b.puddle !== null && b.puddle !== amount) throw new Error(`${row.boss}: two puddle tick sizes, ${b.puddle} and ${amount}`);
			b.puddle = amount;
		} else throw new Error(`${row.boss} ${row.stance} phase ${row.phase}: a hit of ${amount} is no known attack`);
		per[kind] += n;
	}
	for (const [amountText, n] of Object.entries(row.orbs)) {
		const amount = Number(amountText);
		if (amount === row.orb) per.orb += n;
		else if (amount === row.spike_raw) per.impact += n;
		else throw new Error(`${row.boss} ${row.stance} phase ${row.phase}: an orb of ${amount} is neither an orb (${row.orb}) nor a boulder (${row.spike_raw})`);
	}
	// Burn ticks are a share of whatever lit them, so they come in sizes: kept
	// as hits a second by size.
	const burns = {};
	for (const [amountText, n] of Object.entries(row.burns)) burns[amountText] = r3(n / row.seconds);
	const floor = { spikes: 0, pillars: 0, stalkers: 0, puddles: 0 };
	for (const [scene, n] of Object.entries(row.spawned)) {
		if (scene.endsWith("secondbossprojectile")) floor.spikes += n;
		else if (scene.endsWith("bossprojectile")) floor.pillars += n;
		else if (scene === "bossstalker") floor.stalkers += n;
		else if (scene.endsWith("puddle")) floor.puddles += n;
	}
	const minute = 60 / row.seconds;
	floor.orbs = row.orbs_fired;
	b[row.stance][row.phase] = {
		swing: r3(per.swing / row.seconds), spike: r3(per.spike / row.seconds),
		pillar: r3(per.pillar / row.seconds), puddle: r3(per.puddle / row.seconds),
		orb: r3(per.orb / row.seconds), impact: r3(per.impact / row.seconds), burns,
		floor: Object.fromEntries(Object.entries(floor).map(([k, v]) => [k, Math.round(v * minute)])),
		effects: Object.fromEntries(Object.entries(row.effects).map(([k, v]) => [k, Math.round(v * minute * 10) / 10])),
		total: r3(row.total / row.seconds),
	};
}

const pets = {};
for (const row of petRows) {
	const p = (pets[row.pet] ??= { damage: row.damage, cooldown: row.cooldown, melee: { haste: [], shots: [], extra: [] }, range: { haste: [], shots: [], extra: [] } });
	let shots = 0, extra = 0;
	for (const [amountText, n] of Object.entries(row.losses)) {
		const amount = Number(amountText);
		if (amount === row.shot) shots += n;
		else extra += amount * n;
	}
	const s = p[row.stance];
	s.haste.push(row.haste);
	s.shots.push(r3(shots / row.seconds));
	s.extra.push(r3(extra / row.seconds));
}

const seconds = { boss: bossRows[0].seconds, pet: petRows[0].seconds };
const data = { game: version, measured: new Date().toISOString().slice(0, 10), seconds, bosses, pets };
const out = `// bosssim-data.js — GENERATED by tools/bosssim_data.mjs. Do not edit by hand.
//
// What the game's bosses and pets were measured doing, in the game itself:
// tools/bossmeasure.gd and tools/petmeasure.gd, run headless against the game
// project (BOSSSIM.md says how). Per boss, per stance (the player in its reach
// holding its ground, at range holding its ground, or at range dodging) and
// per phase: hits a second by what dealt them, damage a second in all, the
// effects that started a minute, and what the boss put on the floor a minute.
// Per pet: shots a second into a boss at five attack speeds, and anything else
// it dealt.
globalThis.BOSSSIM_DATA = ${JSON.stringify(data, null, 1)};
`;
await writeFile("bosssim-data.js", out);
console.log(`wrote bosssim-data.js: ${Object.keys(bosses).length} bosses, ${Object.keys(pets).length} pets, game ${version}`);
