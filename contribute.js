// contribute.js — draws the Support page's price list and its ledger from
// contribute-data.js. Everything shown here is content YOU control in that
// file.

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

  // ---- what art costs ------------------------------------------------------
  function renderPrices() {
    var mount = document.getElementById("art-prices");
    if (!mount || !Array.isArray(data.prices)) return;
    mount.innerHTML = "";
    data.prices.forEach(function (p) {
      var li = el("li");
      li.appendChild(el("span", "k", p.kind || ""));
      li.appendChild(el("span", "n", p.price || ""));
      mount.appendChild(li);
    });
  }

  // ---- ledger --------------------------------------------------------------
  function renderLedger() {
    var mount = document.getElementById("ledger");
    if (!mount || !data.ledger) return;
    var L = data.ledger;
    var allocs = L.allocations || [];
    var tips = Number(L.tips) || 0;
    // TIPS COUNT TOWARD "IS THERE ANYTHING TO SHOW", even though they are not
    // art money. Someone who bought a hot cocoa has contributed, and a ledger
    // that answered "nothing yet" to them would be the page's one promise
    // breaking on its first user.
    var total = (Number(L.raised) || 0) + tips +
      allocs.reduce(function (s, a) { return s + (Number(a.amount) || 0); }, 0);

    mount.innerHTML = "";

    if (total === 0) {
      mount.appendChild(el("p", "ledger-empty",
        "The ledger opens with the first contribution — real numbers, updated as they come in."));
      return;
    }

    var raised = el("div", "ledger-raised");
    raised.appendChild(el("span", "l", "Given for art"));
    raised.appendChild(el("span", "n", money(L.currency, L.raised)));
    mount.appendChild(raised);

    allocs.forEach(function (a) {
      var row = el("div", "ledger-row");
      row.appendChild(el("span", "l", a.label || ""));
      row.appendChild(el("span", "n", money(L.currency, a.amount)));
      mount.appendChild(row);
    });

    // THE HOT COCOA, ON ITS OWN LINE AND LABELLED AS PERSONAL. Leaving it out
    // would make the total quietly disagree with what actually came in, which
    // is the exact thing a ledger exists to prevent.
    if (tips > 0) {
      var tipRow = el("div", "ledger-row ledger-personal");
      tipRow.appendChild(el("span", "l", "Hot cocoa — personal, not for art"));
      tipRow.appendChild(el("span", "n", money(L.currency, tips)));
      mount.appendChild(tipRow);
    }

    if (L.updated) mount.appendChild(el("p", "ledger-updated", "Last updated " + L.updated));
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderPrices();
    renderLedger();
  });
})();
