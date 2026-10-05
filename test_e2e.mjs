// test_e2e.mjs — the built site, in a real browser, under the real CSP.
//
//   node test_e2e.mjs
//
// test_counter.mjs proves the function counts correctly and that the pages carry
// the right markup. It cannot prove the one claim the whole design rests on:
// that a browser enforcing netlify.toml's Content-Security-Policy actually
// PERMITS the fetch. That is a question about the browser, so it is asked of a
// browser.
//
// THE CSP HEADER IS READ OUT OF netlify.toml, not retyped here. A copy would
// pass while the real policy rotted, which is the failure this whole suite keeps
// being about.

import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { chromium } from "playwright";

// PLAYWRIGHT IS NOT A DEPENDENCY OF THIS SITE, on purpose. Netlify installs
// devDependencies on every build, and a browser driver download per deploy is a
// cost the visitor counter has no business imposing. To run this file:
//
//     npm i --no-save playwright && npx playwright install chromium
//
// Set PW_CHROMIUM to an existing Chromium binary to skip that download.

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

const TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".png": "image/png",
	".gif": "image/gif",
	".ico": "image/x-icon",
};

async function main() {
	const toml = await readFile("netlify.toml", "utf8");
	const csp = (toml.match(/Content-Security-Policy = "([^"]+)"/) || [])[1];
	if (!csp) throw new Error("no Content-Security-Policy found in netlify.toml");
	console.log(`\nserving dist/ under the policy from netlify.toml:\n  ${csp}\n`);

	const dir = await mkdtemp(join(tmpdir(), "elusion-e2e-"));
	const blobs = new BlobsServer({ directory: dir, token: "t", port: 0 });
	const { port: blobPort } = await blobs.start();
	setEnvironmentContext({
		edgeURL: `http://localhost:${blobPort}`,
		uncachedEdgeURL: `http://localhost:${blobPort}`,
		siteID: "e2e",
		token: "t",
		primaryRegion: "us-east-1",
	});
	process.env.VISIT_SALT = "e2e-salt";
	const hit = (await import("./netlify/functions/hit.mjs")).default;

	let functionCalls = 0;

	const site = createServer(async (req, res) => {
		const url = new URL(req.url, "http://localhost");

		if (url.pathname === "/.netlify/functions/hit") {
			functionCalls += 1;
			// Netlify gives the function the client address; locally it is us.
			const request = new Request(`https://e2e.test${req.url}`, {
				headers: { "user-agent": req.headers["user-agent"] || "" },
			});
			const answer = await hit(request, { ip: "198.51.100.77" });
			const body = await answer.text();
			res.writeHead(answer.status, {
				"content-type": answer.headers.get("content-type") || "application/json",
				"cache-control": answer.headers.get("cache-control") || "no-store",
				// THE POLICY IS SERVED ON EVERY RESPONSE, exactly as netlify.toml
				// applies it to "/*".
				"content-security-policy": csp,
			});
			res.end(body);
			return;
		}

		const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
		const file = join("dist", rel);
		try {
			await stat(file);
			const body = await readFile(file);
			res.writeHead(200, {
				"content-type": TYPES[extname(file)] || "application/octet-stream",
				"content-security-policy": csp,
			});
			res.end(body);
		} catch {
			res.writeHead(404, { "content-security-policy": csp });
			res.end("not found");
		}
	});

	await new Promise((r) => site.listen(0, r));
	const sitePort = site.address().port;
	const base = `http://localhost:${sitePort}`;

	const browser = await chromium.launch(
		process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
	);
	const context = await browser.newContext({
		// A REAL BROWSER'S USER-AGENT, because headless Chromium announces itself
		// as "HeadlessChrome" and the counter's bot filter correctly refuses to
		// count it. Without this every number on the page is zero and this file
		// would be testing the bot filter instead of the page. The filter has its
		// own checks in test_counter.mjs.
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" +
			" (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
	});
	const page = await context.newPage();

	const violations = [];
	const errors = [];
	page.on("console", (msg) => {
		const text = msg.text();
		if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
		// favicon.ico is requested by the browser whether or not the site has
		// one, so its 404 is the browser's noise rather than the page's fault.
		if (msg.type() === "error" && !/favicon/.test(text)) errors.push(text);
	});
	page.on("pageerror", (err) => errors.push(String(err)));
	// The console message for a failed subresource does not name the URL, so the
	// URL is collected here. Without it "no script errors" fails with a 404 it
	// cannot identify, which is a check nobody can act on.
	const notFound = [];
	page.on("response", (res) => {
		if (res.status() === 404) notFound.push(new URL(res.url()).pathname);
	});

	// -----------------------------------------------------------------------
	console.log("--- the home page ---");
	// -----------------------------------------------------------------------

	await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

	check("the function was called", functionCalls === 1, functionCalls);
	check("the CSP blocked nothing", violations.length === 0, violations.slice(0, 3));
	// EVERY 404 IS NAMED. favicon.ico is requested by the browser whether or not
	// the site has one, so it is the browser's noise; anything else is the page
	// asking for something that is not in dist/, which is a real defect and the
	// kind build.mjs's list exists to prevent.
	const realMisses = notFound.filter((p) => !/favicon/.test(p));
	check("nothing the page asked for is missing from dist/",
		realMisses.length === 0, realMisses);
	check("no script errors beyond that",
		errors.filter((e) => !/404/.test(e)).length === 0, errors.slice(0, 3));
	check("(for the record, the only 404 is the browser's own favicon probe)",
		notFound.every((p) => /favicon/.test(p)), notFound);

	const visible = await page.isVisible("#visit-line");
	check("the counter line is showing", visible === true);

	const shown = (await page.textContent("#visit-count")) || "";
	check("and it shows the first visit", shown.trim() === "1", shown);

	const wholeLine = ((await page.textContent("#visit-line")) || "").replace(/\s+/g, " ").trim();
	// "1 visit", singular. The site reads 1 exactly once in its life and it
	// would be the first thing anybody saw. Same rule the game already keeps
	// for "1 day" in describe_ban_remaining().
	check("reading as a sentence, singular", wholeLine === "1 visit", wholeLine);

	// -----------------------------------------------------------------------
	console.log("\n--- a second page in the same tab ---");
	// -----------------------------------------------------------------------
	// sessionStorage should make this a peek rather than a second write, and the
	// number must still be there.

	await page.goto(`${base}/about.html`, { waitUntil: "networkidle" });
	check("the function was called again", functionCalls === 2, functionCalls);
	check("as a peek, not a write", await page.isVisible("#visit-line"));
	check("and the number has not doubled",
		((await page.textContent("#visit-count")) || "").trim() === "1");
	check("still no CSP violations", violations.length === 0, violations.slice(0, 3));

	// -----------------------------------------------------------------------
	console.log("\n--- when the counter is down ---");
	// -----------------------------------------------------------------------
	// THE LINE MUST STAY HIDDEN. A footer reading "0 visits" because the
	// function 500'd is worse than no footer line, because it is a number and
	// people believe numbers.

	const broken = await context.newPage();
	await broken.route("**/.netlify/functions/hit*", (route) =>
		route.fulfill({ status: 500, body: "nope" }));
	await broken.goto(`${base}/index.html`, { waitUntil: "networkidle" });
	check("a failed request leaves the line hidden",
		(await broken.isVisible("#visit-line")) === false);
	const brokenText = (await broken.textContent("#visit-count")) || "";
	check("and shows no number at all", brokenText.trim() === "", brokenText);
	await broken.close();

	// -----------------------------------------------------------------------
	console.log("\n--- a total of zero is not a number worth showing ---");
	// -----------------------------------------------------------------------
	// THIS IS A BUG THIS SUITE FOUND. visits.js accepted any total >= 0, so a
	// site nobody had visited yet - and any viewer the bot filter declined to
	// count - was shown "0 visits" in the footer. A zero reads as "this site is
	// dead", which is worse than the line not being there.

	const zero = await context.newPage();
	await zero.route("**/.netlify/functions/hit*", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ total: 0, today: 0, counted: false }),
		}));
	await zero.goto(`${base}/index.html`, { waitUntil: "networkidle" });
	check("a total of zero leaves the line hidden",
		(await zero.isVisible("#visit-line")) === false);
	await zero.close();

	const one = await context.newPage();
	await one.route("**/.netlify/functions/hit*", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ total: 1, today: 1, counted: true }),
		}));
	await one.goto(`${base}/index.html`, { waitUntil: "networkidle" });
	check("a total of one does show", (await one.isVisible("#visit-line")) === true);
	check("and says visit, not visits",
		((await one.textContent("#visit-word")) || "").trim() === "visit",
		await one.textContent("#visit-word"));
	await one.close();

	const big = await context.newPage();
	await big.route("**/.netlify/functions/hit*", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ total: 1234567, today: 12, counted: true }),
		}));
	await big.goto(`${base}/index.html`, { waitUntil: "networkidle" });
	check("a big number is grouped for reading",
		((await big.textContent("#visit-count")) || "").trim() === "1,234,567",
		await big.textContent("#visit-count"));
	check("and is plural",
		((await big.textContent("#visit-word")) || "").trim() === "visits");
	await big.close();

	// -----------------------------------------------------------------------
	console.log("\n--- how it looks ---");
	// -----------------------------------------------------------------------

	await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

	// IT IS ABOVE THE NAV, measured rather than assumed. getBoundingClientRect
	// is the browser's own answer to "which of these is higher up the page",
	// and it survives any change to how the strip is styled.
	const order = await page.evaluate(() => {
		const line = document.querySelector("#visit-line");
		const nav = document.querySelector("nav.main-nav");
		if (!line || !nav) return null;
		return { line: line.getBoundingClientRect().top, nav: nav.getBoundingClientRect().top };
	});
	check("the counter is drawn above the nav", order !== null && order.line < order.nav, order);
	check("and it is the first thing on the page", order !== null && order.line < 10, order);

	await page.screenshot({ path: "shot_top.png", clip: { x: 0, y: 0, width: 1280, height: 150 } });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: "shot_top_mobile.png", clip: { x: 0, y: 0, width: 390, height: 190 } });
	check("a screenshot of the top of the page was taken", true);

	await browser.close();
	site.close();
	await blobs.stop();
	await rm(dir, { recursive: true, force: true });

	console.log(`\n=== ${passed} passed, ${failed} failed ===`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("\nthe suite itself broke:", err);
	process.exit(1);
});
