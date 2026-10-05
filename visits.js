// visits.js — asks the counter for the number and puts it in the footer.
//
// SAME ORIGIN, WHICH IS THE WHOLE REASON THIS IS THE SHAPE IT IS. netlify.toml
// sets `connect-src 'self'` and `script-src 'self' 'unsafe-inline'`, and that
// policy was written by reading every page and tuned to what the site actually
// does. Every hosted analytics service would need it widened by two domains —
// one to load their script, one to let it phone home. A function on this site
// needs neither: it is already 'self'.
//
// IT STARTS HIDDEN AND IS REVEALED ON SUCCESS, never the other way round. A
// footer that renders "0 visits" when the function is down or the request is
// blocked is worse than a footer with no line in it, because it is a number and
// people believe numbers. Nothing is shown until a real one arrives.

(function () {
	"use strict";

	var line = document.querySelector("#visit-line");
	var value = document.querySelector("#visit-count");
	var word = document.querySelector("#visit-word");
	if (!line || !value) return;

	// ONE WRITE PER TAB SESSION. The server de-duplicates anyway — the key is
	// derived from the visitor and the day, so a refresh writes nothing new —
	// but the free plan has a hard credit cap that PAUSES the site when it is
	// reached, so an invocation not spent is worth having. `peek` reads the
	// number without attempting the write.
	//
	// EVERY sessionStorage ACCESS IS WRAPPED. It throws outright in some privacy
	// modes, and a counter is not worth a script error on the page.
	var already = false;
	try {
		already = window.sessionStorage.getItem("elusion.counted") === "1";
	} catch (e) {
		already = false;
	}

	fetch("/.netlify/functions/hit" + (already ? "?peek=1" : ""), {
		method: "GET",
		headers: { accept: "application/json" },
		cache: "no-store",
	})
		.then(function (res) {
			if (!res.ok) throw new Error("status " + res.status);
			return res.json();
		})
		.then(function (data) {
			var total = Number(data && data.total);
			// AT LEAST ONE, NOT AT LEAST ZERO. The first version of this line
			// accepted 0 and the end-to-end suite caught it rendering
			// "0 visits" in the footer - which is precisely the thing the
			// comment at the top of this file promises cannot happen. Zero is
			// never a number worth showing: either nobody has been here yet, or
			// this viewer was not counted, and both read to a visitor as "this
			// site is dead" rather than as "no data".
			if (!isFinite(total) || total < 1) return;

			value.textContent = total.toLocaleString();
			// "1 visit", NOT "1 visits". The site will read 1 exactly once in
			// its life and it would be the first thing anybody saw.
			if (word) word.textContent = total === 1 ? "visit" : "visits";
			// AND "visits" RATHER THAN "visitors" for every other number,
			// because that is what is being counted. One person is counted once
			// a day and again if they come back tomorrow, so "visitors" would
			// claim more different people than have actually been here.
			line.hidden = false;

			try {
				window.sessionStorage.setItem("elusion.counted", "1");
			} catch (e) {
				/* nothing to do — the worst case is one extra write next page */
			}
		})
		.catch(function () {
			// Deliberately silent, and deliberately leaves the line hidden.
		});
})();
