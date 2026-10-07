// contribute-data.js — the ONE file you edit to update the Support page.
// No build step: change a number here, save, redeploy.
//
// ── PRICES ────────────────────────────────────────────────────────────────
// What a piece of art actually costs, in one place: the page's price list is
// drawn from here, so a figure can't say one thing in the list and another
// anywhere else. Write each as it should read. Anything bigger (a raid boss,
// a whole tileset) is quoted with the artist, and the page says so instead of
// listing a number.
//
// ── LEDGER ────────────────────────────────────────────────────────────────
// Keep these numbers REAL - it's a promise you can stand behind, not a
// screenshot. "raised" is what people gave FOR ART (a payment whose PayPal
// note says it's for art). "tips" is the hot cocoa - personal, a thank-you to
// you, and deliberately counted on its own line so the total is complete
// without pretending the two are the same thing.
//
// The allocations are where the art money went (or is held). They don't have
// to sum to "raised" - held, unspent money is honest to show.
//
// ── SUPPORTERS ────────────────────────────────────────────────────────────
// Not here any more: a name from a PayPal note goes straight into the game's
// credits - SUPPORTERS in src/ui/menus/creditsscreen.gd (Options > Credits >
// Support).

window.CONTRIBUTE = {
  prices: [
    { kind: "A character", price: "$200" },
    { kind: "An enemy",    price: "$200" },
    { kind: "A prop",      price: "$25–$50" }
  ],

  ledger: {
    currency: "$",
    updated: "October 2026",
    raised: 0,
    tips: 0,
    allocations: [
      { label: "Character & world art",   amount: 0 },
      { label: "Music",                   amount: 0 },
      { label: "Held for the next piece", amount: 0 }
    ]
  }
};
