// build.mjs — stages the publishable website into dist/.
//
// WHY THIS FILE EXISTS, given the site is hand-written HTML with nothing to
// compile: Netlify deploys the publish directory and nothing else — "Only files
// in the publish directory are deployed." Publishing the repository root would
// therefore publish node_modules, this build script, and the function source
// alongside the site.
//
// So the root is the PROJECT and dist/ is the WEBSITE, and the list below is
// the boundary between them. That makes "what is public" something you can read
// in one place rather than something you infer from what happens to be lying in
// a folder — which is the same reason the CSP in netlify.toml is written out
// rather than left to defaults.
//
// IT FAILS ON A MISSING REQUIRED ENTRY rather than quietly shipping without it.
// A renamed page that silently stops being copied is a 404 nobody finds until a
// visitor does.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const OUT = "dist";

// Everything the browser is allowed to ask for. A new page, image folder or
// script goes here, and nothing reaches the public site without being named.
const REQUIRED = [
	"index.html",
	"about.html",
	"contribute.html",
	"join.html",
	"lore.html",
	"login.html",
	"simulator.html",
	"bosssim.js",
	"bosssim-data.js",
	"styles.css",
	"script.js",
	"visits.js",
	"contribute.js",
	"contribute-data.js",
	"join.js",
	"images",
	// Pixelify Sans, one of the game's own fonts, with its OFL.txt beside it:
	// the licence has to travel with the font.
	"fonts",
];

// Present today, and the site is fine without them — small side pages that
// predate the rest. Named here so they keep shipping, but their absence is not
// a build failure.
const OPTIONAL = ["book-search", "kingdom-card", "test", "robots.txt", "favicon.ico"];

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	await rm(OUT, { recursive: true, force: true });
	await mkdir(OUT, { recursive: true });

	const missing = [];
	let copied = 0;

	for (const entry of REQUIRED) {
		if (!(await exists(entry))) {
			missing.push(entry);
			continue;
		}
		await cp(entry, join(OUT, entry), { recursive: true });
		copied += 1;
	}

	if (missing.length > 0) {
		console.error(
			"build: these are listed in build.mjs and are not in the project:\n  " +
				missing.join("\n  ") +
				"\nEither the file was renamed or the list is stale. Fix one of them.",
		);
		process.exit(1);
	}

	for (const entry of OPTIONAL) {
		if (await exists(entry)) {
			await cp(entry, join(OUT, entry), { recursive: true });
			copied += 1;
		}
	}

	console.log(`build: staged ${copied} entries into ${OUT}/`);
}

main().catch((err) => {
	console.error("build failed:", err);
	process.exit(1);
});
