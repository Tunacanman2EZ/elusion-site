// hit.mjs — the visitor counter's only moving part on the server.
//
// ONE OBJECT PER VISITOR PER DAY, AT A KEY DERIVED FROM THE VISITOR.
//
// That sentence is the whole design, and it is a direct answer to the one thing
// Netlify Blobs will not do. There is no atomic increment, and the docs are
// explicit about the consequence: "Last write wins. If two overlapping calls
// try to write the same object, the last write wins. Netlify Blobs does not
// include a concurrency control mechanism."
//
// So the obvious counter — read `count`, add one, write it back — silently
// loses hits whenever two people arrive in the same moment. It would undercount
// precisely when traffic is worth measuring, and it would undercount invisibly,
// because a number that is too low looks exactly like a quiet day.
//
// Writing one object per visitor turns that weakness into the mechanism:
//
//   two different visitors  -> two different keys -> neither write is lost
//   the same visitor twice  -> the SAME key       -> last-write-wins IS the
//                                                    de-duplication, for free
//
// Counting is then `list` over a prefix, and the number is derived from the
// records rather than stored as a running total somebody has to keep correct.
// Nothing can drift, because there is no second copy to drift from.

import { getStore } from "@netlify/blobs";

// STRONG CONSISTENCY, ACCEPTING THE SLOWER READ. Eventual consistency is
// guaranteed to propagate within 60 seconds, which for this store would mean a
// visitor being shown a number that does not yet include them. The footer
// saying "1,203 visits" to the person who just became 1,204 is a small lie, and
// this is a cheap store — one tiny object per visitor per day.
const STORE = { name: "visits", consistency: "strong" };

// WHAT COUNTS AS A PERSON. Nothing here runs unless a browser executed
// visits.js, so crawlers that do not run JavaScript never arrive at all — that
// filter is free and it is the reason this list is short rather than a
// maintained arms race. What is left is the handful of agents that DO run
// scripts and are still not readers.
const NOT_A_READER = [
	"bot", "crawler", "spider", "slurp", "headless", "phantom",
	"lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime",
	"curl", "wget", "python-requests", "axios", "postman",
];

// ---------------------------------------------------------------------------
// DAYS
// ---------------------------------------------------------------------------
// UTC, NOT MOUNTAIN TIME, and that is deliberate even though every timestamp
// the game shows a player is local. A bucket boundary has to be a fixed thing:
// "today" computed in a zone that observes DST would, twice a year, be an hour
// that happens once or an hour that happens twice, and a visitor could land in
// a day that had already been rolled up. Nobody reads these keys; they are
// arithmetic, so they get the zone with no edge cases.

function isoDay(offsetDays) {
	const t = Date.now() + offsetDays * 86400000;
	return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// WHO IS THIS, WITHOUT KNOWING WHO THIS IS
// ---------------------------------------------------------------------------

async function fingerprint(ip, agent, day, salt) {
	// THE DAY IS INSIDE THE HASH, which is what makes this a counter rather
	// than a tracker. The same address tomorrow produces an unrelated value, so
	// there is no key anybody — including me — can follow across days. The IP
	// itself is never written anywhere.
	//
	// THE SALT MATTERS MORE THAN IT LOOKS. IPv4 is four billion addresses,
	// which is a weekend of brute force against an unsalted hash. With a secret
	// in the input, a stored fingerprint is not reversible by anybody who does
	// not already hold the secret. See DEPLOY.md — it is one environment
	// variable and it is the difference between a hash and a fig leaf.
	const data = new TextEncoder().encode([ip, agent, day, salt].join("\u0000"));
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.slice(0, 10)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ---------------------------------------------------------------------------
// COUNTING
// ---------------------------------------------------------------------------

async function countDay(store, day) {
	// PAGINATED ON PURPOSE. The convenience form returns everything in one
	// promise, which is the form that works beautifully until the day it
	// doesn't. Iterating costs nothing extra at this size and has no ceiling.
	let seen = 0;
	for await (const page of store.list({ prefix: `v/${day}/`, paginate: true })) {
		seen += page.blobs.length;
	}
	return seen;
}

async function settledTotal(store, settledThrough) {
	// THE ROLLUP EXISTS SO THE COMMON REQUEST DOES NOT LIST THE WHOLE HISTORY.
	// It holds one number and the last day folded into it. Everything it covers
	// is finished and can never change again, which is what makes the write
	// below safe without any locking.
	const roll = (await store.get("roll", { type: "json" })) || { through: "", total: 0 };
	if (roll.through >= settledThrough) return roll.total;

	// One entry per day that has ever had a visitor, so this is a few hundred
	// strings a year — not a scan of the records themselves.
	const { directories } = await store.list({ prefix: "v/", directories: true });

	let total = roll.total;
	let through = roll.through;

	for (const dir of directories.slice().sort()) {
		const day = dir.replace(/^v\//, "").replace(/\/$/, "");
		if (day > settledThrough) continue;         // still being counted live
		if (roll.through && day <= roll.through) continue;   // already folded in
		total += await countDay(store, day);
		if (day > through) through = day;
	}

	// `through` IS THE LAST DAY ACTUALLY COUNTED, never simply "today minus
	// two", and the difference is not cosmetic. Writing settledThrough here
	// would be the rollup claiming credit for days it had not looked at - and it
	// was tried: the suite caught a rollup that recorded `through` two days back
	// with a total of zero on a site with no history, after which any record
	// discovered inside that range was skipped for ever, because the rollup
	// insisted it had already been folded in. Seven visits vanished.
	//
	// The cost of doing it this way is one directory listing on a request that
	// follows a settled day nobody visited. That listing returns one short
	// string per day that has ever had a visitor, so it is a few hundred strings
	// a year - a fair price for a number that can only ever be built from
	// records somebody actually counted.
	if (through !== roll.through) {
		// LAST-WRITE-WINS IS HARMLESS HERE, and this is the one place worth
		// spelling out why. Two requests rolling forward at the same moment read
		// the same rollup and the same finished days, so they compute the SAME
		// total and the SAME `through` and write identical bytes. A lost update
		// loses nothing, because both updates said the same thing.
		//
		// It is also self-healing: the per-visitor records are never deleted, so
		// a rollup that is lost or corrupted is rebuilt from them on the next
		// request rather than being a number nobody can recover.
		await store.setJSON("roll", { through, total });
	}
	return total;
}

// ---------------------------------------------------------------------------

export default async (req, context) => {
	const store = getStore(STORE);

	const url = new URL(req.url);
	const peek = url.searchParams.get("peek") === "1";

	const agent = req.headers.get("user-agent") || "";
	const lowered = agent.toLowerCase();
	const readable = agent !== "" && !NOT_A_READER.some((s) => lowered.includes(s));

	const today = isoDay(0);
	const yesterday = isoDay(-1);
	// TWO DAYS OF MARGIN BEFORE A DAY IS CONSIDERED FINISHED, which removes a
	// race rather than making it unlikely. A visit written at 23:59:59 belongs
	// to that day; a rollup running seconds later at 00:00:01 would be counting
	// a day that was still, by a hair, receiving writes. Counting today AND
	// yesterday live costs one extra prefix list and means the rollup only ever
	// touches days that have been closed for a full day.
	const settledThrough = isoDay(-2);

	let counted = false;
	if (!peek && readable) {
		const ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "0.0.0.0";
		const salt = process.env.VISIT_SALT || process.env.SITE_ID || "";
		const key = `v/${today}/${await fingerprint(ip, agent, today, salt)}`;

		// onlyIfNew IS A REAL CREATE-IF-ABSENT, so a returning visitor costs no
		// write at all and `modified` tells us whether this was a first visit
		// today. The de-duplication would work without it — the key is the same
		// either way — but there is no reason to spend the write.
		const result = await store.set(key, String(Date.now()), { onlyIfNew: true });
		counted = result.modified === true;
	}

	const [settled, live, liveYesterday] = await Promise.all([
		settledTotal(store, settledThrough),
		countDay(store, today),
		countDay(store, yesterday),
	]);

	return new Response(
		JSON.stringify({
			total: settled + live + liveYesterday,
			today: live,
			counted,
		}),
		{
			headers: {
				"content-type": "application/json",
				// NEVER CACHED. A cached counter is a picture of a counter.
				"cache-control": "no-store",
			},
		},
	);
};
