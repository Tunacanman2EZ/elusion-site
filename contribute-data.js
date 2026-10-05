// contribute-data.js — the ONE file you edit to update the Contribute page.
// No build step: change a number or add a supporter here, save, redeploy.
//
// ── PRICES ────────────────────────────────────────────────────────────────
// What a piece of art actually costs, in one place. Every figure shown
// anywhere on the page is read from here, so a repriced character cannot end
// up saying $200 in one spot and $250 in another — which is exactly how a
// page that asks people for money stops being trustworthy.
//
// Anything bigger than these three (a raid boss, a whole tileset) is NOT
// listed with a number. It is quoted with the artist, and the page says so
// rather than showing a figure that would have to be defended later.
//
// ── LEDGER ────────────────────────────────────────────────────────────────
// Keep these numbers REAL. This is the whole point — it's a promise you can
// stand behind, not a screenshot. "raised" is the GAME FUND: money given
// toward art, servers and tools. "tips" is the hot chocolate — personal, a
// thank-you to you, and deliberately counted on its own line so the total is
// complete without pretending the two are the same thing.
//
// The allocations are where the game fund went (or is held). They don't have
// to sum to "raised" — held, unspent money is honest to show.
//
// ── SUPPORTERS ────────────────────────────────────────────────────────────
// Only add people you've actually matched against your PayPal records — that's
// what keeps the wall trustworthy. Someone submits the form, you check they
// really supported, then you paste them in here. A hot chocolate counts: they
// showed up, so they go up.
//   featured  = bigger backers, shown large up top (the "founding" row)
//   community = everyone else, shown in the grid below
// `message` is optional (their words). `note` is an optional little badge
// (e.g. "Founding Supporter", "Hot chocolate"). Keep it short.

window.CONTRIBUTE = {
  prices: {
    currency: "$",
    character: 200,
    enemy: 200,
    prop: 100
  },

  ledger: {
    currency: "$",
    updated: "September 2026",
    raised: 0,
    tips: 0,
    allocations: [
      { label: "Character & world art", amount: 0 },
      { label: "Servers & hosting",     amount: 0 },
      { label: "Development tools",      amount: 0 },
      { label: "Held for the next piece", amount: 0 }
    ]
  },

  supporters: {
    featured: [
      // { name: "Ada L.", note: "Founding Supporter", message: "Been waiting for an RPG like this." }
    ],
    community: [
      // { name: "Sam", message: "Take my money." },
      // { name: "Jordan", note: "Hot chocolate" }
    ]
  },

  // ── ART WISHLIST ──────────────────────────────────────────────────────────
  // The art the game wants made next.
  //
  // `kind` IS THE PRICE. Say what a piece IS - "character", "enemy", "prop" -
  // and the figure comes from the table at the top of this file. Use "quoted"
  // for anything bigger, and the card says it is priced with the artist
  // instead of showing a number.
  //
  // Set funded:true on a piece once it's covered and it shows as done.
  artGoals: [
    {
      name: "The portal",
      kind: "prop",
      why: "The mysterious gate the whole game hangs on — the doorway players step through, and the image the world is built around. Get this one piece right and Elusion has a face."
    },
    {
      name: "The first Deep crawler",
      kind: "enemy",
      why: "The opening monster of the underground: the new tier that hits harder and hunts in packs. One new creature to prove the descent is real."
    },
    {
      name: "A Deep raid boss",
      kind: "quoted",
      why: "The fight that ends a raid — bigger, more animation, its own telegraphed patterns. The centerpiece the group content is built around, and more work than a single creature, so it gets a real quote rather than a guess."
    },
    {
      name: "The underground, tiled",
      kind: "quoted",
      why: "Walls, floor, and hazards for the depths — the tileset that makes the Deep look like somewhere new instead of a recolor of the surface. A set rather than a piece, so the price comes from the artist."
    }
  ]
};
