// Snow Day live graphics engine for FieldStation42.
//
// Loaded once by the persistent graphics window (fs42/graphics_engine.py). The player calls
// window.fs42Graphics.cue({cue, duration, network}) when a break bumper starts and
// window.fs42Graphics.stop() when it ends. Everything is decided at air time from the live schedule:
//   cue=pre   into a break:  we'll be right back / stay tuned for more <show> / trivia / countdown / lineup ...
//   cue=post  out of a break: "now back to <show>" if the show continues, else "up next <show> at <time>"
// Page options (query string): stretch=1 fills the whole screen (CRT: 720x480 shown as 4:3),
// otherwise the 640x480 design is letterboxed to 4:3.
(() => {
  const qs = new URLSearchParams(location.search);
  const STRETCH = qs.get('stretch') === '1';
  const TEMPLATES = ['SnowBG', 'SnowWordmark', 'BumpBRB', 'BumpBackTo', 'BumpComingUp', 'BumpCountdown', 'BumpID',
    'BumpLineup', 'BumpMerry', 'BumpMovie', 'BumpSting', 'BumpTrivia', 'BumpUpNext', 'BumpUpNextThen'];
  const CYCLE = /Cycle$/;
  const TAIL = 0.3; // seconds of rest after the out-animation
  const REFRESH_MS = 20000;

  const sources = {};
  let cfg = { shows: {}, movies: [], facts: [], genericTeases: [], ids: [], themes: ['night'] };
  const schedules = {}; // network -> blocks (cached, refreshed in the background)
  let lastTemplate = null;
  let ready = false;
  let pending = null;

  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const pad = n => String(n).padStart(2, '0');
  const apiTime = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const clock = d => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;
  const showName = block => (block && (cfg.shows[block.content && block.content.tag] || block.title)) || '';

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

  function sleepsTillChristmas(now) {
    if (now.getMonth() !== 11 || now.getDate() > 24) return null;
    return 25 - now.getDate();
  }

  // Pick a template + props for this cue.
  function choose(cue, ctx) {
    const theme = rnd(cfg.themes);
    const cur = showName(ctx.cur), next = showName(ctx.next), then = showName(ctx.then);
    const options = [];
    const add = (w, template, props) => { if (template !== lastTemplate || options.length === 0) options.push({ w, template, props: { theme, ...props } }); };
    if (cue === 'post') {
      if (ctx.cur && ctx.continuesShow) {
        add(6, 'BumpBackTo', { showName: cur, label: rnd(['NOW BACK TO', 'AND NOW, BACK TO', 'WELCOME BACK TO', 'RETURNING TO']) });
        add(1, 'BumpSting', {});
      } else if (ctx.next) {
        add(4, 'BumpUpNext', { showName: next, time: clock(ctx.next.start), label: rnd(['up next!', 'coming up!', 'next on snow day']) });
        if (ctx.then) add(2, 'BumpUpNextThen', { showName: next, time: clock(ctx.next.start), thenName: then, thenTime: clock(ctx.then.start) });
      } else {
        add(1, 'BumpSting', {});
      }
    } else {
      add(3, 'BumpBRB', { line: rnd(["we'll be right back!", "don't go anywhere!", 'back in a jingle!', 'stay cozy, back soon!']), art: rnd(['gift', 'cocoa', 'snowman', 'tree']) });
      if (ctx.cur && ctx.continuesShow) add(2, 'BumpComingUp', { header: rnd(['stay tuned!', "don't touch that dial!", 'more after this!', 'stick around!']), tease: 'more ' + cur });
      else if (ctx.next) add(2, 'BumpComingUp', { header: rnd(['stay tuned!', 'stick around!']), tease: next + ' is next' });
      if (cfg.facts.length) add(2, 'BumpTrivia', { fact: rnd(cfg.facts), header: rnd(['did you know?', 'snow day fact!', 'holiday fun fact']) });
      const sleeps = sleepsTillChristmas(ctx.now);
      if (sleeps !== null) add(3, 'BumpCountdown', { sleeps });
      add(1, 'BumpMerry', { greeting: rnd(['merry christmas!', 'happy holidays!', "season's greetings!"]) });
      if (cfg.ids.length) add(1, 'BumpID', { tag: rnd(cfg.ids) });
      const later = ctx.upcoming.slice(0, 4);
      if (later.length >= 3) add(1, 'BumpLineup', { header: ctx.now.getHours() >= 16 ? 'coming up tonight' : 'today on snow day', lineup: later.map(b => `${clock(b.start)}=${showName(b)}`).join('|') });
      const movie = ctx.upcoming.find(b => b.content && cfg.movies.includes(b.content.tag) && b.start.toDateString() === ctx.now.toDateString());
      if (movie) add(2, 'BumpMovie', { movieTitle: showName(movie), when: (movie.start.getHours() >= 17 ? 'tonight at ' : 'today at ') + clock(movie.start) });
    }
    const total = options.reduce((s, o) => s + o.w, 0);
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

  function play(choice, durationSec) {
    SD.mount(sources, choice.template, { ...choice.props, crt: false, safe: false, showChecker: false });
    const content = document.body.firstElementChild;
    document.body.innerHTML = '';
    const stage = document.createElement('div');
    stage.id = 'stage';
    stage.appendChild(content);
    document.body.appendChild(stage);
    fitStage(stage);
    SD.fitText();
    // play each in/hold/out *Cycle once, stretched to fill the slot; snow and twinkles keep looping
    let cycleEnd = 0;
    const cycles = document.getAnimations().filter(a => CYCLE.test(a.animationName || ''));
    for (const a of cycles) {
      const t = a.effect.getTiming();
      cycleEnd = Math.max(cycleEnd, (t.delay || 0) + t.duration);
    }
    const rate = cycleEnd && durationSec ? cycleEnd / 1000 / Math.max(1, durationSec - TAIL) : 1;
    for (const a of cycles) {
      a.effect.updateTiming({ iterations: 1, fill: 'both' });
      a.playbackRate = rate;
      a.currentTime = 0;
      a.play();
    }
    lastTemplate = choice.template;
  }

  function cue(c) {
    if (!ready) { pending = c; return; }
    const network = c.network;
    const ctx = context(network);
    const choice = choose(c.cue, ctx);
    play(choice, Number(c.duration) || 7);
    window.__lastChoice = choice;
    refresh(network); // keep the cache fresh for the next cue
  }

  function stop() {
    document.body.innerHTML = '';
  }

  window.fs42Graphics = { cue, stop, refresh, get ready() { return ready; } };

  (async () => {
    await Promise.all(TEMPLATES.map(async n => { sources[n] = await (await fetch(`templates/${n}.dc.html`)).text(); }));
    try { cfg = { ...cfg, ...(await (await fetch('channel.json')).json()) }; } catch (e) { /* defaults */ }
    await Promise.all(['800 40px "Baloo 2"', '700 20px "Baloo 2"', '800 20px Nunito', '700 20px Nunito'].map(f => document.fonts.load(f)));
    const networks = (qs.get('networks') || '').split(',').filter(Boolean);
    await Promise.all(networks.map(refresh));
    setInterval(() => Object.keys(schedules).forEach(refresh), REFRESH_MS);
    ready = true;
    if (pending) { const p = pending; pending = null; cue(p); }
  })();
})();
