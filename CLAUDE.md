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
- Stop: `pkill -f field_player.py` from a terminal. In scripts, kill by PID instead, because `pkill -f` can match the script's own command line.
  **After stopping, confirm no `mpv` is left before starting again.** A leftover player plays audio twice, which sounds like an echo.
- Change channel: `echo '{"command": "direct", "channel": 4}' > runtime/channel.socket`

**Open issues**
- **The HDMI test TV defaults to 4K at 30 Hz.** At that mode mpv drops about 60% of frames, because GPU scaling can't keep up.
  - Workaround: `wlr-randr --output HDMI-A-1 --mode 1920x1080@59.939999Hz`, run with the Wayland env vars. It isn't persistent and resets on reboot.
  - This doesn't matter for the CRT, which runs at 480i.
- **The fan isn't detected.** The device tree shows `cooling_fan` as `disabled`, there's no `fan1_input`, and the SoC runs at ~70°C during playback with no throttling yet.
  - Cooper is reseating the Active Cooler cable in the FAN header.
  - After reboot, check `cat /sys/class/hwmon/hwmon*/fan1_input`. Ask before touching `/boot/firmware/config.txt`.

**Next up**
1. Check the fan after reboot. Re-apply 1080p if testing on the HDMI TV.
2. Finish plan step 3 by rsyncing `CRT/filler/` from the Mac to `/mnt/crtmedia/Filler/`. Decide first how the existing `Filler/spots` fits the `kids/` and `general/` layout.
3. Plan step 4: build the real year-round main channel with shows, period ads, bumpers and real 30-minute slots.

## Working style
Cooper has ADHD. Give a plain-language summary first, then the detail. Keep steps short.
He's a strong developer (TS/React/Python), so don't over-explain code. Explain anything hardware or Linux-specific.
When checking playback, **look at the picture**: take a screenshot of the TV output with
`grim -s 0.25 out.png` (plus the Wayland env vars) and view it. Don't trust frame and CPU stats alone,
because the blue-screen bug showed 0 dropped frames.
