# Deploying the Elusion RPG website

**The drag-and-drop deploy is retired.** This folder is now a git repository that
Netlify builds, and the reason is not preference — it is that a drag-and-drop
deploy runs no build command at all. Netlify's own documentation is blunt about
it: *"When you create a deploy manually without continuous deployment, Netlify
does not run a build command."* No build command means `@netlify/blobs` is never
installed and the visitor counter's function is never bundled, so the counter
simply could not exist on the old workflow.

What you get in exchange is worth more than the counter: a deploy history, a
rollback button, and a record of exactly what shipped and when. A drag has none
of those.

---

## One-time setup

### 1. Make it a repository and push it

From `Desktop\site`:

```powershell
git init
git add .
git commit -m "The website, as deployed, plus the visitor counter"
git branch -M main
git remote add origin https://github.com/<you>/elusion-site.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `dist/` and `.netlify/`.

**Check `git status` before that first commit.** Anything you would not want on
a public repo should not be in this folder. There is nothing secret in it today —
no keys, no `.env` — and it is worth keeping that true. A private repo is fine
too; Netlify builds either.

### 2. Point Netlify at it

In the Netlify dashboard: **Add new site → Import an existing project**, pick the
repo, and **accept the defaults**. You do not need to type a build command or a
publish directory — `netlify.toml` already declares both, and what is written in
the file wins over what is typed in the UI.

The first build takes a minute or two rather than the few seconds a drag took.
It is installing one dependency and bundling one function.

### 3. Set the salt

**Site configuration → Environment variables → Add a variable**

| key | value |
|---|---|
| `VISIT_SALT` | any long random string — 32+ characters, made up on the spot |

This is the one step that is easy to skip and worth not skipping. The counter
identifies a repeat visitor by hashing their address together with the day and
this salt, and it never stores the address itself. Without a salt, IPv4 is only
four billion possibilities, which is a weekend of brute force against a stored
hash. With one, a fingerprint is not reversible by anybody who does not already
have the salt — including anybody who somehow reaches the store.

It falls back to Netlify's own site ID if you leave it unset, which is not
public, so this is a "make it properly good" step rather than a "it is broken
without it" step.

### 4. Look at the footer

Load the site. The bottom of every page should read something like **`1 visit`**.

If there is no line there at all, that is the counter telling you it could not
get a number — it stays hidden rather than printing a zero. Open the browser
console; the request to `/.netlify/functions/hit` will say why.

---

## Deploying after that

```powershell
git add .
git commit -m "what changed"
git push
```

Netlify builds and publishes on the push. That is the whole workflow.

---

## Running the tests

```powershell
npm install
node test_counter.mjs     # 73 checks — the function, the build, the policy
```

`test_counter.mjs` needs nothing but the project's own dependency. It runs the
real function against the same local blob server `netlify dev` uses.

```powershell
npm i --no-save playwright
npx playwright install chromium
node test_e2e.mjs         # 20 checks — the built site in a real browser
```

`test_e2e.mjs` serves `dist/` **with the Content-Security-Policy read out of
`netlify.toml`** and drives it in Chromium, which is the only way to prove the
claim the counter's design rests on: that the policy permits the fetch. It also
writes `shot_footer.png` and `shot_footer_mobile.png` so you can see what it
looks like without deploying.

Playwright is deliberately **not** a dependency in `package.json`. Netlify
installs devDependencies on every build and a browser driver download per deploy
is a cost the visitor counter has no business imposing.

---

## What the counter actually counts

**One visitor per day.** Somebody who reads four pages this afternoon is one.
Somebody who comes back tomorrow is two — which is why the footer says *visits*
and not *visitors*. Claiming visitors would overstate how many different people
have been here.

**People, not crawlers.** Nothing is counted unless a browser ran `visits.js`,
so anything that does not execute JavaScript never arrives at all. That is most
of the web's automated traffic filtered for free, and it is why the list of
blocked agents in `hit.mjs` is short rather than an arms race.

**A floor, not a census.** Somebody running a script blocker, or with JavaScript
off, is not counted. The number is honest about which direction it is wrong in:
real traffic is higher than the footer says, never lower.

**Days are UTC.** Every timestamp the *game* shows a player is local time, on
purpose. These are not shown to anybody — they are bucket boundaries — so they
use the zone with no daylight-saving edge cases.

### What it stores

One tiny object per visitor per day, at a key that is a truncated SHA-256 of
`address + browser + date + salt`. The address is never written anywhere. The
date is inside the hash, so the same person tomorrow produces an unrelated key
and there is nothing anybody can follow across days.

No cookies. Nothing in `localStorage`. One `sessionStorage` flag that only
prevents a redundant request within the same tab.

### The one operational risk

The free plan has a **hard 300-credit monthly cap that pauses the site** when it
is reached. The counter is designed to be cheap — a returning visitor costs no
write at all, and a second page view in the same tab is a read — but a public
endpoint is a public endpoint. Netlify's usage page shows where you are. If the
site ever pauses, that is where to look first.
