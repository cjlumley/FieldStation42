// Shared live graphics engine for FieldStation42 bumper packs (Snow Day, ...).
//
// Each pack lives in static/<pack>/ with engine.html (its @font-face block + script tags pointing here),
// templates/*.dc.html, fonts/ and channel.json. The page is loaded once by the persistent graphics window
// (fs42/graphics_engine.py); relative fetches ('channel.json', 'templates/...') resolve to the pack folder.
//
// The player calls window.fs42Graphics.cue({cue, duration, network}) when a break bumper starts and
// window.fs42Graphics.stop() when it ends. The pack's channel.json says which templates can air on each cue,
// with what weights, wording and conditions; this file only knows about the schedule:
//   cue=pre   into a break   cue=post  out of a break
// Page options (query string): stretch=1 fills the whole screen (CRT: 720x480 shown as 4:3),
// otherwise the 640x480 design is letterboxed to 4:3. networks=a,b preloads those schedules.
//
// channel.json schema: see docs/LIVE_BUMPER_PACKS.md ("channel.json schema").
(() => {
  const qs = new URLSearchParams(location.search);
  const STRETCH = qs.get('stretch') === '1';
  const CYCLE = /Cycle$/;
  const TAIL = 0.3; // seconds of rest after the out-animation
  const REFRESH_MS = 20000;
  const MISSING = Symbol('missing'); // a prop needs schedule data that isn't there: skip the entry
  const PLACEHOLDER = /\{(\w+)(?::([\w-]+))?\}/g;
  const ONLY_PLACEHOLDER = /^\{(\w+)(?::([\w-]+))?\}$/;

  const sources = {};
  const templateOpts = {}; // template name -> { naturalSpeed }
  let cfg = {
    shows: {}, movies: [], themes: [], templates: [], fonts: [],
    cues: { pre: [], post: [] },
    lineup: { size: 4, min: 3 },
    baseProps: { crt: false, safe: false, showChecker: false },
  };
  const schedules = {}; // network -> blocks (cached, refreshed in the background)
  let lastTemplate = null;
  let ready = false;
  let pending = null;
  let markReady;
  const whenReady = new Promise(r => { markReady = r; });

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const pad = n => String(n).padStart(2, '0');
  const apiTime = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const clock = d => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
  // Clip-show blocks (two short cartoons per slot) have a list as content and the FS42 tag as their title.
  const blockTag = block => {
    const c = block && block.content;
    return (c && (c.tag || (Array.isArray(c) && c[0] && c[0].tag))) || (block && block.title);
  };
  const showName = block => (block && (cfg.shows[blockTag(block)] || cfg.shows[block.title] || block.title)) || '';

  async function refresh(network) {
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 6 * 3600 * 1000);
      const r = await fetch(`/schedules/${encodeURIComponent(network)}?start=${apiTime(new Date(now.getTime() - 4 * 3600 * 1000))}&end=${apiTime(end)}`);
      if (r.ok) schedules[network] = ((await r.json()).schedule_blocks || [])
        .map(b => ({ ...b, start: new Date(b.start_time), end: new Date(b.end_time) }))
        .sort((a, b) => a.start - b.start);
    } catch (e) { /* keep the old cache */ }
  }

  // Where are we in the schedule right now?
  function context(network) {
    const blocks = schedules[network] || [];
    const now = new Date();
    const i = blocks.findIndex(b => b.start <= now && now < b.end);
    const cur = i >= 0 ? blocks[i] : null;
    const upcoming = blocks.filter(b => b.start > now);
    let continuesShow = false;
    if (cur && cur.plan) {
      // find the plan entry airing now (this bumper), then check whether any show content follows it
      const elapsed = (now - cur.start) / 1000 + 0.5;
      let acc = 0, idx = cur.plan.length - 1;
      for (let k = 0; k < cur.plan.length; k++) {
        acc += Number(cur.plan[k].duration) || 0;
        if (elapsed < acc) { idx = k; break; }
      }
      continuesShow = cur.plan.slice(idx + 1).some(e => e.content_type === 'feature');
    }
    return { cur, next: upcoming[0] || null, then: upcoming[1] || null, upcoming, now, continuesShow };
  }

  // Schedule-driven values for {placeholders}. null = not available right now.
  function scheduleValues(ctx) {
    const lineup = ctx.upcoming.slice(0, cfg.lineup.size);
    const today = ctx.now.toDateString();
    const movie = ctx.upcoming.find(b => b.content && cfg.movies.includes(b.content.tag) && b.start.toDateString() === today) || null;
    const name = b => (b ? showName(b) : null);
    const time = b => (b ? clock(b.start) : null);
    return {
      values: {
        cur: name(ctx.cur), curTime: time(ctx.cur),
        next: name(ctx.next), nextTime: time(ctx.next),
        then: name(ctx.then), thenTime: time(ctx.then),
        movie: name(movie), movieTime: time(movie),
        lineup: lineup.length >= cfg.lineup.min ? lineup.map(b => `${clock(b.start)}=${showName(b)}`).join('|') : null,
      },
      hours: { now: ctx.now, cur: ctx.cur && ctx.cur.start, next: ctx.next && ctx.next.start, then: ctx.then && ctx.then.start, movie: movie && movie.start },
      ctx,
    };
  }

  const CONDITIONS = {
    continues: s => !!(s.ctx.cur && s.ctx.continuesShow), // the current show resumes after this break
    cur: s => s.values.cur != null,
    next: s => s.values.next != null,
    then: s => s.values.then != null,
    lineup: s => s.values.lineup != null,
    movie: s => s.values.movie != null, // a movie (channel.json "movies") starts later today
  };

  function condition(name, s) {
    const neg = name.startsWith('!');
    const fn = CONDITIONS[neg ? name.slice(1) : name];
    if (!fn) { console.warn('bumpengine: unknown condition', name); return false; }
    return neg ? !fn(s) : fn(s);
  }

  const monthDay = s => { const [m, d] = String(s).split('-').map(Number); return m * 100 + d; };
  function inDates(range, now) {
    const md = (now.getMonth() + 1) * 100 + now.getDate();
    const from = monthDay(range[0]), to = monthDay(range[1] || range[0]);
    return from <= to ? md >= from && md <= to : md >= from || md <= to; // a range can wrap over New Year
  }
  // whole days from today until the next MM-DD (0 on the day itself)
  function daysUntil(mmdd, now) {
    const [m, d] = String(mmdd).split('-').map(Number);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let target = new Date(now.getFullYear(), m - 1, d);
    if (target < today) target = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((target - today) / 86400000);
  }

  function placeholder(key, arg, s) {
    if (key === 'days') return arg ? daysUntil(arg, s.ctx.now) : MISSING;
    const v = s.values[key];
    return v == null ? MISSING : v;
  }

  function fill(str, s) {
    const only = str.match(ONLY_PLACEHOLDER);
    if (only) { const v = placeholder(only[1], only[2], s); if (v === MISSING) throw MISSING; return v; }
    return str.replace(PLACEHOLDER, (_, key, arg) => { const v = placeholder(key, arg, s); if (v === MISSING) throw MISSING; return String(v); });
  }

  // A prop spec: "text {placeholder}" | ["one", "of", "these"] | {"pick": "<channel.json list>"} |
  // {"byHour": {"0": spec, "16": spec}, "of": "now|cur|next|then|movie"} | number | boolean
  function resolve(spec, s) {
    if (Array.isArray(spec)) return resolve(rnd(spec), s);
    if (spec && typeof spec === 'object') {
      if ('pick' in spec) return resolve(rnd(cfg[spec.pick] || []), s);
      if ('byHour' in spec) {
        const at = s.hours[spec.of || 'now'];
        if (!at) throw MISSING;
        const h = at.getHours();
        let chosen;
        for (const k of Object.keys(spec.byHour).map(Number).sort((a, b) => a - b)) if (k <= h) chosen = spec.byHour[k];
        if (chosen === undefined) throw MISSING;
        return resolve(chosen, s);
      }
      return spec;
    }
    return typeof spec === 'string' ? fill(spec, s) : spec;
  }

  // channel.json lists a prop draws from with {"pick": ...}; an empty one makes the entry ineligible
  function picks(spec, out = []) {
    if (Array.isArray(spec)) spec.forEach(x => picks(x, out));
    else if (spec && typeof spec === 'object') {
      if ('pick' in spec) out.push(spec.pick);
      else if ('byHour' in spec) Object.values(spec.byHour).forEach(x => picks(x, out));
    }
    return out;
  }

  function eligible(entry, s) {
    const when = entry.when == null ? [] : [].concat(entry.when);
    if (!when.every(c => condition(c, s))) return false;
    if (entry.dates && !inDates(entry.dates, s.ctx.now)) return false;
    return entry._picks.every(name => (cfg[name] || []).length > 0);
  }

  // Pick a template + props for this cue from the pack's channel.json "cues".
  function choose(cue, ctx) {
    const theme = rnd(cfg.themes);
    const s = scheduleValues(ctx);
    const options = [];
    for (const entry of cfg.cues[cue] || []) {
      if (!eligible(entry, s)) continue;
      const props = {};
      try {
        for (const [k, spec] of Object.entries(entry.props || {})) props[k] = resolve(spec, s);
      } catch (e) {
        if (e === MISSING) continue;
        throw e;
      }
      // same template never twice in a row (the first eligible entry is always kept, so a cue is never empty)
      if (entry.template !== lastTemplate || options.length === 0) {
        options.push({ w: entry.weight == null ? 1 : Number(entry.weight), template: entry.template, props: { theme, ...props } });
      }
    }
    if (!options.length) return null;
    const total = options.reduce((t, o) => t + o.w, 0);
    let r = Math.random() * total;
    for (const o of options) { if ((r -= o.w) <= 0) return o; }
    return options[options.length - 1];
  }

  function fitStage(stage) {
    const sx = innerWidth / 640, sy = innerHeight / 480;
    if (STRETCH) {
      stage.style.transform = `scale(${sx}, ${sy})`;
    } else {
      const s = Math.min(sx, sy);
      stage.style.transform = `translate(${(innerWidth - 640 * s) / 2}px, ${(innerHeight - 480 * s) / 2}px) scale(${s})`;
    }
  }

  function play(choice, durationSec, props) {
    SD.mount(sources, choice.template, props);
    const content = document.body.firstElementChild;
    document.body.innerHTML = '';
    const stage = document.createElement('div');
    stage.id = 'stage';
    stage.appendChild(content);
    document.body.appendChild(stage);
    fitStage(stage);
    SD.fitText();
    // play each in/hold/out *Cycle once, stretched to fill the slot; snow and twinkles keep looping.
    // naturalSpeed templates (short stings) never play slower than designed, then hold their last frame.
    let cycleEnd = 0;
    const cycles = document.getAnimations().filter(a => CYCLE.test(a.animationName || ''));
    for (const a of cycles) {
      const t = a.effect.getTiming();
      cycleEnd = Math.max(cycleEnd, (t.delay || 0) + t.duration);
    }
    let rate = cycleEnd && durationSec ? cycleEnd / 1000 / Math.max(1, durationSec - TAIL) : 1;
    if ((templateOpts[choice.template] || {}).naturalSpeed) rate = Math.max(1, rate);
    for (const a of cycles) {
      a.effect.updateTiming({ iterations: 1, fill: 'both' });
      a.playbackRate = rate;
      a.currentTime = 0;
      a.play();
    }
    return rate;
  }

  function cue(c) {
    if (!ready) { pending = c; return; }
    const network = c.network;
    const ctx = context(network);
    const choice = choose(c.cue, ctx);
    if (choice) {
      play(choice, Number(c.duration) || 7, { ...choice.props, ...cfg.baseProps });
      lastTemplate = choice.template;
    } else {
      console.warn('bumpengine: nothing to show for cue', c.cue);
      stop();
    }
    window.__lastChoice = choice;
    refresh(network); // keep the cache fresh for the next cue
  }

  // Debug/screenshot hook: mount and play one template with the given props (props win over baseProps).
  async function preview(template, props, durationSec) {
    await whenReady;
    if (!sources[template]) throw new Error('bumpengine: template not loaded (not in channel.json "templates"?): ' + template);
    const choice = { template, props: { theme: rnd(cfg.themes), ...(props || {}) } };
    const rate = play(choice, Number(durationSec) || 7, { ...cfg.baseProps, ...choice.props });
    return { ...choice, rate };
  }

  function stop() {
    document.body.innerHTML = '';
  }

  // The window is hidden (small) when a cue arrives and goes full screen a moment later,
  // so re-fit the stage whenever the window size changes.
  function refit() {
    const stage = document.getElementById('stage');
    if (stage) fitStage(stage);
  }
  window.addEventListener('resize', refit);

  window.fs42Graphics = {
    cue, stop, refresh, refit, preview, whenReady,
    get ready() { return ready; },
    // for tests: choose()/context() without playing anything
    debug: { choose, context, schedules, get config() { return cfg; }, get lastTemplate() { return lastTemplate; }, set lastTemplate(t) { lastTemplate = t; } },
  };

  (async () => {
    try {
      const loaded = await (await fetch('channel.json')).json();
      cfg = { ...cfg, ...loaded, lineup: { ...cfg.lineup, ...(loaded.lineup || {}) } };
    } catch (e) { console.error('bumpengine: could not load channel.json', e); }
    const names = [];
    for (const t of cfg.templates || []) {
      const name = typeof t === 'string' ? t : t.name;
      if (!name) continue;
      names.push(name);
      templateOpts[name] = typeof t === 'string' ? {} : t;
    }
    await Promise.all(names.map(async n => {
      try {
        const r = await fetch(`templates/${n}.dc.html`);
        if (r.ok) sources[n] = await r.text(); else console.error('bumpengine: missing template', n);
      } catch (e) { console.error('bumpengine: could not load template', n, e); }
    }));
    // only templates channel.json lists (and that loaded) can ever be chosen
    const cues = {};
    for (const [name, entries] of Object.entries(cfg.cues || {})) {
      cues[name] = (entries || []).filter(e => {
        if (sources[e.template]) return true;
        console.warn('bumpengine: dropping cue entry for unlisted/missing template', e.template);
        return false;
      }).map(e => ({ ...e, _picks: picks(Object.values(e.props || {})) }));
    }
    cfg.cues = cues;
    await Promise.all((cfg.fonts || []).map(f => document.fonts.load(f).catch(() => {})));
    const networks = (qs.get('networks') || '').split(',').filter(Boolean);
    await Promise.all(networks.map(refresh));
    setInterval(() => Object.keys(schedules).forEach(refresh), REFRESH_MS);
    ready = true;
    markReady();
    if (pending) { const p = pending; pending = null; cue(p); }
  })();
})();
