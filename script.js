// Elusion RPG — shared site script.
//
// The fire cursor is an 8-frame animated GIF, but a GIF used as a CSS `cursor:`
// is frozen on its first frame by every browser — that's why it never flickered.
// So instead we hide the system cursor and follow the mouse with a real <img>,
// which DOES play the animation. Starts unlit; click to light it (and it flickers).
//
// Fine-pointer devices only — touch screens keep their normal behavior.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;

  const UNLIT = 'images/unlitfirecursor.png';
  const LIT   = 'images/firecursor.gif';

  const cur = document.createElement('img');
  cur.id = 'fire-cursor';
  cur.src = UNLIT;
  cur.alt = '';
  cur.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cur);
  // hides the system cursor via CSS - on <html>, the whole page, and not just
  // <body>, which is one screen tall: below it the system arrow showed too.
  document.documentElement.classList.add('fire-cursor-on');

  let lit = false;

  document.addEventListener('mousemove', (e) => {
    cur.style.left = e.clientX + 'px';
    cur.style.top  = e.clientY + 'px';
    cur.style.opacity = '1';
  }, { passive: true });

  document.addEventListener('mouseleave', () => { cur.style.opacity = '0'; });

  // click anywhere to light the torch (or snuff it out again).
  document.addEventListener('click', () => {
    lit = !lit;
    cur.src = lit ? LIT : UNLIT;
  });
});


// The monster showcase on the home game screen. No-op on pages without it, so
// it's safe to keep in the shared script. Each .enemy-slide is one monster in
// the arena (its real attack as a GIF, its health bar, its shadow); we fade
// which one is shown and write its name, its line and "n/6" under the room.
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('enemy-slideshow');
  if (!box) return;

  const slides = Array.prototype.slice.call(box.querySelectorAll('.enemy-slide'));
  if (slides.length < 2) return;

  const title = document.getElementById('enemy-caption');
  const tag = document.getElementById('enemy-tag');
  const count = document.getElementById('enemy-count');
  const HOLD_MS = 2600;

  let idx = 0;
  let timer = null;

  function show(n) {
    slides[idx].classList.remove('active');
    slides[idx].setAttribute('aria-hidden', 'true');
    idx = (n + slides.length) % slides.length;
    slides[idx].classList.add('active');
    slides[idx].removeAttribute('aria-hidden');
    if (title) title.textContent = slides[idx].getAttribute('data-caption') || '';
    if (tag) tag.textContent = slides[idx].getAttribute('data-tag') || '';
    if (count) count.textContent = (idx + 1) + '/' + slides.length;
  }

  // NO AUTOPLAY FOR A VISITOR WHO ASKED FOR LESS MOTION: the arrows still
  // step through, but nothing changes on its own.
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start() { stop(); if (!still) timer = setInterval(() => show(idx + 1), HOLD_MS); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  // The arrows. Each also restarts the timer so it doesn't jump a moment
  // after you click.
  const prev = document.getElementById('enemy-prev');
  const next = document.getElementById('enemy-next');
  if (prev) prev.addEventListener('click', () => { show(idx - 1); start(); });
  if (next) next.addEventListener('click', () => { show(idx + 1); start(); });

  // Hold still while the cursor is on the room, or while the arrows have the
  // keyboard, so a viewer can linger on one monster.
  const screen = box.closest('.game-screen') || box;
  screen.addEventListener('mouseenter', stop);
  screen.addEventListener('mouseleave', start);
  screen.addEventListener('focusin', stop);
  screen.addEventListener('focusout', start);

  start();
});
