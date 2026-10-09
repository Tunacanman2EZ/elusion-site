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
// it's safe to keep in the shared script. Each .enemy-slide is one creature's
// death, recorded from the game: a strip of frames (its .enemy-anim) and a
// data-timeline saying which frame shows for how long, in thirtieths of a
// second. A slide plays from the start every time it is shown - standing,
// struck, struck down, its death, gone - and the show moves on when it has
// played through. While the cursor or the keyboard is on the room it plays
// the same one over. Under the room: its name, its line and "n/6".
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('enemy-slideshow');
  if (!box) return;

  const slides = Array.prototype.slice.call(box.querySelectorAll('.enemy-slide'));
  if (slides.length < 2) return;

  const title = document.getElementById('enemy-caption');
  const tag = document.getElementById('enemy-tag');
  const count = document.getElementById('enemy-count');
  const TICK_MS = 1000 / 30;

  // "frame:ticks,frame:ticks,..." -> [[frame, ticks], ...]
  const plays = slides.map((slide) => {
    const steps = (slide.getAttribute('data-timeline') || '').split(',')
      .map((pair) => pair.split(':').map(Number))
      .filter((p) => p.length === 2 && p[0] >= 0 && p[1] > 0);
    const gone = Number(slide.getAttribute('data-gone'));
    return {
      anim: slide.querySelector('.enemy-anim'),
      steps: steps,
      ticks: steps.reduce((sum, p) => sum + p[1], 0),
      gone: isFinite(gone) ? gone : -1,
    };
  });

  function draw(n, tick) {
    const play = plays[n];
    let left = tick;
    let frame = play.steps.length ? play.steps[0][0] : 0;
    for (let i = 0; i < play.steps.length; i++) {
      frame = play.steps[i][0];
      if (left < play.steps[i][1]) break;
      left -= play.steps[i][1];
    }
    if (play.anim) play.anim.style.setProperty('--f', frame);
    slides[n].classList.toggle('gone', play.gone >= 0 && tick >= play.gone);
  }

  let idx = 0;
  let held = false;
  let started = 0;
  let last = 0;
  let raf = 0;

  // NO MOTION FOR A VISITOR WHO ASKED FOR LESS: each creature stands still on
  // its first frame, alive, and the arrows still step through.
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(n) {
    // The one leaving goes to its last frame, the empty room, rather than
    // fading out frozen halfway through its death when an arrow is clicked.
    draw(idx, Math.max(plays[idx].ticks - 1, 0));
    slides[idx].classList.remove('active');
    slides[idx].setAttribute('aria-hidden', 'true');
    idx = (n + slides.length) % slides.length;
    draw(idx, 0);
    slides[idx].classList.add('active');
    slides[idx].removeAttribute('aria-hidden');
    if (title) title.textContent = slides[idx].getAttribute('data-caption') || '';
    if (tag) tag.textContent = slides[idx].getAttribute('data-tag') || '';
    if (count) count.textContent = (idx + 1) + '/' + slides.length;
    started = last = performance.now();
  }

  function frame(now) {
    // A tab in the background gets no frames; coming back, carry on from
    // where it was rather than counting the time away as played.
    if (now - last > 250) started += now - last;
    last = now;
    let tick = Math.floor((now - started) / TICK_MS);
    if (tick >= plays[idx].ticks) {
      if (held) {
        started = now;
        tick = 0;
      } else {
        show(idx + 1);
        tick = 0;
      }
    }
    draw(idx, tick);
    raf = requestAnimationFrame(frame);
  }

  // The arrows. Each starts the creature it lands on from the beginning.
  const prev = document.getElementById('enemy-prev');
  const next = document.getElementById('enemy-next');
  if (prev) prev.addEventListener('click', () => show(idx - 1));
  if (next) next.addEventListener('click', () => show(idx + 1));

  // Stay on this one while the cursor is on the room, or while the arrows
  // have the keyboard, so a viewer can watch it again.
  const screen = box.closest('.game-screen') || box;
  screen.addEventListener('mouseenter', () => { held = true; });
  screen.addEventListener('mouseleave', () => { held = false; });
  screen.addEventListener('focusin', () => { held = true; });
  screen.addEventListener('focusout', () => { held = false; });

  show(0);
  if (!still) raf = requestAnimationFrame(frame);
});
