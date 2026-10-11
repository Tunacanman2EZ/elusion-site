// test_seo.mjs — what search engines and link previews read, held together.
//
//   node test_seo.mjs
//
// No dependencies and no network. It reads the pages, sitemap.xml, robots.txt,
// build.mjs and the images they point at, straight from this folder.
//
// THE FAILURE IT EXISTS FOR is three lists drifting apart: the pages' canonical
// tags, sitemap.xml, and build.mjs. A page added to the site and the sitemap but
// not the build is a sitemap entry Google gets a 404 for. A page renamed with its
// canonical left behind tells Google the real page is somewhere it is not. None
// of that shows in a browser, so nobody finds it by looking.

import { readFile, stat } from "node:fs/promises";

const BASE = "https://www.elusionrpg.com";

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

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

// THE TAG, NOT THE TEXT. Each page's comment above these tags names them, so a
// plain includes() would find the comment (test_counter.mjs learned this with
// visits.js). Every read here matches the attribute inside a real tag.
function meta(src, attr, key) {
	const all = [...src.matchAll(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`, "g"))];
	return all.map((m) => m[1]);
}
function canonical(src) {
	return [...src.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
}
function listIn(buildSrc, name) {
	const block = buildSrc.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
	if (!block) return [];
	return [...block[1].replace(/\/\/.*$/gm, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
function decode(s) {
	return s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}
function localPath(url) {
	// https://www.elusionrpg.com/lore.html -> lore.html ; .../ -> index.html
	const path = url.slice(BASE.length).replace(/^\//, "");
	return path === "" ? "index.html" : path;
}

async function main() {
	const build = await readFile("build.mjs", "utf8");
	const REQUIRED = listIn(build, "REQUIRED");
	const OPTIONAL = listIn(build, "OPTIONAL");

	// -----------------------------------------------------------------------
	console.log("\n--- sitemap.xml and robots.txt ---");
	// -----------------------------------------------------------------------

	const sitemap = await readFile("sitemap.xml", "utf8");
	const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
	check("the sitemap lists pages", locs.length > 0, locs.length);
	check("every <loc> is on the one site address", locs.every((u) => u.startsWith(BASE + "/")), locs);
	check("no page is listed twice", new Set(locs).size === locs.length);
	check("the home page is listed as the bare address, not index.html",
		locs.includes(BASE + "/") && !locs.includes(BASE + "/index.html"));
	const lastmods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
	check("every lastmod is a plain date", lastmods.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), lastmods);

	const robots = await readFile("robots.txt", "utf8");
	const rules = robots.split(/\r?\n/).filter((l) => !l.startsWith("#"));
	check("robots.txt names the sitemap", rules.includes(`Sitemap: ${BASE}/sitemap.xml`));
	// A noindex can only be read by a crawler allowed to fetch the page.
	check("robots.txt does not block the whole site", !rules.some((l) => /^Disallow:\s*\/\s*$/.test(l)));
	for (const loc of locs) {
		const path = "/" + localPath(loc);
		const blocked = rules.some((l) => {
			const m = l.match(/^Disallow:\s*(\S+)/);
			return m && path.startsWith(m[1]);
		});
		check(`robots.txt lets ${path} be crawled`, !blocked);
	}

	for (const file of ["sitemap.xml", "robots.txt", "favicon.ico"]) {
		check(`build.mjs ships ${file} as REQUIRED`, REQUIRED.includes(file));
	}

	// -----------------------------------------------------------------------
	console.log("\n--- every page is either in search, or says it is not ---");
	// -----------------------------------------------------------------------

	const pages = REQUIRED.filter((e) => e.endsWith(".html"));
	for (const dir of OPTIONAL) {
		if (await exists(`${dir}/index.html`)) pages.push(`${dir}/index.html`);
	}
	check("build.mjs names the pages", pages.length >= 7, pages);

	const canonicals = new Map();
	const titles = new Map();
	const descriptions = new Map();
	for (const page of pages) {
		const src = await readFile(page, "utf8");
		const canon = canonical(src);
		const noindex = meta(src, "name", "robots").some((v) => /noindex/.test(v));
		check(`${page}: one canonical or a noindex, never both`,
			(canon.length === 1) !== noindex, { canon, noindex });
		if (noindex) {
			check(`${page}: not in the sitemap`, !locs.some((u) => localPath(u) === page));
			continue;
		}
		const url = canon[0];
		canonicals.set(page, url);
		check(`${page}: its canonical is this page`, localPath(url) === page, url);
		check(`${page}: and is in the sitemap`, locs.includes(url), url);

		const title = (src.match(/<title>([^<]*)<\/title>/g) || []);
		check(`${page}: exactly one <title>`, title.length === 1, title.length);
		titles.set(page, title[0]);

		const desc = meta(src, "name", "description");
		check(`${page}: one description`, desc.length === 1, desc.length);
		const words = decode(desc[0] || "");
		// Google cuts a snippet at about this width; past it the end is "...".
		check(`${page}: description 50-160 characters`, words.length >= 50 && words.length <= 160, words.length);
		check(`${page}: description names the game`, /Elusion/.test(words));
		descriptions.set(page, words);

		const og = (k) => meta(src, "property", `og:${k}`);
		check(`${page}: og:url is the canonical`, og("url").length === 1 && og("url")[0] === url, og("url"));
		check(`${page}: og:title and og:description`, og("title").length === 1 && og("description").length === 1);
		check(`${page}: og:site_name is the site's name`, og("site_name")[0] === "Elusion RPG");
		const image = og("image");
		check(`${page}: one og:image on this site`, image.length === 1 && image[0].startsWith(BASE + "/"), image);
		if (image[0]) check(`${page}: its og:image ships`, await exists(localPath(image[0])), image[0]);
		check(`${page}: a large card on X`, meta(src, "name", "twitter:card")[0] === "summary_large_image");

		for (const m of src.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)) {
			check(`${page}: icon /${m[1]} ships`, await exists(m[1]));
		}
	}

	check("no two pages share a title", new Set(titles.values()).size === titles.size, [...titles.values()]);
	check("no two pages share a description", new Set(descriptions.values()).size === descriptions.size);
	const listed = new Set(canonicals.values());
	check("every sitemap entry is a page that ships", locs.every((u) => listed.has(u)),
		locs.filter((u) => !listed.has(u)));

	// -----------------------------------------------------------------------
	console.log("\n--- the home page names the site ---");
	// -----------------------------------------------------------------------
	// developers.google.com/search/docs/appearance/site-names: WebSite data on
	// the home page only, url = the home page's canonical.

	const home = await readFile("index.html", "utf8");
	const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
	check("one block of structured data", blocks.length === 1, blocks.length);
	let site = null;
	try {
		site = JSON.parse(blocks[0][1]);
	} catch (err) {
		check("it parses as JSON", false, String(err));
	}
	if (site) {
		check("it is a WebSite", site["@type"] === "WebSite" && site["@context"] === "https://schema.org");
		check("named Elusion RPG", site.name === "Elusion RPG");
		check("at the home page's canonical", site.url === canonicals.get("index.html"), site.url);
	}
	for (const page of pages.filter((p) => p !== "index.html")) {
		const src = await readFile(page, "utf8");
		check(`${page}: no site-name data (home page only)`, !/application\/ld\+json/.test(src));
	}

	// -----------------------------------------------------------------------
	console.log("\n--- the pictures are the sizes the tags say ---");
	// -----------------------------------------------------------------------

	const png = await readFile("images/social-card.png");
	const w = png.readUInt32BE(16);
	const h = png.readUInt32BE(20);
	check("social-card.png is a PNG", png.subarray(1, 4).toString() === "PNG");
	check("1200 x 630, as og:image:width/height say", w === 1200 && h === 630, { w, h });
	check("under 300 KB, so previews load it", png.length < 300 * 1024, png.length);

	const ico = await readFile("favicon.ico");
	const count = ico.readUInt16LE(4);
	const sizes = [];
	for (let i = 0; i < count; i += 1) sizes.push(ico[6 + i * 16] || 256);
	check("favicon.ico is an icon file", ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1);
	// Google shows a favicon only if it is a multiple of 48px square.
	check("it holds a 48px icon, which Google needs", sizes.includes(48), sizes);
	check("and the small ones browsers use", sizes.includes(16) && sizes.includes(32), sizes);

	console.log(`\n=== ${passed} passed, ${failed} failed ===`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
