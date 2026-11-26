/* Print n More — hero fold carousel.
 *
 * Adapted from the "Fold Carousel" export (HorizonX). A looping row of cards:
 * the centre card lies flat and its neighbours fold away from it like doors,
 * each swinging about its inner edge and settling, set back, as a flat card
 * beside it; the sides of the stage pick up a thin spectral fringe. A
 * critically damped spring does the settling.
 *
 * Site changes: the side cards rest flat instead of curling toward the lens
 * and smearing into streaks, and show their picture the right way round from
 * behind; the cards are the photos in .hero-fold (their words come from
 * data-title / data-subtitle / data-tag / data-caption), painted in the site's
 * font; it sits behind the hero title on a transparent stage; it steps on by
 * itself every few seconds; a sideways drag or trackpad swipe anywhere on the
 * hero moves it, while the vertical wheel and vertical swipes stay with the
 * page; and three.js is only fetched the first time this hero style is shown.
 *
 * Units: the centre card is 1 wide and CARD_H tall, world x to the right, z
 * toward the camera, and the camera sits at (0, 0, CAMERA_Z).
 */
(() => {
  const root = document.querySelector('[data-fold]');
  const hero = root && root.closest('[data-hero]');
  if (!root || !hero) return;
  /** Drags and sideways swipes are taken anywhere on the hero, title included. */
  const stage = root.closest('[data-fold-stage]') || root;
  /** Where the centre card goes: sized and placed by the stylesheet. */
  const slotEl = root.querySelector('.fold-slot');

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js';

  const CONFIG = {
    autoplay: 3.2, // seconds between steps; 0 = only moves when dragged
    settle: 10.5,  // spring stiffness: higher settles faster
    fringe: 0.35,  // thin rainbow edge on the side cards (the original was 1)
    haze: 0,       // coloured ghost spilling around the side cards (the original was 1)
  };

  const CARDS = Array.from(root.querySelectorAll('img')).map((img) => ({
    img,
    title: img.dataset.title || '',
    subtitle: img.dataset.subtitle || '',
    tag: img.dataset.tag || '',
    caption: img.dataset.caption || '',
  }));
  if (!CARDS.length) return;

  const CARD_H = 1.25001;
  const CAMERA_Z = 3.2;
  const SEGMENTS = 32;
  const TEX_W = 1024;
  const TEX_H = 1280;
  // A card further than this many slots from the centre is off stage, even
  // on an ultra-wide screen.
  const VISIBLE_SPAN = 2.5;

  // -------------------------------------------------------------------------
  // Geometry
  //
  // Every card is described by its signed slot offset s (0 = centre, <0 = left).
  // Left side: the card swings about its own LEFT edge (the hinge) like a door
  // opening toward the viewer, 0 -> 180 deg as |s| goes 0 -> 1, while the hinge
  // recedes to REST. At |s| = 1 it lies flat beside the centre card, set back;
  // past |s| = 1 it slides straight out to the side. The right side is the
  // exact mirror (hinge = the card's own RIGHT edge). A card seen from behind is
  // painted the right way round (CARD_FRAGMENT), so the side cards read normally.
  // -------------------------------------------------------------------------

  /** Where the hinge comes to rest, (x, z) in centre-card widths. */
  const REST = [-1.13, -1.67];

  // Swing keyframes over t = |s| in [0, 1]: the leaving card is at ~55 deg
  // while the entering one is still folded flat, and both pass edge-on
  // slightly after the midpoint.
  const KEY_T = [0, 0.3, 0.499999, 0.699999, 1];
  const KEY_ANGLE = [0, 0.299999, 0.515001, 0.920001, 1]; // fraction of 180 deg
  const KEY_HX = [-0.500001, -0.769999, -0.799999, -0.829999, REST[0]];
  const KEY_HZ = [0, -0.450001, -0.869999, -1.09999, REST[1]];

  // Monotone cubic (Fritsch-Carlson) interpolation through the keyframes, so
  // a keyframe never overshoots into a fold the design does not show.
  function monotone(xs, ys) {
    const n = xs.length;
    const d = [];
    const m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i];
      const t = (x - xs[i]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
        + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  const angleAt = monotone(KEY_T, KEY_ANGLE);
  const hingeX = monotone(KEY_T, KEY_HX);
  const hingeZ = monotone(KEY_T, KEY_HZ);

  // Left-side card with t = |s| >= 0. u in [0, 1] from the hinge edge.
  // Writes (x, z) into out.
  function leftPoint(t, u, out) {
    if (t >= 1) {
      // Slide straight out to the side, picking up speed.
      out[0] = REST[0] - u - 4 * Math.pow(t - 1, 1.3);
      out[1] = REST[1];
      return out;
    }
    const theta = Math.PI * angleAt(t);
    out[0] = hingeX(t) + u * Math.cos(theta);
    out[1] = hingeZ(t) + u * Math.sin(theta);
    return out;
  }

  // Any card: s = signed slot offset, u in [0, 1] = card-local x (0 = own left
  // edge). Returns [x, z].
  function cardPoint(s, u, out) {
    if (s <= 0) return leftPoint(-s, u, out);
    leftPoint(s, 1 - u, out);
    out[0] = -out[0];
    return out;
  }

  // -------------------------------------------------------------------------
  // Motion and layout
  // -------------------------------------------------------------------------

  const wrapIndex = (x, n) => ((x % n) + n) % n;

  // Signed distance of card i from the strip position, the short way round.
  function offsetOf(i, pos, n) {
    let s = wrapIndex(i - pos, n);
    if (s >= n / 2) s -= n;
    return s;
  }

  // Exact solution of a critically damped spring over dt, so it is stable at
  // any frame rate. Returns [pos, vel].
  function springStep(pos, vel, target, dt, omega) {
    const x = pos - target;
    const e = Math.exp(-omega * dt);
    const c = vel + omega * x;
    let p = target + (x + c * dt) * e;
    let v = (vel - omega * c * dt) * e;
    if (Math.abs(p - target) < 1e-4 && Math.abs(v) < 1e-3) {
      p = target;
      v = 0;
    }
    return [p, v];
  }

  // A released drag lands on the nearest card, nudged at most 0.6 of a slot in
  // the direction of the fling so a flick always goes somewhere.
  function flingTarget(pos, velocity) {
    return Math.round(pos + Math.max(-0.599999, Math.min(0.6, velocity * 0.120001)));
  }

  // A swipe that ends between cards snaps to one; any deliberate swipe moves
  // at least one card.
  function settleWheel(from, target) {
    const moved = target - from;
    if (Math.abs(moved) < 0.0799999) return from;
    return from + Math.sign(moved) * Math.max(1, Math.round(Math.abs(moved)));
  }

  // Stage framing. The centre card fills `box`, the .fold-slot that the
  // stylesheet sizes and places (so the title can sit right under it); without
  // one it is 35.7 % of the stage width or 49.4 % of its height, whichever
  // binds, just above the middle. The camera's field of view is solved so the
  // centre card is exactly cardPx wide on screen.
  function layoutFor(width, height, box) {
    const W = Math.max(1, width);
    const H = Math.max(1, height);
    const cardPx = box ? box.width : Math.min(W * (W / H < 0.900001 ? 0.5 : 0.357), H * 0.494001);
    const centreY = box ? box.centreY : H / 2 - cardPx * 0.0440001;
    const stageW = cardPx / 0.357001;
    return {
      cardPx,
      slotPx: cardPx * 1.25,
      fov: (2 * Math.atan(H / 2 / cardPx / CAMERA_Z) * 180) / Math.PI,
      // Shifts the view so the card's centre lands at centreY.
      offsetY: H / 2 - centreY,
      // Screen x relative to the reference stage, so the fringe follows the
      // geometry at any aspect ratio.
      edgeScale: W / stageW,
      fringe: 0.0220001 * stageW,
      haze: 0.0800001 * stageW,
    };
  }

  // -------------------------------------------------------------------------
  // Card faces
  // -------------------------------------------------------------------------

  const SANS = '"Bricolage Grotesque",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  const font = (px, weight) => `${weight} ${px}px ${SANS}`;

  function fitText(ctx, text, maxWidth) {
    const value = String(text || '');
    if (!value || ctx.measureText(value).width <= maxWidth) return value;
    let lo = 0;
    let hi = value.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(`${value.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return `${value.slice(0, lo).trimEnd()}…`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCardFace(ctx, card, image) {
    const W = TEX_W;
    const H = TEX_H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(0, 0, W, H);
    const iw = image ? image.naturalWidth : 0;
    const ih = image ? image.naturalHeight : 0;
    if (iw > 0 && ih > 0) {
      const scale = Math.max(W / iw, H / ih);
      const w = iw * scale;
      const h = ih * scale;
      ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
    }

    // Soft scrims so the white type stays legible on bright pictures.
    if (card.title || card.subtitle || card.tag) {
      const g = ctx.createLinearGradient(0, 0, 0, 360);
      g.addColorStop(0, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 360);
    }
    if (card.caption) {
      const g = ctx.createLinearGradient(0, H - 300, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 300, W, 300);
    }

    ctx.textBaseline = 'alphabetic';
    let pillWidth = 0;
    if (card.tag) {
      ctx.font = font(34, 500);
      const label = fitText(ctx, card.tag, 360);
      pillWidth = ctx.measureText(label).width + 56;
      const ph = 60;
      const px = W - 72 - pillWidth;
      const py = 112;
      roundRect(ctx, px, py, pillWidth, ph, ph / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(label, px + 28, py + 42);
    }

    const titleWidth = W - 140 - (pillWidth ? pillWidth + 24 : 0);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = font(42, 500);
    ctx.fillText(fitText(ctx, card.title, titleWidth), 70, 150);
    ctx.font = font(42, 400);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(fitText(ctx, card.subtitle, titleWidth), 70, 205);

    ctx.font = font(42, 400);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(fitText(ctx, card.caption, W - 140), 70, 1186);
  }

  function imageReady(img) {
    if (img.complete) return Promise.resolve(img.naturalWidth ? img : null);
    return new Promise((resolve) => {
      img.addEventListener('load', () => resolve(img), { once: true });
      img.addEventListener('error', () => resolve(null), { once: true });
    });
  }

  function fontsReady() {
    const fonts = document.fonts;
    if (!fonts || !fonts.load) return Promise.resolve();
    const loads = Promise.all([fonts.load(font(42, 500)), fonts.load(font(42, 400)), fonts.load(font(34, 500))]).catch(() => {});
    // A font that never arrives must not hold the cards back.
    return Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 1500))]);
  }

  // -------------------------------------------------------------------------
  // Shaders
  // -------------------------------------------------------------------------

  const CARD_VERTEX = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.99999);
    }
  `;

  const CARD_FRAGMENT = /* glsl */`
    uniform sampler2D map;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      vec2 size = vec2(1.0, ${CARD_H.toFixed(3)});
      vec2 p = vUv * size - size * 0.5;
      vec2 q = abs(p) - size * 0.5 + radius;
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
      float aa = max(fwidth(d), 1e-5);
      float alpha = clamp(0.5 - d / aa, 0.0, 1.0);
      if (alpha <= 0.0) discard;

      // A card seen from behind shows its picture the right way round, like
      // a card printed on both sides, so the resting side cards never read
      // mirrored.
      vec2 st = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
      gl_FragColor = vec4(texture2D(map, st).rgb, alpha);
    }
  `;

  const POST_VERTEX = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = position.xy * 0.5 + 0.500001;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // Transparent stage only: the cards are drawn over a zero-alpha clear, so
  // the target holds premultiplied colour and coverage lives in alpha. The
  // hero behind is unknown here, so the haze fades by opacity and is laid
  // under the card rather than over it.
  const POST_FRAGMENT = /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float strength;
    uniform float haze;
    uniform float edgeScale;
    uniform vec2 centre;
    varying vec2 vUv;
    const int TAPS = 24;
    const int HAZE_TAPS = 14;
    const float HAZE_HUE = -1.22;
    const float HAZE_LIGHT = 0.35;
    const float HAZE_SAT = 1.8;
    const float HAZE_ALPHA = 0.9;
    vec3 spectrum(float t) {
      // t = 0 -> blue, 0.5 -> green, 1 -> red (red is displaced furthest out).
      return max(vec3(
        1.0 - abs(t - 1.0) * 1.9,
        1.0 - abs(t - 0.5) * 2.4,
        1.0 - abs(t) * 1.9
      ), 0.0) + 0.02;
    }
    // Hue rotation about the grey axis (Rodrigues); positive = red -> green.
    vec3 hueRotate(vec3 c, float a) {
      const vec3 k = vec3(0.57735027);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    vec3 hazeTint(vec3 c) {
      vec3 ghost = hueRotate(c, HAZE_HUE);
      float luma = dot(ghost, vec3(0.299, 0.587, 0.114));
      return clamp(mix(vec3(luma), ghost, HAZE_SAT), 0.0, 1.0);
    }
    void main() {
      vec2 c = vUv - centre;
      float ax = abs(c.x) * 2.0 * edgeScale;
      float k = smoothstep(0.34, 1.0, ax);
      k *= k;
      vec2 dir = normalize(c * resolution + 1e-4);

      // Thin spectral split: each channel is displaced along dir by a
      // different amount (red furthest), with its own coverage.
      vec2 off = dir * strength * k / resolution;
      vec3 acc = vec3(0.0), cover = vec3(0.0), wsum = vec3(0.0);
      for (int i = 0; i < TAPS; i++) {
        float t = float(i) / float(TAPS - 1);
        vec3 w = spectrum(t);
        vec4 s = texture2D(tDiffuse, vUv - off * t);
        acc += s.rgb * w;
        cover += s.a * w;
        wsum += w;
      }
      vec3 col = acc / wsum;
      cover /= wsum;
      // The widest channel sets the alpha and the channels it leaves uncovered
      // are filled with light, so the silhouette keeps a warm spectral rim on
      // any background and the colour stays premultiplied.
      float alpha = max(max(cover.r, cover.g), cover.b);
      col += alpha - cover;

      // Outer haze: a hue-shifted ghost of the card spilling past its
      // silhouette, spreading mostly away from the horizontal mid-line.
      vec2 hdir = normalize(vec2(c.x * 0.3, c.y) * resolution + 1e-4);
      vec2 hoff = hdir * haze * k / resolution;
      vec3 hc = vec3(0.0);
      float cov = 0.0, wt = 0.0;
      for (int i = 0; i < HAZE_TAPS; i++) {
        float t = (float(i) + 0.5) / float(HAZE_TAPS);
        vec4 s = texture2D(tDiffuse, vUv - hoff * t);
        float w = 1.0 - 0.7 * t;
        float m = smoothstep(0.015, 0.05, s.a) * w;
        hc += s.rgb / max(s.a, 1e-3) * m;
        cov += m;
        wt += w;
      }
      float self = smoothstep(0.015, 0.05, texture2D(tDiffuse, vUv).a);
      if (cov > 0.0) {
        vec3 ghost = hazeTint(hc / cov);
        float a = sqrt(cov / wt) * (1.0 - self) * HAZE_ALPHA * (1.0 - HAZE_LIGHT) * smoothstep(0.25, 0.7, k);
        col += ghost * a * (1.0 - alpha);
        alpha += a * (1.0 - alpha);
      }
      gl_FragColor = vec4(col, alpha);
    }
  `;

  // -------------------------------------------------------------------------
  // Runtime
  // -------------------------------------------------------------------------

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = () => hero.dataset.heroVariant === 'fold';
  const motion = { pos: 0, vel: 0, target: 0, dragging: false };
  let scene = null;
  let onScreen = true;

  function go(delta) {
    motion.target = Math.round(motion.target) + delta;
    if (scene) scene.invalidate();
  }

  // Steps on by itself; any drag or swipe restarts the wait.
  let autoTimer = 0;
  function scheduleAutoplay() {
    clearTimeout(autoTimer);
    if (!scene || reducedMotion || !(CONFIG.autoplay > 0)) return;
    autoTimer = setTimeout(() => {
      if (onScreen && shown() && !document.hidden && !motion.dragging) go(1);
      scheduleAutoplay();
    }, CONFIG.autoplay * 1000);
  }

  // --- input: drag anywhere on the hero ---------------------------------------
  // A mouse drags at once; touch leaves vertical swipes to the page and only
  // takes over once the finger moves sideways.
  const skip = (el) => el instanceof Element && el.closest('a, button, input, textarea, select, label');
  let drag = null;
  function capture(e) {
    drag.captured = true;
    drag.pos = motion.pos;
    drag.x = e.clientX;
    drag.lastX = e.clientX;
    drag.lastT = performance.now();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    motion.dragging = true;
    motion.vel = 0;
    stage.setAttribute('data-dragging', '');
  }
  stage.addEventListener('pointerdown', (e) => {
    if (!scene || !shown() || e.button !== 0 || skip(e.target)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pos: motion.pos, lastX: e.clientX, lastT: 0, v: 0, captured: false };
    if (e.pointerType !== 'touch') capture(e);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.captured) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; return; }
      if (Math.abs(dx) < 8) return;
      capture(e);
    }
    const now = performance.now();
    const dt = Math.max(now - drag.lastT, 1) / 1000;
    const slot = scene.slotPx();
    const v = -(e.clientX - drag.lastX) / slot / dt;
    drag.v = drag.v * 0.7 + v * 0.300001;
    drag.lastX = e.clientX;
    drag.lastT = now;
    motion.pos = drag.pos - (e.clientX - drag.x) / slot;
    scene.invalidate();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const ended = drag;
    drag = null;
    if (!ended.captured) return;
    // A press that never moved is not a gesture, and a release long after the
    // last move has no fling.
    const idle = performance.now() - ended.lastT > 120;
    const velocity = idle ? 0 : ended.v;
    motion.target = flingTarget(motion.pos, velocity);
    motion.vel = velocity;
    motion.dragging = false;
    stage.removeAttribute('data-dragging');
    if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    scheduleAutoplay();
    scene.invalidate();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => stage.addEventListener(type, endDrag));

  // --- input: sideways wheel / trackpad swipe (vertical stays with the page) ---
  let wheelTimer = 0;
  let wheelFrom = null;
  stage.addEventListener('wheel', (e) => {
    if (!scene || !shown() || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (wheelFrom === null) wheelFrom = Math.round(motion.target);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
    const next = motion.target + (e.deltaX * unit) / (scene.slotPx() * 1.20001);
    motion.target = Math.max(motion.pos - 1.4, Math.min(motion.pos + 1.4, next));
    scene.invalidate();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      motion.target = settleWheel(wheelFrom, motion.target);
      wheelFrom = null;
      scheduleAutoplay();
      if (scene) scene.invalidate();
    }, 140);
  }, { passive: false });

  // --- scene -------------------------------------------------------------------

  function createScene(THREE) {
    const gl = root.querySelector('.fold-gl') || root;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      fail();
      return null;
    }
    // The shaders write display values straight through.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    // Laid out out of flow, so the canvas can never size the box it measures.
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%';
    gl.replaceChildren(canvas);

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.0500001, 200);
    camera.position.set(0, 0, CAMERA_Z);
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true });

    const post = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
      ),
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: target.texture },
          resolution: { value: new THREE.Vector2(1, 1) },
          strength: { value: 1 },
          haze: { value: 1 },
          edgeScale: { value: 1 },
          centre: { value: new THREE.Vector2(0.5, 0.5) },
        },
        vertexShader: POST_VERTEX,
        fragmentShader: POST_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    );
    post.frustumCulled = false;
    const postScene = new THREE.Scene();
    postScene.add(post);
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    function buildGeometry() {
      const cols = SEGMENTS + 1;
      const g = new THREE.BufferGeometry();
      const uv = new Float32Array(cols * 4);
      const idx = [];
      for (let i = 0; i < cols; i++) {
        const u = i / SEGMENTS;
        uv.set([u, 1, u, 0], i * 4);
        if (i < SEGMENTS) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 6), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    }

    const pt = [0, 0];
    function updateMesh(mesh, s) {
      const g = mesh.geometry;
      const pos = g.attributes.position.array;
      const halfH = CARD_H / 2;
      for (let i = 0; i <= SEGMENTS; i++) {
        cardPoint(s, i / SEGMENTS, pt);
        const o = i * 6;
        pos[o] = pt[0]; pos[o + 1] = halfH; pos[o + 2] = pt[1];
        pos[o + 3] = pt[0]; pos[o + 4] = -halfH; pos[o + 5] = pt[1];
      }
      g.attributes.position.needsUpdate = true;
    }

    // One slot per card: its canvas, texture and mesh. A card shows once its
    // photo and the site font are ready.
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const fonts = fontsReady();
    const slots = CARDS.map((card) => {
      const face = document.createElement('canvas');
      face.width = TEX_W;
      face.height = TEX_H;
      const texture = new THREE.CanvasTexture(face);
      texture.anisotropy = maxAnisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          radius: { value: 0.036 },
        },
        vertexShader: CARD_VERTEX,
        fragmentShader: CARD_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
      });
      const mesh = new THREE.Mesh(buildGeometry(), material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      world.add(mesh);
      const slot = { texture, mesh, ready: false };
      Promise.all([imageReady(card.img), fonts]).then(([image]) => {
        drawCardFace(face.getContext('2d'), card, image);
        texture.needsUpdate = true;
        slot.ready = true;
        invalidate();
      });
      return slot;
    });

    // The canvas reaches down into the hero's bottom padding (the hero clips
    // it), so a card swinging close to the lens is never cut straight at the
    // stage's edge.
    let layout = layoutFor(1, 1);
    let dpr = 1;
    function resize() {
      const W = Math.max(1, root.clientWidth);
      const H = Math.max(1, root.clientHeight);
      const rect = root.getBoundingClientRect();
      const clip = hero.getBoundingClientRect();
      const cap = Math.max(W, H);
      const side = (px) => Math.min(cap, Math.max(0, Math.ceil(px)));
      const bleed = {
        left: side(rect.left - clip.left),
        top: side(rect.top - clip.top),
        right: side(clip.right - rect.right),
        bottom: side(clip.bottom - rect.bottom),
      };
      const CW = W + bleed.left + bleed.right;
      const CH = H + bleed.top + bleed.bottom;
      Object.assign(gl.style, {
        left: `${-bleed.left}px`,
        top: `${-bleed.top}px`,
        right: `${-bleed.right}px`,
        bottom: `${-bleed.bottom}px`,
      });
      // A bled canvas spends no more pixels than the bare stage at 2x.
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt((4 * W * H) / (CW * CH)));
      renderer.setPixelRatio(dpr);
      renderer.setSize(CW, CH, false);
      const box = slotEl && slotEl.getBoundingClientRect();
      layout = layoutFor(W, H, box && box.width > 0
        ? { width: box.width, centreY: box.top + box.height / 2 - rect.top }
        : null);
      camera.aspect = W / H;
      camera.fov = layout.fov;
      camera.setViewOffset(W, H, -bleed.left, layout.offsetY - bleed.top, CW, CH);
      camera.updateProjectionMatrix();
      const bw = Math.round(CW * dpr);
      const bh = Math.round(CH * dpr);
      target.setSize(bw, bh);
      const u = post.material.uniforms;
      u.resolution.value.set(bw, bh);
      // The optics are measured from the stage centre in stage-relative x.
      u.edgeScale.value = layout.edgeScale * (CW / W);
      u.centre.value.set((bleed.left + W / 2) / CW, (bleed.bottom + H / 2) / CH);
      u.strength.value = layout.fringe * dpr * CONFIG.fringe;
      u.haze.value = layout.haze * dpr * CONFIG.haze;
      invalidate();
    }

    function render() {
      const n = slots.length;
      for (let i = 0; i < n; i++) {
        const slot = slots[i];
        const s = offsetOf(i, motion.pos, n);
        const visible = slot.ready && Math.abs(s) < VISIBLE_SPAN;
        slot.mesh.visible = visible;
        if (visible) {
          updateMesh(slot.mesh, s);
          // Draw the flat, nearest cards last.
          slot.mesh.renderOrder = -Math.round(Math.abs(s) * 100);
        }
      }
      renderer.setRenderTarget(target);
      renderer.render(world, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    }

    // Frames are drawn only while something moves: a settled carousel costs
    // nothing, and one scrolled out of view stops until it returns.
    let frame = 0;
    let last = 0;
    function tick(now) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      const omega = reducedMotion ? 22 : CONFIG.settle;
      if (!motion.dragging) {
        [motion.pos, motion.vel] = springStep(motion.pos, motion.vel, motion.target, dt, omega);
      }
      if (onScreen) render();
      const moving = motion.dragging || motion.pos !== motion.target || motion.vel !== 0;
      if (moving && onScreen) frame = requestAnimationFrame(tick);
      else last = 0;
    }
    function invalidate() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) invalidate();
    }).observe(root);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    if (slotEl) resizeObserver.observe(slotEl);
    window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(frame); frame = 0; });
    canvas.addEventListener('webglcontextrestored', () => { slots.forEach((slot) => { slot.texture.needsUpdate = true; }); invalidate(); });

    resize();
    root.setAttribute('data-fold-ready', '');
    stage.setAttribute('data-draggable', '');
    return { invalidate, slotPx: () => layout.slotPx };
  }

  // three.js is only fetched the first time this style is shown.
  let loading = false;
  function start() {
    if (loading || !shown()) return;
    loading = true;
    import(THREE_URL)
      .then((THREE) => {
        scene = createScene(THREE);
        scheduleAutoplay();
      })
      .catch(fail);
  }

  // No WebGL (or three.js would not load): photo 1 stands still where the
  // centre card would be.
  function fail() {
    root.setAttribute('data-fold-failed', '');
    if (slotEl && !slotEl.firstChild) slotEl.appendChild(CARDS[0].img.cloneNode());
  }
  document.addEventListener('hero:variant', start);
  start();
})();
