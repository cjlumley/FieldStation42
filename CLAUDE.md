# CRT TV project: handoff for Claude Code

## What this is
Cooper's Raspberry Pi 5 is wired to a 13" Sharp CRT, running **FieldStation42** (FS42) to fake live
2000s TV channels. The goal is the feel of the early-to-mid-2000s kids' TV that was on in the
background growing up, plus classic movies. Once the Pi moves to the CRT's new location, it's a shared watching thing.
Treat it as a side project: get something working fast, then polish.

## Decisions already made
- **Software:** FieldStation42, not ErsatzTV. It plays through mpv straight to the screen, with
  no streaming server or transcoding. Docs: https://fieldstation42.com/docs/ (the GitHub wiki is
  marked as going out of date, so check the docs site first for the current config format).
- **OS:** Raspberry Pi OS 64-bit (Trixie) **with desktop**, needed for the OSD overlay and the web guide.
  Hostname `crt`, SSH on, home Wi-Fi. Login: `ssh <user>@crt.local`.
  The Wi-Fi at the CRT's new location gets added later, when the Pi moves.
- **Content theme:** 2000s nostalgia with a strong **Canadian/Toronto bias**. Weight YTV, Teletoon,
  Treehouse, Citytv, CBC and Concerned Children's Advertisers PSAs (House Hippo) over US networks.
  Leave game shows and anime out for now.
- **Channels:** a year-round main channel, plus separate **Halloween** and **Christmas** channels.
  Seasonal filler must never leak onto the year-round channel.
- **Look:** channel-number/name banner and a corner station logo (FS42 OSD, `osd/osd.json` plus
  per-station `logo_dir`). Seasonal logos go in folders by month (`logos/October/`, `logos/December/`).
  Guide channel uses the **custom web guide, 00s theme**, restyled toward a Rogers/Bell ExpressVu
  early-2000s digital cable look. Set the guide video panel to **4:3**.
- **CRT specifics:** composite out at 480i. Keep logos chunky and pulled in from the edges with
  `x_margin`/`y_margin` and the guide's `--h-padding`/`--v-padding`, because of overscan.
  All media is pre-encoded to **720×480 H.264**.

## Filler library (already built, lives on Cooper's Mac in `CRT/filler/`)
- About 1,871 files, roughly 39 hours, from 78 Internet Archive off-air recordings.
- Organized by **originating channel**, because ads are matched to shows by network and era:
  - `kids/<channel>/<season>/{blocks,spots}`
  - `general/<station>/<season>/...`
  - flat: `psa-canada/`, `ads-canada-brands/`, `ads-us-brands/`
- `season` = `everyday | halloween | christmas`, assigned by recording date.
- `blocks` = an intact break in its original order; `spots` = one ad per file. **Never use both on the same channel.**
- `MANIFEST.csv` columns: tier / channel / season / type / duration / recorded / archive URL.
- Map these onto FS42 per-slot `commercial_dir` / `bump_dir`.

## Plan / next steps
1. First boot, `sudo apt update && sudo apt full-upgrade -y`, then install `mpv git python3-venv`.
   If mpv shows black, write `~/.config/mpv/mpv.conf` with `vo=gpu` and `gpu-api=opengl` (a known early-Trixie issue).
2. Clone FS42 (preferably Cooper's own fork, so configs live in git), then run `bash install.sh`.
3. Put media on a **USB SSD**, not the SD card, and rsync it from the Mac.
4. Build **one channel completely first** (shows, ads, logo), watch it on the CRT, then copy the pattern.
5. Add the OSD and logos, then the guide channel, then the seasonal channels.
6. Move to the CRT: composite 480i, overscan tweaks. Turn on autostart **last**, because it hides errors.

## Current status (updated 2026-11-02)
Plan steps 1–2 are done and step 3 is half done. Three throwaway **test channels** are working on an HDMI test TV.

**Pi setup**
- mpv 0.40 plus FS42 deps are installed, and `install.sh` has been run. The venv is in `env/`.
- mpv shows a picture with the default Vulkan output. **Leave `~/.config/mpv/mpv.conf` alone** (Cooper's call). The opengl workaround wasn't needed.
- `fs42/station_player.py` also passes, as mpv startup options:
  - **`sub_auto="no"` and `subs_fallback="no"`.** TV had no subtitles: sidecar `.srt` files aren't loaded and default-flagged tracks aren't picked.
    Forced tracks still show. Christmas Vacation had shown its `.en.srt`.
  - **`af=lavfi=[loudnorm=I=-20:LRA=7:TP=-2]`**, broadcast loudness levelling. Christmas Vacation measured ~13 dB under the ads.
    Afterwards, Elf, SpongeBob and ads land within ~1 dB, and Christmas Vacation within ~6. Measured 0 ms A/V offset and ~5% of one core.
    Station audio effects are added and removed by label on top of it.
- `fs42/station_player.py` passes **`hwdec="auto-copy"`** to mpv.
  - Plain `auto` (drm-prime) shows a **solid blue screen** for HEVC on Pi 5 with Wayland.
  - `auto-copy` gives the Pi 5's HEVC decoder (~20% CPU, 0 drops). Software decoding dropped about half the frames.
  - The Pi 5 has **no H.264 hardware decoder**. 480p H.264 decodes in software at about 10% CPU, which is fine.
  - Not yet checked: 10-bit HEVC (e.g. Beetlejuice) with `auto-copy`.
- The USB SSD (exFAT, label `crtmedia`) mounts at **`/mnt/crtmedia`**, set up in fstab by UUID with `nofail`.
  It holds Cooper's own media: **never format, delete or rename anything on it without asking**.
  - Layout: `Movies/` (46), `TV/` (5 shows), `unorganized/`, a tiny `Filler/spots/`, and unextracted zips at the root.
  - Most of it is 1080p MKV/HEVC, not the planned 720×480 H.264. Cooper chose no re-encode for now.
- `confs/main_config.json` holds the web API key and is gitignored. Every other `confs/*.json` is tracked. Never commit the key.
- `gh` is logged in as cjlumley. Commits use the GitHub noreply email (set in the repo-local git config).

**Ch2 `Main`** (`confs/main.json`): the first channel with ads. Cooper put the Mac filler library on hold, so it uses what's on the Pi.
- Shows: Magic School Bus, SpongeBob, Scooby-Doo and Are You Afraid of the Dark, in real 30-minute slots with two shows rotating per hour.
  Goosebumps is left out because its double-episode files run ~43 minutes.
- `catalog/main/` holds symlinks: one per show folder, `commercial/` with one link per clean ad, and `bump/` linking to the House Hippo PSA in `~/demo`.
  Nothing on the SSD was changed for this.
- Ads are the 8 clean toy and kid ads in `/mnt/crtmedia/Filler/spots/`, numbered 004 005 006 010 011 014 015 016.
  - Cooper had the 7 pure-Toonami clips deleted (001 002 003 008 012 013 017).
  - 007 and 009 are half ad, half Toonami. They're not linked yet, and Cooper hasn't decided whether to trim or delete them.
  - These 960×720 clips were cut at the wrong points, with ads and bumpers mixed in the same files. Spot-check the Mac library before trusting its splits.
- The House Hippo is the only bumper, so it plays ~4× per half hour. Needs more PSAs or station IDs.
- Fixed in our fork: FS42 used to space breaks by chapter count and put them right before the end credits.
  `LiquidBlock.clip_break_points` now picks the chapter nearest to evenly spaced times and never breaks in the last 120 s.
- Fixed in our fork: Kodi double-episode `.nfo` files (two XML documents in one file) were shown on screen as raw XML through the NFO overlay. `NFOAgent.parse_nfo_string` now handles them.

**Test channels** (`confs/test.json`, `confs/goosebumps.json`, `confs/movies.json`, committed so we can come back to them)
- ch3 `Test` = Magic School Bus, ch4 `Goosebumps` (PAL 704×576, will judder on NTSC), ch5 `Movies`.
- Each one is `content_dir: catalog/<name>/` plus a symlink to the show folder on `/mnt/crtmedia`, following the docs' external-drive method.
  `catalog/` is gitignored. On a fresh clone, recreate the links, then run `--rebuild_catalog` and `--add_week`:
  `ln -s "/mnt/crtmedia/TV/The Magic School Bus" catalog/test/magic_school_bus`,
  `ln -s /mnt/crtmedia/TV/Goosebumps catalog/goosebumps/goosebumps`,
  `ln -s /mnt/crtmedia/Movies catalog/movies/movies` (run `mkdir -p` on each folder first).
- They run with `schedule_increment: 0` (continuous) plus `commercial_free`.
  - Reason: with a 30-minute increment and no `bump_dir`, `--add_week` crashes with `KeyError: 'bump_dir'`.
  - An empty bump folder fails too. Real slots need real bumpers or commercials.
- Measured: channel switch 0.2–0.4 s, first catalog scan ~0.3 s per new video, re-scan with no changes ~2 s, `--add_week` ~2 s.
- `--rebuild_catalog` rescans **all** channels and **resets all schedules**, so always follow it with `--add_week`.

**Running it**
- Start, with the env vars needed over SSH:
  `cd ~/FieldStation42 && source env/bin/activate && export XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 && python3 field_player.py`
- The player also serves the web console on `:4242`. Don't run `station_42.py --server` at the same time.
- Stop: `pkill -f field_player.py` from a terminal. In scripts, kill by PID instead, because `pkill -f` and `pgrep -f`
  can match the script's own command line (this bit us twice).
  - Start in scripts with `nohup env/bin/python field_player.py > runtime/field_player.log 2>&1 < /dev/null & echo $! > runtime/field_player.pid`.
  - Take the PID from `$!`, never from `pgrep -f`, and stop with `kill $(cat runtime/field_player.pid)`.
  - To list the real processes: `ps -eo pid,ppid,args | awk '$3=="env/bin/python" && $4=="field_player.py" || $3=="mpv"'`.
  - **After stopping, confirm no `mpv` is left before starting again.** A leftover player plays audio twice, which sounds like an echo.
  - Stop the player before `--rebuild_catalog` or `--delete_schedules`.
- Change channel: `echo '{"command": "direct", "channel": 4}' > runtime/channel.socket`

**On the CRT (since 2026-11-02 evening)**
- The CRT is fed through an **HDMI→composite converter box** (it shows up as `HJW MACROSILICON 0x0002E9BD` on `HDMI-A-1`),
  not the Pi's own composite pins. The box takes whatever HDMI mode it's sent and squeezes it onto the 4:3 tube.
  - It defaulted to 1280×720, which squashed everything sideways and made 4:3 graphics into a strip with black sides.
  - Fix: `~/.config/kanshi/config` has a `crt` profile that sets **720×480@59.94** (native NTSC) for that box only.
    kanshi runs from labwc autostart, so this survives reboots, and other HDMI TVs keep their default.
    Apply changes with `pkill -HUP -x kanshi` (there's no `kanshictl`).
- `confs/main_config.json` (local, gitignored) sets `"monitor_aspect": "4:3"`. `station_player.py` passes it as mpv's `monitoraspect`,
  because the 720×480 frame has non-square pixels. `StationManager` whitelists the key.
- **Authentic movie framing:** Cooper wants it "like when people watched TV off here". 2000s broadcasts showed movies **full-screen**
  (cropped, "modified to fit your screen"), not letterboxed. So ch 12 and ch 5 have `"panscan": 1.0`, a centre crop (real pan-and-scan
  followed the action; this can't). 4:3 shows and ads are unaffected.
- Ch 12 engine has `"stretch": true`, so Snow Day graphics fill the 720×480 frame. Verified with a screenshot.
- **Git repo was corrupted** by the unclean power-off during the move: 61 empty object files from the last commits.
  It was repaired by moving them aside (`~/git-empty-objects/`) and fetching from GitHub; `git fsck` is clean.
  The backup of the broken `.git` is `~/FieldStation42-git-backup-20261102.tgz`. Shut down with `systemctl poweroff` before moving the Pi.

**Open issues**
- **The HDMI test TV defaults to 4K at 30 Hz.** At that mode mpv drops about 60% of frames, because GPU scaling can't keep up.
  - Workaround: `wlr-randr --output HDMI-A-1 --mode 1920x1080@59.939999Hz`, run with the Wayland env vars. It isn't persistent and resets on reboot.
  - This doesn't matter for the CRT, which runs at 480i.
- **Wi-Fi at boot: fixed, but not yet tested with a reboot.**
  - The cause: there was no saved Wi-Fi profile, so connections made from the desktop menu didn't survive a reboot.
  - Fix: one system-wide NetworkManager profile for the home Wi-Fi, saved in `/etc/NetworkManager/system-connections/`, with autoconnect on and `psk-flags 0` (password stored by the system, so it connects with no one logged in). It connected fine alongside ethernet.
  - To test: unplug ethernet, reboot, then `ssh` in or check `nmcli device status`.
  - Two empty leftover files, `/etc/netplan/90-NM-*.yaml`, are harmless. Removing them needs sudo.
  - Note: `/boot/firmware/network-config`, from the Imager, holds the Wi-Fi password in plain text.
- **Fan: fixed** (the cable was reseated). The device tree shows `cooling_fan` as `okay`, and `pwmfan` reports RPM.
  - It switches on at 50°C. Under a 4-core full load it reached 57°C at ~2,100 RPM, without leaving its lowest speed step.
  - Check it with `cat /sys/class/hwmon/hwmon*/fan1_input`.
- `sudo` asks for a password and the `!` prefix can't supply one. `systemctl poweroff` and `systemctl reboot` work without sudo from the desktop session.

**Next up**
1. Test Wi-Fi with a reboot whenever convenient. Re-apply 1080p if testing on the HDMI TV.
2. Finish plan step 3 by rsyncing `CRT/filler/` from the Mac to `/mnt/crtmedia/Filler/`. Decide first how the existing `Filler/spots` fits the `kids/` and `general/` layout.
3. Plan step 4: build the real year-round main channel with shows, period ads, bumpers and real 30-minute slots.

## Snow Day bumpers (Christmas channel, ch 12)
- Designs live in Cooper's Claude Design canvas "CRT Network Pitch Board", page "Snow Day bumper library":
  15 templates plus a shared background (5 themes) and a shared logo.
- They render to clips with the **snowday-kit** (Node + Playwright + ffmpeg), on Cooper's Mac. Its README has the full spec. Flow:
  `channel.json` (FS42 tag → on-screen show name, facts) → `build-library.mjs` → `render.mjs` → `out/snowday/`.
- **Picture rule (Pi 5 composite):** the output is a fixed 720×480i frame with no scaler and no overscan control,
  and the tube shows it as 4:3. Templates are designed at 640×480 (true 4:3) and stretched to 720×480.
  - Title-safe area: x 64–576, y 48–432 on the 640 design.
  - **The library is mixed**: ads 960×720 SAR 1:1, Magic School Bus 720×480 SAR 8:9, Goosebumps PAL 704×576,
    SpongeBob 950×720, movies 1920×1080 16:9. Because of that, at the CRT step mpv needs `monitoraspect=4:3`
    (or `monitorpixelaspect`) so every file gets its own aspect right. The bumpers should then be tagged
    with a real 4:3 display aspect (720×480 SAR 8:9, i.e. the kit's `--sar` option), not SAR 1:1.
    Cooper said to leave `mpv.conf` alone, so ask, or pass the option from `station_player.py`.
- **FS42 folder map** (inside `catalog/christmas/`, symlinked to `/mnt/crtmedia/Station/christmas/`, which holds placeholders):
  - `bump/` = IDs, greetings, trivia. `bump/pre/` = into-break. `bump/post/` = out-of-break stings.
  - `next/--<tag>/` = "up next <show>".
  - `shows/<tag>/{pre,post}` = show-specific bumpers, via `tag_overrides` → `bump_dir`.
  - `special/` = sign-off/on, plus per-day countdown clips.
  - Run `--rebuild_catalog` then `--add_week` after adding clips. `tools/make_placeholders.py` holds the tag → name list
    (`CHRISTMAS_SPECIALS` / `CHRISTMAS_MOVIES`), and it must match the kit's `channel.json`.
- **One FS42 tag per title** (e.g. `rudolph`, `elf`), because `next/` matching uses the slot's tag. Specials run 7–16h and movies the rest,
  using `random_tags`.
- **Break length: 1½–2½ min**, from Cooper: "it felt like forever… needs to feel like I'm actually watching TV".
  - `"max_break": 150` (seconds) caps every break, the one after the show included. Extra spare time becomes **more** breaks, never longer ones.
    `break_every: 12` is the minimum spacing.
  - Ad load is back to the defaults (no `min_break_ratio`). The old 0.2 ratio gave Polar Express a 150-minute slot and 7-minute breaks.
  - Measured over a week: 790 mid-show breaks, median 2.2 min, longest 2.5. About 9 minutes of program between breaks. 18% of airtime is ads.
  - Code: `LiquidBlock.make_plan` sets the break count to `max(break_every count, ceil(spare / max_break))` and passes `break_target`.
    `ShowCatalog.make_reel_block` only picks ads that still fit when `max_break` is set. `make_reel_fill` keeps adding breaks while the leftover
    exceeds `max_break`, and on engine channels the after-show break gets cues too (its `post` becomes "up next").
  - The black just before a bumper is FS42's own fade-to-black at the end of a clipped segment, not a gap.
- **Verified in FS42's source:**
  - **`next/` fires on every break, mid-show included.** Its clips are merged at random into the pre/post/fill pools whenever the
    next block's tag matches. In the first build, 493 of 524 "up next" clips aired mid-show, but all named the right show.
    Proposed fix (not done): only pass `lookahead` to the last break and the after-show fill in `make_reel_fill`.
  - **`tag_overrides` `bump_dir` with pre/post:** pre/post come from `<override>/pre` and `<override>/post`. If either is missing,
    FS42 falls back to the override folder's own clips, not the channel's `bump/pre`. An override folder with no clips errors
    (`Can't find bump folder`), so only add an override once `shows/<tag>/` has clips. `{"tags": "shows/x", "chance": 0.5}` mixes with the channel pool.
  - **Countdown clips need no daily job.** Folder names like `December 24` or `December 1 - December 25` are date hints, and they work
    in bump folders (hints stack from every path level). FS42 filters by the block's air date even when building a week ahead.
    A dated clip in `bump/December 13/` only joins that day's pool at random, though. To air one at a fixed time each day,
    generate `date_overrides` slots with a `start_bump` file path. `start_bump` folders ignore date hints.
- `OvlCreditSqueeze` is an on-top overlay. It needs alpha video plus an FS42 OSD/mpv overlay extension, so it's not part of v1.
- **Ch 12 ads (2026-11-02):** Cooper's cleaned Christmas library (`christmas-clean` on the Mac) is at `/mnt/crtmedia/Filler/new-ads/`, with a `MANIFEST.csv`.
  - `ads-christmas/` has 74 clips and `ads-kids/` 98 (holiday-season recordings, not Christmas-themed). There are also 64 network IDs/promos in `bumpers/`, not used yet.
  - All 720×480 SAR 8:9 (4:3). A spot check of start/end frames showed clean cuts.
  - `catalog/christmas/commercial/` is its **own** folder: links to `ads-christmas`, `ads-kids` and the House Hippo. It no longer borrows ch 2's pool,
    so ch 2 gets zero Christmas ads (checked across a full week).

**Live Snow Day bumpers (Cooper chose this over pre-rendered clips: "do b so that we can do this properly").**
Channel 12 draws its break bumpers live, at air time, from the real schedule.
- Config: `"autobump": {"engine": "snowday", "duration": 7}` (optional `"stretch": true` for the CRT).
  Every break gets a `cue=pre` entry (into break) and a `cue=post` entry (out of break).
- Page: `fs42/fs42_server/static/snowday/`. It holds `engine.html` and `engine.js`, plus copies of the kit's `runtime.js`,
  `templates/` and fonts, and `channel.json` (FS42 tag → name, movie tags, facts, IDs, themes).
  - It caches `/schedules/<network>` and refreshes every 20 s.
  - `cue=post` → "Now back to <show>" if any `feature` entry remains in the current block after this bumper.
    Otherwise "Up next <show> at <h:mm>", or UpNextThen.
  - `cue=pre` → a weighted pick from: BRB, "stay tuned: more <show>", trivia, countdown (Dec 1–24, from today's date), Merry, ID,
    Lineup (the next 4 blocks with real times), and Movie promo (a movie later today).
  - Each template's `*Cycle` animation plays once, stretched to the slot length.
- Window: `fs42/graphics_engine.py`. Launching a fresh web window per bumper (stock autobump) costs **3–4 s of black** on the Pi 5.
  So the player starts **one persistent QtWebEngine window** per engine at startup (`StationPlayer._start_graphics_engines`).
  A cue updates the page with JS and shows the window over mpv in about 0.1 s; any normal video, channel change or web channel hides it.
  - The page re-fits the 640×480 stage on `resize`, and again 60 and 250 ms after `showFullScreen`. Without that, it measured the
    still-hidden window and the graphic landed in the corner, cut off.
  - On the 16:9 HDMI test TV the graphic is pillarboxed 4:3 (black sides), which is correct. **At the CRT step, set
    `"autobump": {..., "stretch": true}` on ch 12**, so the 640×480 design fills the 720×480 composite frame. Without it,
    `min(sx, sy)` letterboxes it with ~40 px bars.
  - On a cue, mpv is **paused, not stopped**, so the last frame covers the gap instead of black. Every play path
    (`play_file`, `play_and_wait`, loop playlists) sets `pause = False` before loading.
  - Verified on air (18:05 break, Christmas Vacation): "stick around! more Christmas Vacation" → 8 ads → "Now back to Christmas Vacation" → movie resumed.
- Autobump `engine` support is in `AutoBumpAgent.engine_bumps` / `engine_cue`. Leftover-fill breaks get engine cues too (`ShowCatalog.make_reel_fill`).
  Tests: `test/test_graphics_engine_bumps.py`.
- To change wording, weights or templates, edit `engine.js` and `channel.json`. They're static files: restart the player (the window loads once); no rebuild needed.
  To update the designs, copy the kit's templates into `static/snowday/templates/`.
- The pre-rendered clips in `/mnt/crtmedia/Station/christmas/` (from `~/snowday-kit-src/`, rendered on the Pi with Node in `~/.local/node`
  and the system Chromium via `pi-chromium.cjs`) are a fallback only. With `autobump.engine` set, FS42 doesn't air folder bumpers on ch 12.

## Working style
Cooper has ADHD. Give a plain-language summary first, then the detail. Keep steps short.
He's a strong developer (TS/React/Python), so don't over-explain code. Explain anything hardware or Linux-specific.
When checking playback, **look at the picture**: take a screenshot of the TV output with
`grim -s 0.25 out.png` (plus the Wayland env vars) and view it. Don't trust frame and CPU stats alone,
because the blue-screen bug showed 0 dropped frames.
