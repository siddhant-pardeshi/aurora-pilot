/* ============================================================
 * AURORA PILOT — 2.5D dawn canyon mail flight.
 * Free-altitude tiltwing flight over a scrolling canyon: golden
 * ring streaks, stone spires, parachute fuel drops, flocks of
 * birds, and four skies that crossfade as the run goes on.
 * All art is drawn with canvas paths each frame; all audio is
 * synthesized. No image or sound assets.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- tuning ---------------- */
  const PXP = 0.6;                   // world units -> px
  const ALT_MAX = 1000;              // playable altitude band, world units
  const CRUISE0 = 340;               // base world units / second
  const CRUISE_PER_STAGE = 24;       // speed creep per sky
  const MAXVY = 330;                 // climb/dive cap
  const THRUST = 940;                // vertical acceleration at full pitch
  const GRAV = 110;                  // gentle sink
  const STALL_DRAIN = 110;           // speed bled while climbing hard
  const DIVE_GAIN = 52;              // speed regained while diving
  const FUEL_BURN = 100 / 90;        // ~90 s per tank
  const BOOST_TIME = 2;              // throttle surge, seconds
  const STAGE_LEN = 60;              // seconds per sky
  const RING_R = 44;                 // ring radius, world units
  const PLANE_HW = 62, PLANE_HH = 22;// plane half extents for hits
  const STAGE_NAMES = ['Dawn', 'Bright day', 'Dusk', 'Starry night'];

  /* four skies; colors are [r,g,b], numbers lerp too */
  const STAGES = [
    { name: 'Dawn',
      top: [18, 24, 56], mid: [222, 148, 128], low: [255, 208, 138],
      sun: [255, 236, 180], sunX: 0.62, sunY: 0.80, sunR: 0.15, glow: 0.55,
      far: [47, 45, 88], farRim: [255, 166, 120], midM: [36, 34, 66], midRim: [255, 190, 130],
      near: [24, 22, 46], nearRim: [255, 208, 138],
      sea1: [72, 82, 132], sea2: [16, 24, 40], glint: [255, 208, 138], glintA: 0.5,
      cloud: [255, 190, 150], cloudA: 0.40, starA: 0.25 },
    { name: 'Bright day',
      top: [46, 110, 168], mid: [122, 180, 224], low: [210, 232, 246],
      sun: [255, 246, 216], sunX: 0.30, sunY: 0.26, sunR: 0.085, glow: 0.35,
      far: [96, 140, 176], farRim: [226, 242, 252], midM: [64, 104, 140], midRim: [216, 236, 250],
      near: [38, 70, 102], nearRim: [200, 226, 244],
      sea1: [40, 110, 150], sea2: [10, 30, 52], glint: [255, 240, 200], glintA: 0.35,
      cloud: [255, 255, 255], cloudA: 0.55, starA: 0 },
    { name: 'Dusk',
      top: [40, 28, 74], mid: [152, 76, 112], low: [255, 158, 110],
      sun: [255, 198, 142], sunX: 0.72, sunY: 0.86, sunR: 0.17, glow: 0.6,
      far: [58, 40, 88], farRim: [255, 140, 110], midM: [40, 28, 64], midRim: [255, 170, 120],
      near: [22, 16, 42], nearRim: [255, 190, 130],
      sea1: [90, 70, 120], sea2: [14, 14, 32], glint: [255, 170, 120], glintA: 0.45,
      cloud: [255, 150, 120], cloudA: 0.45, starA: 0.35 },
    { name: 'Starry night',
      top: [8, 12, 30], mid: [22, 32, 66], low: [52, 72, 118],
      sun: [228, 238, 255], sunX: 0.40, sunY: 0.22, sunR: 0.055, glow: 0.3,
      far: [26, 36, 66], farRim: [140, 180, 230], midM: [18, 26, 50], midRim: [120, 160, 215],
      near: [10, 16, 34], nearRim: [110, 150, 205],
      sea1: [24, 40, 80], sea2: [6, 10, 22], glint: [180, 210, 255], glintA: 0.3,
      cloud: [120, 150, 200], cloudA: 0.22, starA: 1 }
  ];

  const RIDGE_LAYERS = [
    { par: 0.10, amp: 0.34, jag: 0.10, p1: 1.7, p2: 4.2, p3: 0.9 },
    { par: 0.26, amp: 0.44, jag: 0.16, p1: 3.1, p2: 0.6, p3: 2.4 },
    { par: 0.52, amp: 0.56, jag: 0.22, p1: 5.0, p2: 2.2, p3: 5.6 }
  ];
  const CLOUD_BANKS = [
    { n: 7, y0: 0.05, y1: 0.22, par: 0.06, drift: 0.004 },
    { n: 6, y0: 0.16, y1: 0.38, par: 0.16, drift: 0.009 },
    { n: 5, y0: 0.34, y1: 0.58, par: 0.34, drift: 0.015 }
  ];
  const WIND_OPTS = { wave: 'sine', freq: 68, maxFreq: 200, cutoff: 260, gain: 0.05 };

  /* ---------------- world state ---------------- */
  let state = 'attract';
  let camX = 0, alt = 520, vy = 0, speed = 0;
  let fuel = 100, hull = 3, engineCut = false, invuln = 0;
  let score = 0, ringsGot = 0, streak = 0, closeCalls = 0, streakShield = false;
  let stageIdx = 0, stageT = 0;
  let palFrom = null, palToIdx = 0, blend = 1;
  let totalDist = 0;
  let surgeT = 0, boostFx = 0, stalled = false, stallAlarmT = 0;
  let autoT = 0, trailT = 0, windUp = false;
  let ents = [], spawnX = 0, opening = 0;
  let particles = Kit.particles();
  let hudEls = null;

  const W = { w: 0, h: 0 };
  let stars = [];
  const clouds = [[], [], []];
  let vig = null;

  /* ---------------- scene building ---------------- */
  function buildScenery() {
    stars = [];
    for (let i = 0; i < 120; i++) stars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.2 + 0.4, p: Math.random() * 6.28 });
    CLOUD_BANKS.forEach((L, li) => {
      clouds[li] = [];
      for (let i = 0; i < L.n; i++) {
        const puffs = [];
        const nP = Kit.irand(4, 6);
        for (let k = 0; k < nP; k++) {
          puffs.push([(k / (nP - 1) - 0.5) + Kit.rand(-0.08, 0.08), Kit.rand(-0.16, 0.1), Kit.rand(0.07, 0.16)]);
        }
        clouds[li].push({ x: Math.random(), y: Kit.rand(L.y0, L.y1), w: Kit.rand(0.11, 0.24), a: Kit.rand(0.5, 1), puffs });
      }
    });
  }

  /* ---------------- palettes ---------------- */
  function palMix(a, b, t) {
    const o = {};
    for (const k in b) {
      const vb = b[k];
      if (typeof vb === 'string') { o[k] = vb; continue; }
      if (Array.isArray(vb)) {
        o[k] = [Kit.lerp(a[k][0], vb[0], t), Kit.lerp(a[k][1], vb[1], t), Kit.lerp(a[k][2], vb[2], t)];
      } else o[k] = Kit.lerp(a[k], vb, t);
    }
    return o;
  }
  const c3 = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;

  function setPalette(idx) {
    const cur = palMix(palFrom, STAGES[palToIdx], blend);
    palFrom = cur;
    palToIdx = idx;
    blend = 0;
  }
  function curPalette() {
    return blend >= 1 ? STAGES[palToIdx] : palMix(palFrom, STAGES[palToIdx], blend);
  }

  /* ---------------- run control ---------------- */
  let G = null;                     // assigned at boot

  function startFlight() {
    camX = 0; alt = 520; vy = 0; speed = CRUISE0 * 0.7;
    fuel = 100; hull = 3; engineCut = false; invuln = 0;
    score = 0; ringsGot = 0; streak = 0; closeCalls = 0;
    stageIdx = 0; stageT = 0; blend = 1;
    palFrom = STAGES[0]; palToIdx = 0;
    totalDist = 0;
    surgeT = 0; boostFx = 0; stalled = false; trailT = 0;
    ents = []; spawnX = 560; opening = 0;
    particles.clear();
    state = 'flight';
    windEnsure();
    Audio.playSong('flight');
    Kit.toast('Wheels up!');
    Mascot.react('start');
  }

  function toAttract() {
    state = 'attract';
    autoT = 0; camX = 0; alt = 520; speed = CRUISE0 * 0.5;
    fuel = 100; hull = 3; engineCut = false; surgeT = 0; boostFx = 0; stalled = false;
    ents = []; spawnX = 400; opening = 0;
    stageIdx = 0; stageT = 0; blend = 1; palFrom = STAGES[0]; palToIdx = 0;
    particles.clear();
    windEnsure();
    Audio.playSong('menu');
  }

  function finishRun(reason) {
    state = 'done';
    Audio.stopLoop('wind'); windUp = false;
    Audio.stopSong();
    G.pause();
    const prevBest = Kit.store.get('aurora.best', 0) || 0;
    const isPB = score > prevBest;
    Kit.showResults({
      medal: reason === 'fuel' ? '🪶' : hull >= 2 ? '🏆' : '🔧',
      kicker: reason === 'fuel' ? 'Out of fuel — glided home' : 'Mail run complete',
      title: isPB ? 'Golden run, pilot' : reason === 'fuel' ? 'Glided into the dawn' : 'The canyon leaves a mark',
      stats: [
        { label: 'Score', value: Kit.fmt(score) },
        { label: 'Rings', value: String(ringsGot) },
        { label: 'Distance', value: (totalDist / 520).toFixed(1) + ' km' },
        { label: 'Close calls', value: String(closeCalls) }
      ],
      best: { value: score },
      mascotLine: isPB ? Kit.pick(MASCOT_LINES.win) : Kit.pick(MASCOT_LINES.fail)
    });
    Mascot.react(isPB ? 'win' : 'fail');
  }

  /* ---------------- spawning ---------------- */
  function streakMult() {
    return streak >= 13 ? 5 : streak >= 9 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
  }

  function addRing(wx, a) { ents.push({ kind: 'ring', wx, alt: Kit.clamp(a, 90, ALT_MAX - 80), got: false }); }
  function addRock(wx, lo, hi) { ents.push({ kind: 'rock', wx, lo, hi, hw: 52, hitDone: false }); }

  function spawnPattern(x) {
    if (opening < 2) {                   // ease the run in: rings, then a friendly arch
      opening++;
      if (opening === 1) {
        for (let i = 0; i < 5; i++) addRing(x + i * 95, 480 + Math.sin(i * 0.9) * 130);
        return 420;
      }
      const gap = 430;
      ents.push({ kind: 'pillar', wx: x, hi: gap - 130, hw: 55, hitDone: false });
      ents.push({ kind: 'slab', wx: x, lo: gap + 130, hi: gap + 130 + 290, hw: 62, hitDone: false });
      addRing(x + 10, gap);
      return 140;
    }
    const fuelW = fuel < 55 ? 0.2 : 0.08;
    const roll = Math.random() * (0.26 + 0.22 + 0.28 + 0.1 + fuelW);
    let acc = 0, pick = 'rings';
    for (const [kind, wt] of [['arch', 0.26], ['spires', 0.22], ['rings', 0.28], ['birds', 0.1], ['fuel', fuelW]]) {
      acc += wt;
      if (roll < acc) { pick = kind; break; }
    }

    if (pick === 'arch') {
      const gapLow = Kit.rand(140, 600), gapH = 260;
      ents.push({ kind: 'pillar', wx: x, hi: gapLow, hw: 55, hitDone: false });
      ents.push({ kind: 'slab', wx: x, lo: gapLow + gapH, hi: gapLow + gapH + 290, hw: 62, hitDone: false });
      if (Math.random() < 0.65) addRing(x + 10, gapLow + gapH / 2);
      return 130;
    }
    if (pick === 'spires') {
      const n = Kit.irand(2, 3);
      for (let i = 0; i < n; i++) {
        const c = Kit.rand(190, 800);
        addRock(x + i * 135, c - 65, c + 65);
      }
      return n * 135;
    }
    if (pick === 'birds') {
      const base = Kit.rand(180, 820), birds = [];
      for (let i = 0; i < 5; i++) birds.push({ da: (i - 2) * 26 + Kit.rand(-8, 8), dx: i * 24, ph: Math.random() * 6.28 });
      ents.push({ kind: 'flock', wx: x, alt: base, birds, scored: false });
      return 160;
    }
    ents.push({ kind: 'fuel', wx: x, alt: Kit.rand(300, 800), got: false, ph: Math.random() * 6.28 });
    return 90;
  }

  function gapLen() {
    return (330 + Kit.rand(0, 240)) * Kit.clamp(1 - stageIdx * 0.05, 0.72, 1);
  }

  /* ---------------- collect / collide ---------------- */
  function sparkle(wx, a, color) {
    const x = W.w * 0.32 + (wx - camX) * PXP;
    particles.spawn(x, altY(a), { count: 10, color, spread: 150, decay: 2, size: 2.4, glow: true });
  }

  function collectRing(e) {
    e.got = true;
    streak++; ringsGot++;
    score += 10 * streakMult();
    Audio.sfx('chime');
    Kit.buzz(15);
    sparkle(e.wx, e.alt, '#FFD08A');
    if (streak >= 3) Mascot.react('streak');
  }

  function collectFuel(e) {
    e.got = true;
    fuel = Math.min(100, fuel + 25);
    Audio.sfx('powerup');
    Kit.buzz(20);
    sparkle(e.wx, e.alt, '#8AD4FF');
  }

  function hitRock() {
    hull--;
    invuln = 1.8;
    speed = Math.max(110, speed * 0.45);
    G.shake(9);
    Kit.buzz(80);
    Audio.sfx('hit');
    particles.spawn(W.w * 0.36, altY(alt), { count: 14, color: '#B9A8E0', spread: 260, decay: 1.8, size: 2.6 });
    Mascot.react('hit');
    if (hull <= 0) finishRun('hull');
  }

  function nearMiss(e) {
    e.scored = true;
    let best = 1e9;
    for (const b of e.birds) best = Math.min(best, Math.abs(e.alt + b.da - alt));
    if (best < 95) {
      closeCalls++;
      score += 5;
      Audio.sfx('whoosh');
      particles.spawn(W.w * 0.34, altY(alt), { count: 6, color: 'rgba(240,244,255,0.7)', spread: 70, vx: -speed * PXP, decay: 1.6, size: 3 });
    }
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    const input = Kit.input;
    const flying = state === 'flight';
    const attract = state === 'attract';
    if (attract) autoT += dt;

    /* palette crossfade */
    if (blend < 1) blend = Math.min(1, blend + dt / 3.5);

    /* stage clock */
    if (flying) {
      stageT += dt;
      if (stageT >= STAGE_LEN) {
        stageT -= STAGE_LEN;
        stageIdx = (stageIdx + 1) % 4;
        setPalette(stageIdx);
        Kit.toast('Sky shift — ' + STAGE_NAMES[stageIdx]);
        /* flight briefing: the sky you just crossed is a layer of the net */
        if (window.Learn && window.LEARN_DATA && stageIdx > 0) {
          const card = Learn.nextCard();
          if (card) {
            Learn.show(card, {
              timer: 14,
              onOpen: () => G.pause(),
              onClose: () => { if (Kit.screens.active() === 'hud' && (state === 'race' || state === 'flight')) G.resume(); }
            }).then(ok => {
              if (ok) {
                score += 250;
                fuel = Math.min(100, fuel + 25);
                streakShield = true;
                Kit.toast('Briefing aced — +250, +fuel, streak insured');
              } else {
                fuel = Math.max(8, fuel - 20);
                G.shake(5);
                Audio.sfx('fail');
                Kit.toast('Missed briefing — the tank took a hit (-20 fuel)');
              }
            });
          }
        }
        Audio.sfx('checkpoint');
        Mascot.react('stage');
        showBriefing();
      }
    } else if (attract) {
      stageT += dt;
      if (stageT >= 22) { stageT = 0; setPalette((stageIdx + 1) % 4); }
    }

    const cruise = CRUISE0 + Math.min(stageIdx, 6) * CRUISE_PER_STAGE;

    if (flying) {
      const climb = -input.axis().y;

      /* throttle surge (edge-triggered, 2 s) */
      if ((input.pressed('boost') || input.pressed('action')) && fuel > 2 && !engineCut) {
        surgeT = BOOST_TIME;
        Audio.sfx('whoosh');
      }
      if (surgeT > 0) {
        surgeT -= dt;
        fuel -= FUEL_BURN * dt;            // the second burn
        speed += (cruise + 220 - speed) * dt * 1.6;
      }
      boostFx += ((surgeT > 0 ? 1 : 0) - boostFx) * Math.min(1, dt * 5);

      /* speed: drag toward cruise, climb bleeds it, diving feeds it */
      speed += (cruise - speed) * dt * 0.5;
      if (climb > 0.2 && !engineCut) speed -= climb * STALL_DRAIN * dt;
      if (vy < -30) speed += Kit.clamp(-vy / MAXVY, 0, 1) * DIVE_GAIN * dt;
      speed = Kit.clamp(speed, 90, cruise * 1.9);

      /* stall: bleed it dry and she wallows */
      stalled = !engineCut && speed < cruise * 0.42;
      if (stalled) {
        stallAlarmT -= dt;
        if (stallAlarmT <= 0) { stallAlarmT = 1.6; Audio.sfx('alarm'); }
      } else stallAlarmT = 0;

      /* fuel */
      fuel -= FUEL_BURN * dt;
      if (fuel <= 0 && !engineCut) {
        engineCut = true; fuel = 0;
        Kit.toast('Engine cold — glide her down');
        Audio.sfx('whoosh');
      }
      if (fuel < 25 && !engineCut) Mascot.react('lowfuel');

      /* vertical: thrust, gravity, surge auto-level, drag */
      const th = engineCut ? 0 : (stalled ? THRUST * 0.4 : THRUST);
      vy += climb * th * dt;
      vy -= GRAV * (engineCut ? 1.7 : 1) * dt;
      if (surgeT > 0) vy += (0 - vy) * dt * 3.2;
      vy -= vy * 2.4 * dt;
      vy = Kit.clamp(vy, -MAXVY, MAXVY);
      alt += vy * dt;
      if (alt > ALT_MAX) { alt = ALT_MAX; vy = Math.min(vy, 0); }
      if (alt < 26) {
        if (engineCut) { finishRun('fuel'); return; }
        alt = 26;
        if (vy < 0) vy = 0;
      }

      totalDist += speed * dt;
      invuln = Math.max(0, invuln - dt);
    } else if (attract) {
      const target = 520 + Math.sin(autoT * 0.42) * 260 + Math.sin(autoT * 0.17 + 1.3) * 110;
      vy = (target - alt) * 0.7;
      alt += (target - alt) * dt * 0.9;
      speed += (cruise * 0.55 - speed) * dt * 0.8;
      boostingOff();
    } else {
      boostingOff();
      speed = 0;
    }

    /* advance the world */
    camX += speed * dt;

    /* spawn ahead of the plane */
    while (spawnX < camX + W.w / PXP + 240) spawnX += spawnPattern(spawnX) + gapLen();

    /* entities */
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.kind === 'fuel') e.alt = Math.max(90, e.alt - 13 * dt);
      if (e.kind === 'flock') e.wx -= 55 * dt;
      const dx = e.wx - camX;
      if (dx < -340) { ents.splice(i, 1); continue; }
      if (flying) {
        if (e.kind === 'ring' && !e.got) {
          if (dx < 34 && dx > -70 && Math.abs(e.alt - alt) < RING_R * 0.92) collectRing(e);
          else if (dx <= -70) {
            e.got = true;
            if (streakShield) { streakShield = false; Kit.toast('Streak insured — the shield took the miss'); }
            else streak = 0;
          }
        } else if ((e.kind === 'rock' || e.kind === 'pillar' || e.kind === 'slab') && !e.hitDone) {
          if (invuln <= 0 && Math.abs(dx) < e.hw + PLANE_HW) {
            const lo = (e.kind === 'pillar' ? 0 : e.lo) - PLANE_HH;
            const hi = e.hi + PLANE_HH;
            if (alt > lo && alt < hi) { hitRock(); if (state !== 'flight') return; }
          }
        } else if (e.kind === 'fuel' && !e.got) {
          if (Math.abs(dx) < 74 && Math.abs(e.alt - alt) < 58) collectFuel(e);
        } else if (e.kind === 'flock' && !e.scored && dx < -30) {
          nearMiss(e);
        }
      } else if (attract && e.kind === 'ring' && !e.got && dx < 30 && Math.abs(e.alt - alt) < RING_R) {
        e.got = true;                      // silent sparkle keeps the menu alive
        sparkle(e.wx, e.alt, '#FFD08A');
      }
    }

    /* wingtip trails */
    trailT -= dt;
    if (!Kit.reducedMotion() && trailT <= 0 && speed > 120 && (flying || attract)) {
      trailT = 0.055;
      const s = 130 * PXP, cx = W.w * 0.32, cy = altY(alt);
      for (const side of [-1, 1]) {
        particles.spawn(cx - s * 0.42, cy + side * s * 0.3, {
          count: 1, color: 'rgba(255,208,138,0.4)', spread: 10,
          vx: -speed * PXP * 0.94, vy: -6, size: 1.8, decay: 2.4, grav: -10
        });
      }
    }

    /* audio follows the flight */
    windEnsure();
    const sr = Kit.clamp(speed / (CRUISE0 * 1.6), 0, 1);
    Audio.setLoop('wind', 'pitch', sr * 0.9 + (flying ? 0.08 : 0.03));
    Audio.setLoop('wind', 'gain', engineCut ? 0.012 : flying ? 0.05 : 0.028);
    Audio.setIntensity(flying ? 0.35 + 0.65 * Kit.clamp(streak / 13, 0, 1) : 0.12);

    particles.update(dt);
  }

  function boostingOff() { surgeT = 0; boostFx = Math.max(0, boostFx - 0.05); stalled = false; }

  /* ---------------- projection ---------------- */
  function altY(a) { return Kit.lerp(W.h * 0.82, W.h * 0.12, a / ALT_MAX); }
  const frac = u => ((u % 1) + 1) % 1;

  function ridgeY(L, u) {
    let y = 0.55
      + 0.26 * Math.sin(u * Math.PI * 2 * 2 + L.p1)
      + 0.16 * Math.sin(u * Math.PI * 2 * 5 + L.p2)
      + 0.10 * Math.sin(u * Math.PI * 2 * 11 + L.p3);
    const t = frac(u * 7 + L.p2);
    y += L.jag * (Math.abs(t - 0.5) * 2 - 0.5);
    return Kit.clamp(y, 0.12, 0.95);
  }

  /* ---------------- render ---------------- */
  function render(ctx, gg) {
    const { w, h } = W;
    const cur = curPalette();
    const seaY = h * 0.84;
    const t = gg.t;

    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0, c3(cur.top));
    sky.addColorStop(0.5, c3(cur.mid));
    sky.addColorStop(1, c3(cur.low));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, seaY + 2);

    /* stars */
    if (cur.starA > 0.02) {
      ctx.fillStyle = '#EAF1FF';
      for (const s of stars) {
        ctx.globalAlpha = (0.35 + 0.6 * Math.abs(Math.sin(t * 1.4 + s.p))) * cur.starA;
        ctx.fillRect(s.x * w, s.y * seaY, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    /* sun (or moon) with soft glow */
    const sunSx = cur.sunX * w;
    const sunSy = h * 0.08 + cur.sunY * (seaY - h * 0.08);
    const sunR = Math.min(w, h) * cur.sunR;
    const glow = ctx.createRadialGradient(sunSx, sunSy, sunR * 0.3, sunSx, sunSy, sunR * 3.4);
    glow.addColorStop(0, `rgba(${cur.sun[0] | 0},${cur.sun[1] | 0},${cur.sun[2] | 0},${cur.glow})`);
    glow.addColorStop(1, `rgba(${cur.sun[0] | 0},${cur.sun[1] | 0},${cur.sun[2] | 0},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(sunSx - sunR * 3.4, sunSy - sunR * 3.4, sunR * 6.8, sunR * 6.8);
    ctx.fillStyle = c3(cur.sun);
    ctx.beginPath(); ctx.arc(sunSx, sunSy, sunR, 0, Math.PI * 2); ctx.fill();
    if (stageIdx === 3 && blend > 0.6) {   // moon crater hint in the starry sky
      ctx.fillStyle = 'rgba(120,140,190,0.35)';
      ctx.beginPath(); ctx.arc(sunSx - sunR * 0.3, sunSy - sunR * 0.2, sunR * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sunSx + sunR * 0.25, sunSy + sunR * 0.3, sunR * 0.15, 0, Math.PI * 2); ctx.fill();
    }

    /* far cloud bank, then the three canyon ridges with rim light */
    drawClouds(ctx, 0, cur, t);

    const layerCols = [[cur.far, cur.farRim], [cur.midM, cur.midRim], [cur.near, cur.nearRim]];
    for (let li = 0; li < 3; li++) {
      drawRidge(ctx, RIDGE_LAYERS[li], layerCols[li][0], layerCols[li][1], w, h, seaY);
      if (li === 0) drawClouds(ctx, 1, cur, t);
      if (li === 1) drawClouds(ctx, 2, cur, t);
    }

    /* sea strip with sun glint */
    const sea = ctx.createLinearGradient(0, seaY, 0, h);
    sea.addColorStop(0, c3(cur.sea1));
    sea.addColorStop(1, c3(cur.sea2));
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, w, h - seaY);
    for (let i = 0; i < 9; i++) {
      const yy = seaY + 5 + (i / 9) * (h - seaY - 10);
      const spread = (i + 2) * w * 0.007;
      const wob = Math.sin(t * 2.1 + i * 2.4);
      ctx.globalAlpha = cur.glintA * (0.65 + 0.35 * wob) * (1 - i / 11);
      ctx.fillStyle = c3(cur.glint);
      ctx.fillRect(sunSx - spread / 2 + wob * w * 0.012, yy, spread * (0.5 + 0.3 * Math.sin(i * 5 + t)), 2);
    }
    ctx.globalAlpha = 1;

    /* world entities: rocks first, then pickups */
    const px0 = w * 0.32;
    for (const e of ents) {
      const ex = px0 + (e.wx - camX) * PXP;
      if (ex < -140 || ex > w + 160) continue;
      if (e.kind === 'rock') drawRock(ctx, ex, altY(e.hi), altY(e.lo), e.hw * PXP);
      else if (e.kind === 'pillar') drawPillar(ctx, ex, altY(e.hi), e.hw * PXP, h);
      else if (e.kind === 'slab') drawSlab(ctx, ex, altY(e.lo), altY(e.hi), e.hw * PXP);
    }
    for (const e of ents) {
      const ex = px0 + (e.wx - camX) * PXP;
      if (ex < -140 || ex > w + 160) continue;
      if (e.kind === 'ring' && !e.got) drawRing(ctx, ex, altY(e.alt), t, e.wx);
      else if (e.kind === 'fuel' && !e.got) drawCanister(ctx, ex, altY(e.alt), t, e.ph);
      else if (e.kind === 'flock' && !e.scored) drawFlock(ctx, e, ex, t);
    }

    particles.render(ctx);
    if (state !== 'done') drawPlane(ctx, gg, px0);

    /* throttle surge streaks */
    if (boostFx > 0.2) {
      ctx.strokeStyle = `rgba(138,212,255,${0.24 * boostFx})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const yy = altY(alt) + Math.sin(i * 3.7 + i * i) * h * 0.16;
        const len = (70 + (i * 53) % 110) * boostFx;
        ctx.beginPath();
        ctx.moveTo(px0 - 60 - (i * 37) % 90, yy);
        ctx.lineTo(px0 - 60 - (i * 37) % 90 - len, yy);
        ctx.stroke();
      }
    }

    if (!vig || vig.w !== w) {
      vig = { w, g: ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.44, w / 2, h / 2, Math.max(w, h) * 0.76) };
      vig.g.addColorStop(0, 'rgba(0,0,0,0)'); vig.g.addColorStop(1, 'rgba(6,8,18,0.45)');
    }
    ctx.fillStyle = vig.g;
    ctx.fillRect(0, 0, w, h);

    updateHUD();
  }

  function drawRidge(ctx, L, col, rim, w, h, seaY) {
    const scroll = camX * PXP * L.par / w;
    ctx.fillStyle = c3(col);
    ctx.beginPath();
    ctx.moveTo(-4, h);
    for (let sx = -0.02; sx <= 1.02; sx += 0.016) {
      const y = seaY - ridgeY(L, frac(sx + scroll)) * L.amp * h;
      ctx.lineTo(sx * w, y);
    }
    ctx.lineTo(w + 4, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${rim[0] | 0},${rim[1] | 0},${rim[2] | 0},0.4)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let sx = -0.02; sx <= 1.02; sx += 0.016) {
      const y = seaY - ridgeY(L, frac(sx + scroll)) * L.amp * h;
      if (sx <= -0.02 + 0.001) ctx.moveTo(sx * w, y); else ctx.lineTo(sx * w, y);
    }
    ctx.stroke();
  }

  function drawClouds(ctx, li, cur, t) {
    const L = CLOUD_BANKS[li];
    const { w, h } = W;
    const scroll = camX * PXP * L.par / w + t * L.drift;
    ctx.fillStyle = c3(cur.cloud);
    for (const c of clouds[li]) {
      const sx = frac(c.x + scroll) * w * 1.25 - w * 0.12;
      if (sx < -w * 0.3 || sx > w * 1.1) continue;
      const sy = c.y * h, sw = c.w * w;
      ctx.globalAlpha = cur.cloudA * c.a * 0.8;
      for (const p of c.puffs) {
        ctx.beginPath();
        ctx.ellipse(sx + p[0] * sw, sy + p[1] * sw, p[2] * sw, p[2] * sw * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRock(ctx, ex, yTop, yBot, hw) {
    ctx.fillStyle = '#2B2444';
    ctx.beginPath();
    ctx.moveTo(ex - hw, yBot);
    ctx.lineTo(ex - hw * 0.8, yTop + (yBot - yTop) * 0.22);
    ctx.lineTo(ex - hw * 0.2, yTop);
    ctx.lineTo(ex + hw * 0.5, yTop + (yBot - yTop) * 0.32);
    ctx.lineTo(ex + hw, yBot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,138,0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function drawPillar(ctx, ex, yTop, hw, h) {
    ctx.fillStyle = '#2B2444';
    ctx.beginPath();
    ctx.moveTo(ex - hw * 1.15, h);
    ctx.lineTo(ex - hw * 0.85, yTop + 10);
    ctx.lineTo(ex - hw * 0.4, yTop);
    ctx.lineTo(ex + hw * 0.3, yTop + 8);
    ctx.lineTo(ex + hw * 1.05, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,138,0.3)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ex - hw * 0.85, yTop + 10);
    ctx.lineTo(ex - hw * 0.4, yTop);
    ctx.lineTo(ex + hw * 0.3, yTop + 8);
    ctx.stroke();
  }

  function drawSlab(ctx, ex, yLo, yHi, hw) {
    ctx.fillStyle = '#2B2444';
    ctx.beginPath();
    ctx.moveTo(ex - hw, yHi);
    ctx.quadraticCurveTo(ex, yHi - 24, ex + hw, yHi);
    ctx.lineTo(ex + hw * 0.9, yLo + (yHi - yLo) * 0.2);
    ctx.quadraticCurveTo(ex, yLo - 26, ex - hw * 0.9, yLo + (yHi - yLo) * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,138,0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function drawRing(ctx, ex, ey, t, seed) {
    const r = RING_R * PXP * (1 + Math.sin(t * 3 + seed * 0.01) * 0.04);
    ctx.strokeStyle = 'rgba(255,208,138,0.25)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#FFD08A';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ex, ey, r, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  }

  function drawCanister(ctx, ex, ey, t, ph) {
    const sway = Math.sin(t * 1.8 + ph) * 6;
    ctx.save();
    ctx.translate(ex + sway, ey);
    ctx.strokeStyle = 'rgba(240,244,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.lineTo(-11, -26);
    ctx.moveTo(8, -10); ctx.lineTo(11, -26);
    ctx.moveTo(0, -10); ctx.lineTo(0, -27);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,244,255,0.85)';
    ctx.beginPath(); ctx.ellipse(0, -30, 15, 6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#FFC46B';
    ctx.strokeStyle = '#B8834A';
    ctx.lineWidth = 1.4;
    roundRect(ctx, -8, -10, 16, 22, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8AD4FF';
    ctx.fillRect(-8, -2, 16, 4);
    ctx.restore();
  }

  function drawFlock(ctx, e, ex, t) {
    ctx.strokeStyle = '#28304A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const b of e.birds) {
      const bx = ex + b.dx * PXP - 20, by = altY(e.alt + b.da) + Math.sin(t * 2 + b.ph) * 4;
      const flap = Math.sin(t * 9 + b.ph) * 3;
      ctx.beginPath();
      ctx.moveTo(bx - 6, by);
      ctx.quadraticCurveTo(bx - 2, by - 5 - flap, bx, by);
      ctx.quadraticCurveTo(bx + 2, by - 5 - flap, bx + 6, by);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
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

  function drawPlane(ctx, gg, px0) {
    const s = 130 * PXP;
    const cy = altY(alt) + Math.sin(gg.t * 2.3) * 2;
    const vn = Kit.clamp(vy / 320, -1, 1);

    ctx.save();
    ctx.translate(px0, cy);
    ctx.rotate(-vn * 0.38);
    ctx.scale(1 - Math.abs(vn) * 0.12, 1 + Math.abs(vn) * 0.06);
    if (invuln > 0) ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(gg.t * 18));

    /* warm engine haze under the tail */
    const flick = Math.min(1, 0.7 + Math.random() * 0.3 + boostFx * 0.6);
    const eg = ctx.createRadialGradient(-s * 0.5, s * 0.05, 2, -s * 0.5, s * 0.05, s * 0.5);
    eg.addColorStop(0, `rgba(255,180,110,${0.35 * flick})`);
    eg.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.ellipse(-s * 0.5, s * 0.05, s * 0.5, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();

    /* far wing, swept up behind the hull */
    ctx.fillStyle = '#141B2E';
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.05);
    ctx.lineTo(-s * 0.52, -s * 0.34);
    ctx.lineTo(-s * 0.56, -s * 0.26);
    ctx.lineTo(s * 0.04, s * 0.02);
    ctx.closePath(); ctx.fill();

    /* fuselage */
    ctx.fillStyle = '#1C2438';
    ctx.strokeStyle = '#FFD08A';
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(s * 0.55, -s * 0.02);
    ctx.quadraticCurveTo(s * 0.28, -s * 0.14, -s * 0.1, -s * 0.12);
    ctx.quadraticCurveTo(-s * 0.48, -s * 0.1, -s * 0.55, -s * 0.04);
    ctx.quadraticCurveTo(-s * 0.4, s * 0.1, 0, s * 0.12);
    ctx.quadraticCurveTo(s * 0.4, s * 0.1, s * 0.55, -s * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    /* tail fin */
    ctx.fillStyle = '#1C2438';
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, -s * 0.08);
    ctx.lineTo(-s * 0.56, -s * 0.3);
    ctx.lineTo(-s * 0.6, -s * 0.06);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,138,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* canopy */
    ctx.fillStyle = 'rgba(138,212,255,0.4)';
    ctx.beginPath(); ctx.ellipse(s * 0.22, -s * 0.08, s * 0.14, s * 0.05, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(138,212,255,0.6)'; ctx.lineWidth = 1;
    ctx.stroke();

    /* near wing, long tiltwing swept down-forward */
    ctx.fillStyle = '#242E4A';
    ctx.strokeStyle = 'rgba(255,208,138,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.1, s * 0.03);
    ctx.lineTo(-s * 0.48, s * 0.3);
    ctx.lineTo(-s * 0.54, s * 0.22);
    ctx.lineTo(s * 0.02, -s * 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    /* tiltwing nacelle + spinning prop disc at the near wingtip */
    const nx = -s * 0.5, ny = s * 0.27;
    ctx.fillStyle = '#141B2E';
    roundRect(ctx, nx - s * 0.06, ny - s * 0.045, s * 0.14, s * 0.09, s * 0.04);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,208,138,${0.5 * flick})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(nx - s * 0.06, ny, s * 0.03, s * 0.16 * (0.7 + 0.3 * Math.sin(gg.t * 40)), 0, 0, Math.PI * 2);
    ctx.stroke();

    /* exhaust glow */
    ctx.globalAlpha = flick;
    ctx.fillStyle = boostFx > 0.3 ? '#FFE08B' : '#FFB06E';
    ctx.beginPath(); ctx.ellipse(-s * 0.56, s * 0.01, s * 0.06 * flick + 2, s * 0.03 * flick + 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = invuln > 0 ? 0.4 + 0.4 * Math.abs(Math.sin(gg.t * 18)) : 1;

    /* wingtip nav lights */
    ctx.fillStyle = '#8AD4FF';
    ctx.beginPath(); ctx.arc(-s * 0.52, -s * 0.3, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD08A';
    ctx.beginPath(); ctx.arc(-s * 0.5, s * 0.24, 1.8, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /* ---------------- HUD ---------------- */
  function buildHUD() {
    const hud = document.getElementById('hud');
    hud.innerHTML = `
      <div class="hud-top">
        <div class="chip speed-chip"><small>Speed</small><b id="hw-speed">0</b> km/h</div>
        <div class="chip"><small>Altitude</small><span id="hw-alt">0</span> m</div>
        <div class="chip streak-chip"><small>Ring streak</small><span class="acc" id="hw-streak">—</span></div>
        <div class="chip" style="min-width:120px"><small>Fuel</small><div class="meter fuel-meter"><i id="hw-fuel" style="width:100%"></i></div></div>
      </div>
      <div class="hud-bottom"><div class="chip"><small>Score</small><span id="hw-score">0</span> · <span id="hw-dist">0.0</span> km</div></div>`;
    hudEls = {
      speed: document.getElementById('hw-speed'),
      alt: document.getElementById('hw-alt'),
      streak: document.getElementById('hw-streak'),
      fuel: document.getElementById('hw-fuel'),
      score: document.getElementById('hw-score'),
      dist: document.getElementById('hw-dist')
    };
  }

  function updateHUD() {
    if (!hudEls || state !== 'flight') return;
    hudEls.speed.textContent = Math.round(speed * 0.55);
    hudEls.alt.textContent = Math.round(alt * 2.4);
    hudEls.streak.textContent = streak >= 3 ? `x${streakMult()} · ${streak}` : streak > 0 ? String(streak) : '—';
    hudEls.fuel.style.width = fuel + '%';
    hudEls.fuel.style.background = fuel < 25 ? '#FF8A5C' : '';
    hudEls.score.textContent = Kit.fmt(score);
    hudEls.dist.textContent = (totalDist / 520).toFixed(1);
  }

  /* ---------------- stage briefing card ---------------- */
  function showBriefing() {
    if (!(window.Learn && window.LEARN_DATA) || state !== 'flight') return;
    const card = Learn.nextCard();
    if (!card) return;
    Learn.show(card, {
      timer: 16,
      onOpen() { if (state === 'flight') G.pause(); },
      onClose() { if (state === 'flight') G.resume(); }
    }).then(ok => {
      if (ok && state === 'flight') {
        fuel = Math.min(100, fuel + 15);
        Audio.sfx('powerup');
        sparkle(camX + 60, alt, '#8AD4FF');
        Kit.toast('+15% fuel — clean read');
      }
      if (state === 'flight') G.resume();
    });
  }

  /* ---------------- audio helpers ---------------- */
  function windEnsure() {
    if (!windUp && Audio.unlocked) {
      Audio.loop('wind', WIND_OPTS);
      windUp = true;
    }
  }

  /* ---------------- songs ---------------- */
  Audio.defineSong('menu', {
    bpm: 88,
    bars: 2,
    layers: [
      { type: 'pad', wave: 'sawtooth', steps: 'A3 - - - - - - - - F3 - - - - - - - - C4 - - - - - - - - G3 - - - - -', gain: 0.13, cutoff: 700, attack: 0.6, release: 2 },
      { type: 'bass', wave: 'triangle', steps: 'A2 . . . . . . . F2 . . . . . . . C3 . . . . . . . G2 . . . . . . .', gain: 0.22 },
      { type: 'arp', wave: 'square', steps: 'A3 . C4 . E4 . C4 . F3 . A3 . C4 . A3 . C4 . E4 . G4 . E4 . G3 . B3 . D4 . B3 .', gain: 0.08, cutoff: 1800 },
      { type: 'hat', steps: '. . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a a', gain: 0.06 }
    ]
  });
  Audio.defineSong('flight', {
    bpm: 100,
    bars: 2,
    layers: [
      { type: 'pad', wave: 'sawtooth', steps: 'A3 - - - - - - - - F3 - - - - - - - - C4 - - - - - - - - G3 - - - - -', gain: 0.08, cutoff: 900, attack: 0.5, release: 1.8 },
      { type: 'bass', wave: 'triangle', steps: 'A2 A2 . A2 . A2 . . F2 F2 . F2 . F2 . . C3 C3 . C3 . C3 . . G2 G2 . G2 . G2 A2 .', gain: 0.26, cutoff: 620 },
      { type: 'kick', steps: 'a . . . . . . a . . . . a . . . a . . . . . . a . . . . a . a .', gain: 0.42 },
      { type: 'hat', steps: '. . a . . . a . . . a . . . a a . . a . . . a . . . a . a . a a', gain: 0.1 },
      { type: 'arp', wave: 'square', steps: 'A3 . E4 . A3 . C4 . F3 . C4 . F3 . A3 . C4 . G4 . C4 . E4 . G3 . D4 . G3 . B3 .', gain: 0.1, cutoff: 2000 },
      { type: 'lead', wave: 'sawtooth', steps: '. . . . . . . . . . . . . . . . A4 . . G4 . E4 . . C4 . D4 . E4 . .', gain: 0.13, cutoff: 2200, intensity: true }
    ]
  });

  /* ---------------- mascot + shell wiring ---------------- */
  const MASCOT_LINES = {
    welcome: [
      'Skye, your copilot. Mail run starts at first light — rings pay the bills.',
      'Morning, pilot. Canyon is calm... for now.'
    ],
    return: [
      'Winds are gentle today. She missed you.',
      'Coffee is hot, route is plotted. Whenever you are.'
    ],
    start: ['Throttle up — follow the gold.', 'Canyon mouth ahead. Fly the smooth line.'],
    streak: ['Ring streak alive — bonus pay!', 'That is a mail-run record pace.'],
    lowfuel: ['Fuel is getting thin — hunt a canister.', 'Tank is low. The parachute drops are glowing ahead.'],
    hit: ['Rock strike! Hull holding... barely.', 'That spire came out of nowhere. Shake it off.'],
    stage: ['Entering new skies — look at that light.', 'Airspace change. Weather is on our side.'],
    win: ['Mail delivered. Every ring but one — nearly perfect.', 'Smooth landing pattern. Command will notice.'],
    fail: ['Engine is cold... refuel and we go again.', 'Every pilot smells the dirt sometimes. Wings are fine.']
  };

  window.GAME = {
    id: 'aurora-pilot',
    brand: 'AURORA PILOT',
    kicker: 'Dawn Canyon Air Route',
    title: 'AURORA <em>PILOT</em>',
    tagline: 'Fly the mail run through the canyon at first light — thread the golden rings, keep the tanks fed, and ride the sunrise through four skies.',
    best: { key: 'aurora.best', display: Kit.fmt },
    controls: [
      { key: 'W / S · Shift', text: '<b>Pitch up / down</b> with arrows, W/S or the stick. Thrust has inertia — ease into climbs, since steep climbing bleeds speed and a stall makes her wallow. <b>Shift / BOOST</b> fires a two-second throttle surge: extra burn, extra speed, nose self-levels.' },
      { key: 'Rings', text: '<b>Fly through the golden rings.</b> +10 each, and consecutive rings stack a streak up to x5. Miss one and the streak resets.' },
      { key: 'Fuel', text: '<b>Ninety seconds per tank.</b> Catch the parachute canisters for +25%. Run dry and the engine cuts — a long quiet glide home.' },
      { key: 'Hull', text: '<b>Three strikes.</b> Stone spires and arches cost heavy speed and hull. Skim a bird flock close for a +5 close call.' },
      { key: 'Stages', text: '<b>Every 60 seconds</b> the sky turns — dawn to bright day to dusk to starry night. New light, same mail.' }
    ],
    touch: {
      joy: true,
      buttons: [{ name: 'boost', label: 'BOOST', primary: true }]
    },
    mascot: {
      name: 'Skye — copilot',
      accent: '#8AD4FF',
      lines: MASCOT_LINES,
      cooldowns: { streak: 9000, lowfuel: 12000, hit: 7000, stage: 20000 }
    },
    learn: {
      intro: window.LEARN_DATA.intro,
      banks: window.LEARN_DATA.banks
    },
    learn: {
      intro: window.LEARN_DATA.intro,
      banks: window.LEARN_DATA.banks
    },
    menuSong: 'menu',
    gameSong: 'flight',
    onStart() { buildHUD(); startFlight(); G.resume(); Kit.showScreen('hud'); },
    onRestart() { buildHUD(); startFlight(); G.resume(); },
    onPause() { G.pause(); Audio.stopLoop('wind'); windUp = false; },
    onResume() { if (state === 'flight') { windEnsure(); G.resume(); } },
    onQuit() { G.stop(); Audio.stopLoop('wind'); windUp = false; toAttract(); G.start(); }
  };

  /* ---------------- boot ---------------- */
  const canvas = document.getElementById('stage');
  G = Kit.game({
    canvas,
    onResize(dim) {
      W.w = dim.w; W.h = dim.h;
      vig = null;
    },
    update,
    render
  });

  buildScenery();
  toAttract();
  G.start();

})();
