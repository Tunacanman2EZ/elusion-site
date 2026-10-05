// contribute.js — renders the transparency ledger and the supporters wall from
// contribute-data.js, and wires the "get on the wall" form to Netlify Forms.
//
// Everything shown here is content YOU control in contribute-data.js. The form
// only collects a request; you verify and add real supporters yourself. Nothing
// posts to the wall automatically.

(function () {
  "use strict";

  var data = window.CONTRIBUTE || {};

  // ---- helpers -------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function money(cur, amt) {
    var n = Number(amt) || 0;
    return (cur || "$") + n.toLocaleString();
  }

  // What a wishlist piece costs, read off the price table rather than written
  // on the piece. A character is $200 in exactly one place in this project,
  // and this is how it stays that way.
  //
  // ANYTHING NOT IN THE TABLE IS "QUOTED", not zero and not a guess. A page
  // asking people for money cannot afford a figure nobody can stand behind,
  // and a raid boss is genuinely more work than one creature.
  function priceFor(goal) {
    var P = data.prices || {};
    var amount = P[goal && goal.kind];
    if (typeof amount !== "number") return null;
    return money(P.currency, amount);
  }

  // ---- ledger --------------------------------------------------------------
  function renderLedger() {
    var mount = document.getElementById("ledger");
    if (!mount || !data.ledger) return;
    var L = data.ledger;
    var allocs = L.allocations || [];
    var tips = Number(L.tips) || 0;
    // TIPS COUNT TOWARD "IS THERE ANYTHING TO SHOW", even though they are not
    // game money. Someone who bought a hot chocolate has contributed, and a
    // ledger that answered "nothing yet" to them would be the page's one
    // promise breaking on its first user.
    var total = (Number(L.raised) || 0) + tips +
      allocs.reduce(function (s, a) { return s + (Number(a.amount) || 0); }, 0);

    mount.innerHTML = "";

    if (total === 0) {
      mount.appendChild(el("p", "ledger-empty",
        "The ledger opens with the first contribution — real numbers, updated as they come in."));
      return;
    }

    var raised = el("div", "ledger-raised");
    raised.appendChild(el("span", "l", "Into the game fund"));
    raised.appendChild(el("span", "n", money(L.currency, L.raised)));
    mount.appendChild(raised);

    allocs.forEach(function (a) {
      var row = el("div", "ledger-row");
      row.appendChild(el("span", "l", a.label || ""));
      row.appendChild(el("span", "n", money(L.currency, a.amount)));
      mount.appendChild(row);
    });

    // THE HOT CHOCOLATE, ON ITS OWN LINE AND LABELLED AS PERSONAL.
    //
    // It is not game money and the page has always said so. Leaving it OUT of
    // the ledger entirely was the other option, and it is the worse one: the
    // total would then quietly disagree with what actually came in, which is
    // the exact thing a transparency page exists to prevent. Shown, separated,
    // and named for what it is.
    if (tips > 0) {
      var tipRow = el("div", "ledger-row ledger-personal");
      tipRow.appendChild(el("span", "l", "Hot chocolate — personal, not the game fund"));
      tipRow.appendChild(el("span", "n", money(L.currency, tips)));
      mount.appendChild(tipRow);
    }

    if (L.updated) mount.appendChild(el("p", "ledger-updated", "Last updated " + L.updated));
  }

  // ---- supporters wall -----------------------------------------------------
  function supporterCard(s, featured) {
    var card = el("div", "supporter-card" + (featured ? " featured" : ""));
    var name = el("div", "supporter-name");
    name.appendChild(document.createTextNode(s.name || "Anonymous"));
    if (s.note) name.appendChild(el("span", "supporter-badge", s.note));
    card.appendChild(name);
    if (s.message) card.appendChild(el("p", "supporter-msg", s.message));
    return card;
  }

  function renderSupporters() {
    var feat = document.getElementById("supporter-featured");
    var grid = document.getElementById("supporter-grid");
    var empty = document.getElementById("supporters-empty");
    if (!feat || !grid) return;

    var S = data.supporters || {};
    var f = S.featured || [];
    var c = S.community || [];

    feat.innerHTML = "";
    grid.innerHTML = "";
    f.forEach(function (s) { feat.appendChild(supporterCard(s, true)); });
    c.forEach(function (s) { grid.appendChild(supporterCard(s, false)); });

    if (empty) empty.style.display = (f.length + c.length) === 0 ? "block" : "none";
  }

  // ---- art wishlist --------------------------------------------------------
  function renderArtGoals() {
    var mount = document.getElementById("art-goals");
    if (!mount || !Array.isArray(data.artGoals)) return;
    mount.innerHTML = "";
    data.artGoals.forEach(function (g) {
      var card = el("div", "art-goal" + (g.funded ? " funded" : ""));
      var head = el("div", "art-goal-head");
      head.appendChild(el("span", "art-goal-name", g.name || ""));

      var priced = priceFor(g);
      var badge;
      if (g.funded) {
        badge = el("span", "art-goal-funded-badge", "Funded");
      } else if (priced) {
        badge = el("span", "art-goal-price", priced);
      } else {
        // SHORT, because .art-goal-price is white-space: nowrap and sits
        // beside the name. The full sentence goes on the hover rather than
        // pushing the title out of its own card.
        badge = el("span", "art-goal-price art-goal-quoted", "Quoted");
        badge.title = "Priced with the artist — more work than a single piece";
      }
      head.appendChild(badge);
      card.appendChild(head);
      card.appendChild(el("p", "art-goal-why", g.why || ""));
      if (!g.funded) {
        var a = el("a", "art-goal-cta", "Sponsor this piece →");
        a.href = "https://paypal.me/ElusionStudios";
        a.target = "_blank"; a.rel = "noopener";
        card.appendChild(a);
      }
      mount.appendChild(card);
    });
  }

  // ---- "get on the wall" form (Netlify) ------------------------------------
  function wireForm() {
    var form = document.getElementById("supporter-form");
    if (!form) return;
    var success = document.getElementById("supporter-success");
    var formError = document.getElementById("supporter-formerror");
    var btn = form.querySelector(".apply-submit");
    var agreeWrap = document.getElementById("supporter-agree");

    function markField(input, bad) {
      var f = input.closest(".apply-field");
      if (f) f.classList.toggle("invalid", bad);
    }

    function validate() {
      var ok = true;
      ["s-name", "s-where"].forEach(function (id) {
        var f = form.querySelector("#" + id);
        var bad = !f.value.trim();
        markField(f, bad);
        if (bad) ok = false;
      });

      var agree = form.querySelector("#s-agree");
      var agreeBad = !agree.checked;
      if (agreeWrap) agreeWrap.classList.toggle("invalid", agreeBad);
      if (agreeBad) ok = false;
      return ok;
    }

    form.addEventListener("input", function (e) {
      if (e.target.closest(".apply-field")) markField(e.target, false);
      if (formError) formError.textContent = "";
    });
    form.addEventListener("change", function (e) {
      if (e.target.id === "s-agree" && e.target.checked && agreeWrap) agreeWrap.classList.remove("invalid");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (formError) formError.textContent = "";
      if (!validate()) {
        var firstBad = form.querySelector(".apply-field.invalid, .apply-agree.invalid");
        if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      btn.disabled = true;
      btn.textContent = "Sending…";
      var body = new URLSearchParams(new FormData(form)).toString();
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      }).then(function (res) {
        if (!res.ok) throw new Error("status " + res.status);
        form.style.display = "none";
        if (success) { success.classList.add("show"); success.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Send it";
        if (formError) formError.textContent =
          "That didn't send. If it keeps happening, email ElusionStudios@gmail.com.";
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderLedger();
    renderArtGoals();
    renderSupporters();
    wireForm();
  });
})();
