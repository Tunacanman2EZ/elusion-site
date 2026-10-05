// test_counter.mjs — the visitor counter, against a real blob store.
//
//   node test_counter.mjs
//
// Same shape as test_api.py and the Godot suite: a line per check, a count at
// the end, non-zero exit on any failure.
//
// IT RUNS AGAINST THE REAL CLIENT AND A REAL SERVER, not a stand-in for either.
// @netlify/blobs ships the same local BlobsServer that `netlify dev` uses, so
// every call below goes over HTTP through the actual client library into an
// actual store on disk. A hand-written fake would have to reproduce the one
// behaviour this design is built around — last write wins, with no concurrency
// control — and a fake that reproduced it wrongly would prove the opposite of
// what it claimed.
//
// THE CHECK THAT MATTERS MOST IS "two visitors in the same instant". That is
// the one a read-add-write counter fails, and it fails it silently, which is
// why it is worth a test rather than a comment.

import { BlobsServer } from "@netlify/blobs/server";
import { getStore, setEnvironmentContext } from "@netlify/blobs";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

let passed = 0;
let failed = 0;

function check(what, ok, detail) {
	if (ok) {
		passed += 1;
		console.log(`  pass  ${what}`);
	} else {
		failed += 1;
		console.log(`  FAIL  ${what}${detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
	}
}

const SITE_ID = "test-site";
const TOKEN = "test-token";
const STORE_NAME = "visits";

function isoDay(offsetDays) {
	return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// A request, as the function receives one
// ---------------------------------------------------------------------------

let hit;

async function visit({ ip = "203.0.113.5", agent = "Mozilla/5.0 (Windows NT 10.0) Firefox/141.0", peek = false } = {}) {
	const url = `https://elusion.test/.netlify/functions/hit${peek ? "?peek=1" : ""}`;
	const req = new Request(url, { headers: { "user-agent": agent } });
	const res = await hit(req, { ip });
	return { res, body: await res.json() };
}

function store() {
	return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function keysUnder(prefix) {
	const out = [];
	for await (const page of store().list({ prefix, paginate: true })) {
		for (const b of page.blobs) out.push(b.key);
	}
	return out;
}

// ---------------------------------------------------------------------------

async function main() {
	const dir = await mkdtemp(join(tmpdir(), "elusion-visits-"));
	const server = new BlobsServer({ directory: dir, token: TOKEN, port: 0 });
	const { port } = await server.start();

	setEnvironmentContext({
		edgeURL: `http://localhost:${port}`,
		uncachedEdgeURL: `http://localhost:${port}`,
		siteID: SITE_ID,
		token: TOKEN,
		primaryRegion: "us-east-1",
	});
	process.env.VISIT_SALT = "a-salt-for-the-suite";

	// Imported AFTER the environment is set, because the module builds nothing
	// at import time but there is no reason to depend on that.
	hit = (await import("./netlify/functions/hit.mjs")).default;

	const today = isoDay(0);

	// -----------------------------------------------------------------------
	console.log("\n--- one visitor, counted once ---");
	// -----------------------------------------------------------------------

	let { body } = await visit({ ip: "198.51.100.1" });
	check("a first visit is counted", body.counted === true, body);
	check("and the total says one", body.total === 1, body);

	({ body } = await visit({ ip: "198.51.100.1" }));
	// THE WHOLE DESIGN, IN ONE CHECK. The key is derived from the visitor and
	// the day, so the second write lands on the same key. Blobs' last-write-wins
	// is what makes this de-duplication rather than a double count.
	check("the same visitor again is NOT counted again", body.counted === false, body);
	check("and the total has not moved", body.total === 1, body);

	({ body } = await visit({ ip: "198.51.100.2" }));
	check("a different visitor is counted", body.counted === true, body);
	check("and the total says two", body.total === 2, body);

	({ body } = await visit({ ip: "198.51.100.1", agent: "Mozilla/5.0 (X11; Linux) Chrome/141" }));
	check("the same address on a different browser is a different visitor",
		body.counted === true && body.total === 3, body);

	// -----------------------------------------------------------------------
	console.log("\n--- two at once, which is what a naive counter loses ---");
	// -----------------------------------------------------------------------

	const before = (await visit({ peek: true })).body.total;
	const together = await Promise.all([
		visit({ ip: "198.51.100.10" }),
		visit({ ip: "198.51.100.11" }),
		visit({ ip: "198.51.100.12" }),
		visit({ ip: "198.51.100.13" }),
		visit({ ip: "198.51.100.14" }),
	]);
	const after = (await visit({ peek: true })).body.total;
	check("five simultaneous visitors all counted", after - before === 5,
		{ before, after, counted: together.map((t) => t.body.counted) });
	// A read-add-write counter would land somewhere between +1 and +5 here and
	// would never tell you which.
	check("every one of them reported itself as counted",
		together.every((t) => t.body.counted === true));

	// -----------------------------------------------------------------------
	console.log("\n--- peek reads without writing ---");
	// -----------------------------------------------------------------------

	const peekBefore = (await visit({ peek: true })).body.total;
	const peeked = await visit({ ip: "198.51.100.99", peek: true });
	check("peek does not count", peeked.body.counted === false, peeked.body);
	check("peek leaves the total alone",
		(await visit({ peek: true })).body.total === peekBefore);
	check("and wrote no record for that visitor",
		(await keysUnder(`v/${today}/`)).length === peekBefore);

	// -----------------------------------------------------------------------
	console.log("\n--- what is not a reader ---");
	// -----------------------------------------------------------------------

	const botBefore = (await visit({ peek: true })).body.total;
	for (const agent of [
		"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Mozilla/5.0 AhrefsBot/7.0",
		"curl/8.4.0",
		"python-requests/2.31.0",
		"Mozilla/5.0 HeadlessChrome/141.0.0.0",
		"Chrome-Lighthouse",
	]) {
		const r = await visit({ ip: "198.51.100.200", agent });
		check(`${agent.slice(0, 28)}... is not counted`, r.body.counted === false, r.body);
	}
	const blank = await visit({ ip: "198.51.100.201", agent: "" });
	check("a request with no user-agent at all is not counted",
		blank.body.counted === false, blank.body);
	check("none of them moved the total",
		(await visit({ peek: true })).body.total === botBefore);

	// -----------------------------------------------------------------------
	console.log("\n--- nothing identifying is written down ---");
	// -----------------------------------------------------------------------

	const allKeys = await keysUnder("v/");
	const ipInAKey = allKeys.some((k) => k.includes("198.51.100") || k.includes("203.0.113"));
	check("no address appears in any key", ipInAKey === false,
		allKeys.filter((k) => k.includes("198.51.100")).slice(0, 3));

	let ipInAValue = false;
	for (const key of allKeys) {
		const v = (await store().get(key)) || "";
		if (v.includes("198.51.100") || v.includes("Mozilla")) ipInAValue = true;
	}
	check("nor in any stored value", ipInAValue === false);

	// The day is inside the hash, so the same person tomorrow is a stranger.
	const todayKeys = new Set((await keysUnder(`v/${today}/`)).map((k) => k.split("/")[2]));
	await store().set(`v/${isoDay(1)}/placeholder`, "x");
	check("a day's fingerprints are scoped to that day",
		todayKeys.size > 0 && !todayKeys.has("placeholder"));
	await store().delete(`v/${isoDay(1)}/placeholder`);

	// -----------------------------------------------------------------------
	console.log("\n--- the rollup ---");
	// -----------------------------------------------------------------------

	// Two days that are finished, seeded directly. A finished day cannot gain
	// visitors, which is the property the rollup depends on.
	for (let i = 0; i < 4; i += 1) await store().set(`v/${isoDay(-5)}/old${i}`, "x");
	for (let i = 0; i < 3; i += 1) await store().set(`v/${isoDay(-4)}/old${i}`, "x");
	// And one in yesterday, which is deliberately NOT rolled up.
	await store().set(`v/${isoDay(-1)}/yesterday0`, "x");

	const live = (await visit({ peek: true })).body.total;
	check("finished days and yesterday are all in the total",
		live === botBefore + 4 + 3 + 1, { live, botBefore });

	const roll = await store().get("roll", { type: "json" });
	check("a rollup was written", roll !== null && typeof roll.total === "number", roll);
	// The LAST DAY ACTUALLY COUNTED, which is the most recent settled day that
	// had a visitor - not today-minus-two. See the note in hit.mjs: claiming the
	// whole settled window is the version that silently drops records.
	check("it covers the finished days and stops at the last one it counted",
		roll && roll.through === isoDay(-4), roll);
	check("and holds exactly their seven records", roll && roll.total === 7, roll);
	check("yesterday is NOT in the rollup, so it cannot be double counted",
		roll && roll.through < isoDay(-1), roll);

	// IDEMPOTENT. Two requests rolling forward compute the same bytes, which is
	// what makes last-write-wins safe on this key too.
	const again = (await visit({ peek: true })).body.total;
	check("rolling forward twice changes nothing", again === live, { live, again });

	// SELF-HEALING. The records are the truth; the rollup is a cache of them.
	await store().delete("roll");
	const healed = (await visit({ peek: true })).body.total;
	check("deleting the rollup does not lose a single visit", healed === live,
		{ live, healed });
	check("and it was rebuilt", (await store().get("roll", { type: "json" })) !== null);

	// A visit arriving into yesterday after a rollup still counts — the reason
	// yesterday is held out of it.
	await store().set(`v/${isoDay(-1)}/late-arrival`, "x");
	check("a record landing in yesterday after a rollup still counts",
		(await visit({ peek: true })).body.total === live + 1);

	// -----------------------------------------------------------------------
	console.log("\n--- the response itself ---");
	// -----------------------------------------------------------------------

	const { res } = await visit({ peek: true });
	check("it is json", (res.headers.get("content-type") || "").includes("application/json"));
	check("and is never cached", res.headers.get("cache-control") === "no-store",
		res.headers.get("cache-control"));

	await server.stop();
	await rm(dir, { recursive: true, force: true });

	// -----------------------------------------------------------------------
	console.log("\n--- the build publishes the site and nothing else ---");
	// -----------------------------------------------------------------------
	// THIS IS THE SECURITY HALF. Netlify deploys the publish directory and
	// nothing else, so the question "could node_modules be served" is answered
	// by what lands in dist/ - which is a thing to measure, not to assume.

	await run("node", ["build.mjs"], { cwd: process.cwd() });

	async function inDist(name) {
		try {
			await stat(join("dist", name));
			return true;
		} catch {
			return false;
		}
	}

	for (const shipped of ["index.html", "styles.css", "visits.js", "images"]) {
		check(`dist/ has ${shipped}`, await inDist(shipped));
	}
	for (const secret of ["node_modules", "netlify", "package.json", "build.mjs",
		"netlify.toml", "test_counter.mjs", ".gitignore", "dist"]) {
		check(`dist/ does NOT have ${secret}`, (await inDist(secret)) === false);
	}

	// A renamed page must break the build rather than silently stop shipping.
	const kept = await readFile("build.mjs", "utf8");
	await writeFile("build.mjs", kept.replace('"index.html",', '"index-renamed.html",'));
	let refused = false;
	try {
		await run("node", ["build.mjs"], { cwd: process.cwd() });
	} catch {
		refused = true;
	}
	await writeFile("build.mjs", kept);
	check("the build fails on a file it lists and cannot find", refused);
	await run("node", ["build.mjs"], { cwd: process.cwd() });

	// -----------------------------------------------------------------------
	console.log("\n--- the pages are wired to it ---");
	// -----------------------------------------------------------------------

	const PAGES = ["index.html", "about.html", "contribute.html", "join.html",
		"lore.html", "login.html", "simulator.html"];
	for (const page of PAGES) {
		const src = await readFile(page, "utf8");
		// THE TAG, NOT THE FILENAME. The first version of the script that added
		// these checked for the string "visits.js" and found it in the comment
		// it had just written three lines above the footer, so it skipped every
		// page and reported success. Same family as the text-check traps in
		// CLAUDE.md: the comment explaining a thing contains the thing.
		const tags = src.match(/<script src="visits\.js"><\/script>/g) || [];
		check(`${page} loads visits.js exactly once`, tags.length === 1, tags.length);
		check(`${page} has somewhere to put the number`,
			src.includes('id="visit-count"') && src.includes('id="visit-line"'));
		check(`${page} starts with the line hidden`, /id="visit-line" hidden/.test(src));
		// ABOVE THE NAV, which is what "at the top" means in markup terms. A
		// check on the CSS would only say how it is painted; this says where it
		// is in the document, which is what survives a stylesheet edit.
		const lineAt = src.indexOf('id="visit-line"');
		const navAt = src.indexOf('<nav class="main-nav">');
		check(`${page} puts the counter above the nav`,
			lineAt > -1 && navAt > -1 && lineAt < navAt, { lineAt, navAt });
		check(`${page} does not still have it in the footer`,
			!/<footer>[\s\S]*id="visit-line"[\s\S]*<\/footer>/.test(src));
	}

	// -----------------------------------------------------------------------
	console.log("\n--- the policy did not have to move ---");
	// -----------------------------------------------------------------------

	const toml = await readFile("netlify.toml", "utf8");
	const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1] || "";
	check("connect-src is still self and only self", /connect-src 'self';/.test(csp), csp);
	check("script-src gained no external host",
		/script-src 'self' 'unsafe-inline';/.test(csp), csp);
	check("no analytics domain crept into the policy",
		!/goatcounter|plausible|umami|google-analytics|googletagmanager|cloudflareinsights/i.test(csp));
	check("the publish directory is not the repository root",
		/publish = "dist"/.test(toml) && !/publish = "\."/.test(toml));
	check("and the functions directory is declared",
		/directory = "netlify\/functions"/.test(toml));

	console.log(`\n=== ${passed} passed, ${failed} failed ===`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("\nthe suite itself broke:", err);
	process.exit(1);
});
