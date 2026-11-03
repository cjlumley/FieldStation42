# Live bumper packs for the CRT TV (FieldStation42): handoff for the design side

## What happened to the Snow Day pack

The Snow Day pack began as a **render kit**: `channel.json` → `build-library.mjs` → `render.mjs` → about 185 MP4 clips in FS42 bump folders.
On the Pi it now runs **live** instead, with no pre-rendered video:

- The `.dc.html` templates and the woff2 fonts were copied into FieldStation42 at
  `fs42/fs42_server/static/snowday/` (`templates/`, `fonts/`), with an `engine.html` and a `channel.json` alongside them.
- The engine itself is shared by every pack: `static/bumpengine/engine.js` plus the kit's `lib/runtime.js` (`static/bumpengine/runtime.js`).
- The player keeps **one hidden full-screen browser window** (QtWebEngine) open with `engine.html` loaded.
- Every commercial break in the schedule now has two cue slots, each 7 s long by default:
  - **`pre`** goes at the start of the break ("into break").
  - **`post`** goes at the end of the break ("out of break").
- When a cue airs, the player pauses the video, calls `window.fs42Graphics.cue({cue, duration, network})`, and shows the window, which takes about 0.1 s.
  The engine reads the **live schedule** (current show, next shows and their real start times), picks a template, fills in its props,
  plays it, and the window hides when the next video starts.
- So the pack ships as **templates plus a config**. Show names, times, lineups and countdowns are filled in at air time from the schedule.
  The MP4 render path still works, but it's only a fallback.

## How the engine picks a template (current Snow Day logic)
All of this now lives in `snowday/channel.json` → `cues` (see the schema below). The shared engine only supplies the schedule facts.

**`post` (out of break):**
- If the current show continues after this break: `BumpBackTo` {showName, label} (weight 6) or `BumpSting` {} (weight 1).
- If the show has ended (the break after it): `BumpUpNext` {showName, time, label} (weight 4), or `BumpUpNextThen` {showName, time, thenName, thenTime} (weight 2).

**`pre` (into break):** a weighted random pick from:
- `BumpBRB` {line, art} (3)
- `BumpComingUp` {header, tease}, where tease is "more <show>" or "<next show> is next" (2)
- `BumpTrivia` {fact, header} (2)
- `BumpCountdown` {sleeps}, Dec 1–24 only, computed from today's date (3)
- `BumpMerry` {greeting} (1)
- `BumpID` {tag} (1)
- `BumpLineup` {header, lineup}, the next 4 shows as `"7:30=Show|8:00=Show"` (1)
- `BumpMovie` {movieTitle, when}, when a movie airs later today (2)

Every template also gets `theme` (random from the config's `themes`) plus `crt:false, safe:false, showChecker:false`.
The same template never plays twice in a row, except when it's the first eligible entry in the list
(so "now back to" can repeat when the alternative is a sting, exactly as before).

Show names come from `channel.json` → `shows` (FS42 tag → on-screen name). Times are formatted as `7:30` (12-hour, no am/pm).

## Rules a pack must follow for the live engine

### Files
- **One folder per channel**, named after the engine, e.g. `snowday/`:
  `templates/*.dc.html`, `fonts/*.woff2`, `channel.json`, `engine.html`.
- No `engine.js` or `runtime.js` in the pack: both are shared, in `static/bumpengine/`.
- **Fonts must be bundled as woff2** and declared with `@font-face` in `engine.html`.
  The runtime **skips Google Fonts `<link>`s** (the Pi plays offline), so any font that isn't bundled falls back to a system font.

### Template format (what `runtime.js` supports, and nothing else)
- `<x-dc>` with a `<helmet>` (styles) and one root element, plus `<script type="text/x-dc" data-dc-script data-props='{…}'>`
  defining `class Component extends DCLogic { renderVals() {…} }`.
- Supported in markup: `{{holes}}`, `<sc-if value="{{x}}">`, `<sc-for list="{{xs}}" as="item">`, and `<dc-import name="Other" prop="…">`.
  Prop defaults and types come from `data-props` (`editor: text|enum|int|number|boolean`).
- **Helmet CSS is global.** Each template's helmet is added to the page once and stays for the whole session, so every `@keyframes`
  and class name is shared by all templates. Either reuse identical definitions everywhere (Snow Day does this) or give each one a unique name.
- Long text: put `data-fit="N"` on an element with a fixed width, and it shrinks (down to 18 px minimum) until it fits on N lines.

### Canvas and CRT rules
- **640×480 design (4:3).** On the CRT it's stretched to the 720×480 composite frame, which the tube shows as 4:3, so circles stay round.
  On a 16:9 TV it's pillarboxed.
- **Title-safe area: x 64–576, y 48–432.** Keep all text and logos inside it. Decoration can run to the edges, because overscan hides 5–10%.
- **Text never under 18 px**, chunky weights, **no hairline strokes, 1 px lines or fine stripes** (they flicker at 480i interlace).
- Be careful with large areas of saturated red (it blooms on composite). Strong contrast and outlines/shadows on text read best.
- **No video or audio inside templates.** Audio comes from FS42, and the graphic plays silently over the paused show.

### Animation timing (important)
- Each template has **one in → hold → out animation whose name ends in `Cycle`** (e.g. `@keyframes popCycle`), on one or more elements.
- The engine plays every `…Cycle` animation **once**, at a speed that makes it **end 0.3 s before the slot ends**.
  The slot is 7 s by default, so **design each cycle at about 7 s** so it plays at about normal speed.
  An 8 s cycle plays about 19% faster, and a 4 s one about 40% slower.
  For a short sting that should keep its own speed, mark it `naturalSpeed` in `channel.json`. It then holds its last frame, so end the cycle on a frame that looks fine held.
- The in-animation should finish within about 1 s, and the out-animation should start about 1–1.5 s before the end.
- Looping ambience (snow, twinkles, sways) must **not** end in `Cycle`. It just loops the whole time.
- All `…Cycle` animations in a template should share a length, because the longest one sets the timing.

### Prop contract (keep these names, so the engine can fill every pack)
| Template | Cue | Props the engine sends |
|---|---|---|
| `BumpBRB` | pre | `line`, `art`, `theme` |
| `BumpComingUp` | pre | `header`, `tease`, `theme` |
| `BumpTrivia` | pre | `fact`, `header`, `theme` |
| `BumpID` | pre | `tag`, `theme` |
| `BumpLineup` | pre | `header`, `lineup` (`"h:mm=Name|h:mm=Name"`, up to 4), `theme` |
| `BumpMovie` | pre | `movieTitle`, `when` (e.g. "tonight at 8:00"), `label`, `theme` |
| `BumpBackTo` | post | `showName`, `label`, `theme` |
| `BumpUpNext` | post | `showName`, `time` (`h:mm`, or empty for "right after this"), `label`, `theme` |
| `BumpUpNextThen` | post | `showName`, `time`, `thenName`, `thenTime`, `theme` |
| `BumpSting` | post | `theme` (3–4 s logo hit) |
| *(seasonal, optional)* `BumpCountdown` / `BumpMerry` / `BumpSignOff` | pre | `sleeps` / `greeting` / `mode`, `backAt` |

Plus the shared pieces that templates `dc-import`: a background with a `theme` prop and several themes (Snow Day: `SnowBG`, 5 themes)
and a wordmark/logo (Snow Day: `SnowWordmark`). Name them per channel (e.g. `<Brand>BG`, `<Brand>Wordmark`).
Every `theme` value must be listed in `channel.json` → `themes`.

Show names can be long, e.g. "How the Grinch Stole Christmas!" or "Home Alone 2: Lost in New York", so every name slot needs `data-fit`.

### engine.html (per pack)
Copy `snowday/engine.html`, then change the title and the `@font-face` lines. Keep the two script tags:
```html
<script src="../bumpengine/runtime.js"></script>
<script src="../bumpengine/engine.js"></script>
```
`channel.json` and `templates/` are fetched relative to the page, so they come from the pack's own folder.

### channel.json schema (per pack)
```json
{
  "templates": ["SnowBG", "SnowWordmark", "BumpBRB", {"name": "BumpSting", "naturalSpeed": true}],
  "fonts": ["800 40px \"Baloo 2\"", "700 20px Nunito"],
  "themes": ["plaid", "night", "lights"],
  "cues": {
    "post": [
      {"template": "BumpBackTo", "weight": 6, "when": "continues",
       "props": {"showName": "{cur}", "label": ["NOW BACK TO", "WELCOME BACK TO"]}},
      {"template": "BumpUpNext", "weight": 4, "when": ["!continues", "next"],
       "props": {"showName": "{next}", "time": "{nextTime}", "label": ["up next!", "coming up!"]}},
      {"template": "BumpSting", "weight": 1, "when": ["!continues", "!next"]}
    ],
    "pre": [
      {"template": "BumpBRB", "weight": 3, "props": {"line": ["we'll be right back!"], "art": ["gift", "cocoa"]}},
      {"template": "BumpTrivia", "weight": 2, "props": {"fact": {"pick": "facts"}, "header": ["did you know?"]}},
      {"template": "BumpCountdown", "weight": 3, "dates": ["12-01", "12-24"], "props": {"sleeps": "{days:12-25}"}},
      {"template": "BumpLineup", "weight": 1, "when": "lineup",
       "props": {"header": {"byHour": {"0": "today on snow day", "16": "coming up tonight"}}, "lineup": "{lineup}"}},
      {"template": "BumpMovie", "weight": 2, "when": "movie",
       "props": {"movieTitle": "{movie}", "when": {"byHour": {"0": "today at {movieTime}", "17": "tonight at {movieTime}"}, "of": "movie"}}}
    ]
  },
  "lineup": {"size": 4, "min": 3},
  "baseProps": {"crt": false, "safe": false, "showChecker": false},
  "shows":  {"<fs42_tag>": "On-screen Name"},
  "movies": ["<fs42_tag>"],
  "facts":  ["trivia line"],
  "ids":    ["all December · channel 12"]
}
```
`snowday/channel.json` is the full working example.

**Top-level keys**
- `templates`: every template to load, shared pieces included (BG, wordmark). A plain name, or `{"name", "naturalSpeed": true}`.
  **A template that isn't listed is never chosen**, even if a cue entry names it.
- `naturalSpeed: true`: the template's `…Cycle` animations play at their designed speed (never slowed down to fill the slot)
  and then hold their last frame. Use it for short stings (e.g. a 4 s logo hit). They still speed up if the cycle is longer than the slot.
- `fonts`: CSS font strings the engine waits for before it's ready (`document.fonts.load`). List every weight the templates use.
- `themes`: every bumper gets a random one as its `theme` prop.
- `cues.pre` / `cues.post`: the entries that can air on that cue (below).
- `lineup`: `size` = how many upcoming shows go in `{lineup}` (default 4). `min` = how many are needed for the `lineup` condition (default 3).
- `baseProps`: added to every bumper on air, overriding the entry's props (default `crt`/`safe`/`showChecker` all false).
- `shows`, `movies`: FS42 tag → on-screen name, and the tags that count as movies. Names fall back to the schedule title.
- Any other array (`facts`, `ids`, `genericTeases`, ...) is a word list that props can draw from with `{"pick": "<key>"}`.

**A cue entry**
- `template`: the template name. `weight`: relative chance (default 1).
- `when` (optional): a condition name or a list, all must hold. Put `!` in front to negate. Built in:
  - `continues`: the current show resumes after this break.
  - `cur`, `next`, `then`: there's a current / next / following show.
  - `lineup`: at least `lineup.min` upcoming shows.
  - `movie`: a movie (`movies`) starts later today.
- `dates` (optional): `["MM-DD", "MM-DD"]`, inclusive. The entry only airs on those days. It can wrap over New Year (`["12-20", "01-05"]`).
- `props`: template prop → value spec:
  - `"text {placeholder}"`: fills in schedule values. A string that is only one placeholder keeps its type (e.g. a number).
  - `["a", "b", "c"]`: one picked at random each time (each one can have placeholders).
  - `{"pick": "facts"}`: random line from that top-level list. If the list is empty, the entry is skipped.
  - `{"byHour": {"0": spec, "16": spec}, "of": "now"}`: uses the spec with the highest hour ≤ the hour of `of`
    (`now` by default, or `cur` / `next` / `then` / `movie` for that show's start time).
  - Numbers and booleans pass through unchanged.
- Placeholders: `{cur}`, `{next}`, `{then}`, `{movie}` (on-screen names), `{curTime}`, `{nextTime}`, `{thenTime}`, `{movieTime}`
  (`7:30` format), `{lineup}` (`"7:30=Show|8:00=Show"`), and `{days:MM-DD}` (whole days until that date, 0 on the day).
  If a placeholder has no value right now (e.g. `{next}` at the end of the schedule), the entry is skipped.

**How a pick happens**
- The entries are checked in order. An entry airs only if its `when`, `dates` and `pick` lists all pass.
- An entry is skipped if its template played last time, unless it's the first eligible one (so a cue never comes up empty).
- Then one is chosen by weight. If nothing is eligible, the window stays black for that slot. Put a condition-free fallback last.

### Debug hook
`window.fs42Graphics.preview(template, props, durationSec)` mounts and plays one template with those props and returns a promise.
Theme is random unless the props set it, and the props win over `baseProps`. It's meant for screenshots and tests.
`window.fs42Graphics.debug` exposes `choose(cue, ctx)`, `context(network)`, the schedule cache and `lastTemplate`.

## The FS42 side (done)
- The engine is generic: `static/bumpengine/engine.js` + `runtime.js`. All Snow Day wording, templates, weights and seasonal rules
  are in `snowday/channel.json`. An old-vs-new harness matched every Snow Day pick on 48,000 seeded choices.
- A pack is a folder in `fs42/fs42_server/static/<pack>/` with `engine.html`, `templates/`, `fonts/` and `channel.json`.
  The Python side finds it by folder name (`static/<pack>/engine.html`), and each pack gets its own persistent window.
- A channel opts in with `"autobump": {"engine": "<pack>", "duration": 7, "stretch": true}` in its FS42 station config.
- To change wording or weights, edit the pack's `channel.json` and restart the player, because the window loads once.

So a new pack should deliver: the templates following the contract above, the woff2 fonts, the theme names, and the word lists
(BRB lines, headers, labels, IDs, teases, facts) that the engine should rotate through. FS42 then writes its `channel.json` `cues`.
