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

## Working style
Cooper has ADHD. Give a plain-language summary first, then the detail. Keep steps short.
He's a strong developer (TS/React/Python), so don't over-explain code. Explain anything hardware or Linux-specific.
