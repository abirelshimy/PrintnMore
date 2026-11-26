/* Print n More — interactions (no dependencies) */
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  root.classList.add('js');

  /* ---------- Menu ---------- */
  const menu = document.querySelector('[data-menu]');
  const toggle = document.querySelector('[data-menu-toggle]');
  if (menu && toggle) {
    const label = toggle.querySelector('.sr-only');
    const behind = $$('main, footer');
    const setOpen = (open) => {
      root.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Close menu' : 'Open menu';
      menu.inert = !open;
      behind.forEach((el) => { el.inert = open; });
    };
    menu.inert = true;
    toggle.addEventListener('click', () => setOpen(!root.classList.contains('menu-open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) { setOpen(false); toggle.focus(); }
    });
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  }

  /* ---------- Split text into words (for the scroll fill) ---------- */
  const splitWords = (el) => {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(el);
    return $$('.w', el);
  };

  /* ---------- Fit giant type to the width ----------
     The footer wordmark fills the width. A giant section title (.mega) grows
     to fill it too but never past the .mega font-size in the CSS, so short
     words like "Work" stay the same size as the rest instead of filling the
     screen. */
  const fits = $$('[data-fit]');
  const fit = () => fits.forEach((el) => {
    const parent = el.parentElement;
    const cs = getComputedStyle(parent);
    const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;
    // Two passes: the second corrects any non-linear width (e.g. optical sizing).
    let size = 100;
    for (let pass = 0; pass < 2; pass += 1) {
      el.style.fontSize = `${size}px`;
      const w = el.getBoundingClientRect().width;
      if (!w) return;
      size *= (avail * 0.995) / w;
    }
    const cap = parent.classList.contains('mega') ? parseFloat(cs.fontSize) : 0;
    el.style.fontSize = `${cap ? Math.min(size, cap) : size}px`;
  });

  /* ---------- Seamless marquees ---------- */
  const marquees = $$('[data-marquee]');
  const buildMarquee = (m) => {
    const track = m.querySelector('.marquee-track');
    const group = track && track.querySelector('.marquee-group');
    if (!group) return;
    $$('[data-clone]', track).forEach((c) => c.remove());
    const gw = group.getBoundingClientRect().width;
    if (!gw) return;
    const copies = Math.ceil(m.clientWidth / gw) + 1;
    for (let i = 0; i < copies; i += 1) {
      const c = group.cloneNode(true);
      c.setAttribute('data-clone', '');
      c.setAttribute('aria-hidden', 'true');
      track.appendChild(c);
    }
    const speed = parseFloat(m.dataset.speed || '70'); // px per second
    track.style.setProperty('--shift', `${gw}px`);
    track.style.setProperty('--dur', `${(gw / speed).toFixed(2)}s`);
  };

  /* ---------- Scroll-driven effects ---------- */
  const hero = document.querySelector('[data-hero]');
  const floats = $$('[data-depth]').map((el) => ({ el, d: parseFloat(el.dataset.depth) }));
  const curves = $$('[data-curve]');
  const fills = $$('[data-fill]').map((el) => ({ el, words: splitWords(el), last: -1 }));
  const regs = $$('[data-register]');
  const cards = $$('.stack-card');
  const cols = $$('[data-parallax]').map((el) => ({ el, s: parseFloat(el.dataset.parallax), sec: el.closest('section') }));
  const bands = $$('[data-band]');
  let stickTops = [];
  let stackOn = false;

  const cacheStack = () => {
    stackOn = cards.length > 0 && getComputedStyle(cards[0]).position === 'sticky';
    stickTops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0);
  };

  let mx = 0; let my = 0; let tmx = 0; let tmy = 0;
  let ticking = false;
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  // Which hero style is showing (see the switcher below); the fold style
  // runs from fold.js.
  const floatsOn = () => hero && hero.dataset.heroVariant === 'floats';

  if (hero && finePointer && !reduce) {
    hero.addEventListener('pointermove', (e) => {
      if (!floatsOn()) return;
      tmx = e.clientX / window.innerWidth - 0.5;
      tmy = e.clientY / window.innerHeight - 0.5;
      request();
    });
  }

  function frame() {
    ticking = false;
    const H = window.innerHeight;
    const y = window.scrollY;

    root.classList.toggle('is-scrolled', y > 40);

    // Hero floats: parallax on scroll + a gentle drift toward the pointer
    if (floatsOn() && !reduce && y < H * 1.4) {
      mx += (tmx - mx) * 0.08;
      my += (tmy - my) * 0.08;
      floats.forEach((f) => {
        const tx = mx * f.d * 46;
        const ty = -y * f.d + my * f.d * 34;
        f.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      });
      if (Math.abs(tmx - mx) > 0.001 || Math.abs(tmy - my) > 0.001) request();
    }

    // Curved section tops flatten as they rise
    curves.forEach((c) => {
      const top = c.getBoundingClientRect().top;
      const p = clamp((H - top) / (H * 0.8), 0, 1);
      c.style.setProperty('--curve', (1 - p).toFixed(3));
    });

    // Word-by-word fill
    fills.forEach((f) => {
      const r = f.el.getBoundingClientRect();
      const p = reduce ? 1 : clamp((H * 0.85 - r.top) / (r.height + H * 0.3), 0, 1);
      const lit = p * (f.words.length + 1);
      if (Math.abs(lit - f.last) < 0.02) return;
      f.last = lit;
      f.words.forEach((w, i) => { w.style.opacity = clamp(lit - i, 0.16, 1).toFixed(2); });
    });

    // CMYK misregistration → in register
    regs.forEach((el) => {
      const r = el.getBoundingClientRect();
      const end = el.dataset.register === 'end';
      const p = reduce ? 1 : end
        ? clamp((H - r.top) / (r.height + 30), 0, 1)
        : clamp((H * 0.95 - r.top) / (H * 0.55), 0, 1);
      el.style.setProperty('--mis', (1 - p).toFixed(3));
    });

    // Sticky card stack: cards recede as the next one slides over
    if (stackOn) {
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        let cover = 0;
        if (next) {
          const nt = next.getBoundingClientRect().top;
          cover = clamp((H - nt) / (H - stickTops[i + 1]), 0, 1);
        }
        c.style.setProperty('--cover', cover.toFixed(3));
      });
    }

    // Column / band parallax (gentler on small screens)
    if (!reduce) {
      const k = window.innerWidth < 900 ? 0.35 : 1;
      cols.forEach((c) => {
        const r = (c.sec || c.el).getBoundingClientRect();
        if (r.bottom < -200 || r.top > H + 200) return;
        const p = (H - r.top) / (H + r.height);
        c.el.style.transform = `translate3d(0, ${((p - 0.5) * c.s * k * H).toFixed(1)}px, 0)`;
      });
      bands.forEach((b) => {
        const r = b.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > H) return;
        const p = (H - r.top) / (H + r.height);
        b.style.transform = `translate3d(0, ${((p - 0.5) * -14).toFixed(2)}%, 0)`;
      });
    }
  }

  window.addEventListener('scroll', request, { passive: true });

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Product slider ---------- */
  $$('[data-slider]').forEach((wrap) => {
    const track = wrap.querySelector('.slider');
    const prev = wrap.querySelector('[data-prev]');
    const next = wrap.querySelector('[data-next]');
    const bar = wrap.querySelector('.progress');
    if (!track) return;
    const step = () => {
      const item = track.firstElementChild;
      return item ? item.getBoundingClientRect().width + 16 : 300;
    };
    const go = (dir) => track.scrollBy({ left: dir * step() * 2, behavior: reduce ? 'auto' : 'smooth' });
    if (prev) prev.addEventListener('click', () => go(-1));
    if (next) next.addEventListener('click', () => go(1));
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 1;
      if (bar) bar.style.setProperty('--p', `${(10 + p * 90).toFixed(1)}%`);
      if (prev) prev.disabled = track.scrollLeft < 4;
      if (next) next.disabled = track.scrollLeft > max - 4;
    };
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* ---------- Magnetic pills ---------- */
  if (finePointer && !reduce) {
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${(x * 0.22).toFixed(1)}px, ${(y * 0.32).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Work filters ---------- */
  $$('[data-filters]').forEach((group) => {
    const buttons = $$('[data-filter]', group);
    const items = $$('[data-cat]');
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const f = b.dataset.filter;
      items.forEach((it) => { it.hidden = !(f === 'all' || it.dataset.cat.split(' ').includes(f)); });
    }));
  });

  /* ---------- Lightbox ---------- */
  const lb = document.querySelector('[data-lightbox]');
  if (lb && typeof lb.showModal === 'function') {
    const img = lb.querySelector('img');
    const cap = lb.querySelector('[data-lightbox-caption]');
    $$('[data-zoom]').forEach((t) => t.addEventListener('click', () => {
      const src = t.querySelector('img');
      img.src = src.currentSrc || src.src;
      img.alt = src.alt;
      cap.textContent = t.dataset.title || src.alt;
      lb.showModal();
    }));
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.closest('[data-close]')) lb.close();
    });
  }

  /* ---------- Quote form → pre-filled email ---------- */
  const form = document.querySelector('[data-quote-form]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const d = new FormData(form);
      const rows = [
        ['Name', d.get('name')], ['Company', d.get('company')], ['Email', d.get('email')],
        ['Phone', d.get('phone')], ['Service', d.get('service')], ['Quantity', d.get('quantity')],
        ['Needed by', d.get('date')],
      ];
      const body = `${rows.map(([k, v]) => `${k}: ${v || '-'}`).join('\n')}\n\nProject details:\n${d.get('details') || '-'}`;
      const subject = `Quote request: ${d.get('service') || 'General'}`;
      window.location.href = `mailto:hello@printnmore.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const note = form.querySelector('[data-form-note]');
      if (note) note.textContent = 'Your email app should open with everything filled in. Rather talk? Call (305) 232-7098.';
    });
  }

  /* ---------- Hero style switcher ----------
     Two looks for the home hero: the fold carousel and the original floating
     photos. The pick is kept in ?hero= and on this device, so it sticks while
     you click around. To ship just one, delete the .hero-switch element and
     set data-hero-variant on the hero. */
  const picks = $$('[data-hero-pick]');
  if (hero && picks.length) {
    const show = (v, save) => {
      if (!picks.some((b) => b.dataset.heroPick === v)) v = picks[0].dataset.heroPick;
      hero.dataset.heroVariant = v;
      picks.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.heroPick === v)));
      if (save) {
        try { localStorage.setItem('pnm-hero', v); } catch (e) { /* private mode */ }
        const url = new URL(window.location.href);
        url.searchParams.set('hero', v);
        window.history.replaceState(null, '', url);
      }
      document.dispatchEvent(new CustomEvent('hero:variant', { detail: v }));
      request();
    };
    picks.forEach((b) => b.addEventListener('click', () => show(b.dataset.heroPick, true)));
    show(hero.dataset.heroVariant, false);
  }

  /* ---------- Misc ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  const layout = () => {
    fit();
    marquees.forEach(buildMarquee);
    cacheStack();
    request();
  };
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });
  layout();
  window.addEventListener('load', layout);
  // The hero title is a different size in each hero style, so its marquee is
  // re-measured on a switch (or its loop would jump).
  document.addEventListener('hero:variant', () => marquees.forEach(buildMarquee));
  // Titles are sized from measured text, so re-measure once the web fonts arrive.
  if (document.fonts) {
    document.fonts.ready.then(layout);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', layout);
    Promise.all([
      document.fonts.load('400 100px "Bricolage Grotesque"'),
      document.fonts.load('600 100px "Bricolage Grotesque"'),
      document.fonts.load('italic 400 100px "Instrument Serif"'),
    ]).then(layout).catch(() => {});
  }
})();
