// join.js — Team application.
//
// The form posts to Netlify Forms (see data-netlify in join.html). Netlify
// captures every submission in your dashboard under the "team-application"
// form, and can email you each one (Forms -> Notifications). This file just
// adds the polish on top: inline validation so nothing silently fails, an
// AJAX submit so the page doesn't bounce to Netlify's plain success screen,
// and an on-page confirmation.
//
// NOTE: submission only works on the deployed Netlify site. Opening this file
// straight off disk will show the form but the POST has nowhere to go.

(function () {
  "use strict";

  var form = document.querySelector("#apply-form");
  if (!form) return;

  var success = document.querySelector("#apply-success");
  var formError = document.querySelector("#apply-formerror");
  var submitBtn = form.querySelector(".apply-submit");
  var agreeWrap = document.querySelector("#apply-agree");

  var REQUIRED = ["name", "email", "role", "ambition", "goals"];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function fieldOf(el) { return el.closest(".apply-field"); }

  function markField(el, bad) {
    var f = fieldOf(el);
    if (f) f.classList.toggle("invalid", bad);
  }

  function validate() {
    var ok = true;
    var i, el, bad;

    for (i = 0; i < REQUIRED.length; i++) {
      el = form.querySelector("#" + REQUIRED[i]);
      bad = !el.value.trim();
      if (REQUIRED[i] === "email" && el.value.trim()) {
        bad = !EMAIL_RE.test(el.value.trim());
      }
      markField(el, bad);
      if (bad) ok = false;
    }

    var agree = form.querySelector("#agree");
    var agreeBad = !agree.checked;
    if (agreeWrap) agreeWrap.classList.toggle("invalid", agreeBad);
    if (agreeBad) ok = false;

    return ok;
  }

  // Clear a field's error the moment the person starts fixing it.
  form.addEventListener("input", function (e) {
    if (e.target.closest(".apply-field")) markField(e.target, false);
    if (formError) formError.textContent = "";
  });
  form.addEventListener("change", function (e) {
    if (e.target.id === "agree" && e.target.checked && agreeWrap) {
      agreeWrap.classList.remove("invalid");
    }
    if (e.target.closest(".apply-field")) markField(e.target, false);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (formError) formError.textContent = "";

    if (!validate()) {
      var firstBad = form.querySelector(".apply-field.invalid, .apply-agree.invalid");
      if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    var body = new URLSearchParams(new FormData(form)).toString();

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    })
      .then(function (res) {
        if (!res.ok) throw new Error("status " + res.status);
        form.style.display = "none";
        if (success) {
          success.classList.add("show");
          success.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send application";
        if (formError) {
          formError.textContent =
            "That didn't send. If it keeps happening, email ElusionStudios@gmail.com and I'll sort it out.";
        }
      });
  });
})();
