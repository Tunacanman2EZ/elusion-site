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


// Enemy slideshow on the home game-screen. No-op on pages without it, so it's
// safe to keep in the shared script. Each .enemy-frame is a GIF of that enemy's
// real attack; we just crossfade which one is on top and update the caption.
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('enemy-slideshow');
  if (!box) return;

  const frames = Array.prototype.slice.call(box.querySelectorAll('.enemy-frame'));
  if (frames.length < 2) return;

  const caption = document.getElementById('enemy-caption');
  const dotsWrap = document.getElementById('enemy-dots');
  const HOLD_MS = 2600;

  const dots = frames.map((_, i) => {
    const d = document.createElement('span');
    d.className = 'enemy-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => { show(i); start(); });
    if (dotsWrap) dotsWrap.appendChild(d);
    return d;
  });

  let idx = 0;
  let timer = null;

  function show(n) {
    frames[idx].classList.remove('active');
    if (dots[idx]) dots[idx].classList.remove('active');
    idx = (n + frames.length) % frames.length;
    frames[idx].classList.add('active');
    if (dots[idx]) dots[idx].classList.add('active');
    if (caption) caption.textContent = frames[idx].getAttribute('data-caption') || '';
  }

  function start() { stop(); timer = setInterval(() => show(idx + 1), HOLD_MS); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  // Manual prev / next arrows. Each also restarts the timer so it doesn't jump
  // a moment after you click.
  const prev = document.getElementById('enemy-prev');
  const next = document.getElementById('enemy-next');
  if (prev) prev.addEventListener('click', () => { show(idx - 1); start(); });
  if (next) next.addEventListener('click', () => { show(idx + 1); start(); });

  // Pause while the cursor is on the box, so a viewer can linger on one enemy.
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', start);

  start();
});
