#!/usr/bin/env python3
"""Generate labelled placeholder clips for the station "skeleton" (bumpers, up-next cards, intros).

Each placeholder is a 720x480 4:3 title card with silent audio, named PLACEHOLDER-*.mp4.
To fill a slot in later: drop real clips into the same folder and delete the PLACEHOLDER file.
FS42 picks randomly among all clips in a folder, so a folder can hold many real clips.

Usage: python3 tools/make_placeholders.py [ROOT]   (default ROOT: /mnt/crtmedia/Station)
Existing files are never overwritten.
"""
import os
import subprocess
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "/mnt/crtmedia/Station"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

MAIN_SHOWS = {
    "magic_school_bus": "THE MAGIC SCHOOL BUS",
    "spongebob": "SPONGEBOB SQUAREPANTS",
    "scooby_doo": "SCOOBY-DOO",
    "are_you_afraid": "ARE YOU AFRAID OF THE DARK?",
}

# FS42 tag -> on-screen name. Keep in sync with confs/christmas.json and the snowday-kit channel.json.
CHRISTMAS_SPECIALS = {
    "charlie_brown_christmas": "A CHARLIE BROWN CHRISTMAS",
    "frosty": "FROSTY THE SNOWMAN",
    "grinch": "HOW THE GRINCH STOLE CHRISTMAS!",
    "mickeys_christmas_carol": "MICKEY'S CHRISTMAS CAROL",
    "rudolph": "RUDOLPH THE RED-NOSED REINDEER",
    "santa_claus_is_comin": "SANTA CLAUS IS COMIN' TO TOWN",
    "year_without_santa": "THE YEAR WITHOUT A SANTA CLAUS",
}
CHRISTMAS_MOVIES = {
    "elf": "ELF",
    "home_alone": "HOME ALONE",
    "home_alone_2": "HOME ALONE 2",
    "miracle_on_34th_street": "MIRACLE ON 34TH STREET",
    "muppet_christmas_carol": "THE MUPPET CHRISTMAS CAROL",
    "christmas_vacation": "CHRISTMAS VACATION",
    "nightmare_before_christmas": "THE NIGHTMARE BEFORE CHRISTMAS",
    "polar_express": "THE POLAR EXPRESS",
}
CHRISTMAS_TITLES = {**CHRISTMAS_SPECIALS, **CHRISTMAS_MOVIES}

# (relative folder, file stem, big label, sub label, seconds, background colour)
CARDS = [
    ("main/bumps/pre", "into-break", "BUMPER", "WE'LL BE RIGHT BACK", 5, "0x1f3a93"),
    ("main/bumps/post", "back-to-show", "BUMPER", "NOW BACK TO THE SHOW", 5, "0x1f3a93"),
    ("main/bumps", "station-id", "STATION ID", "CHANNEL 2", 10, "0x6c3483"),
    ("movies/bumps/pre", "into-break", "MOVIE BUMPER", "WE'LL BE RIGHT BACK", 5, "0x7b241c"),
    ("movies/bumps/post", "back-to-movie", "MOVIE BUMPER", "NOW BACK TO THE MOVIE", 5, "0x7b241c"),
    ("movies/bumps", "station-id", "STATION ID", "CHANNEL 5 MOVIES", 10, "0x6c3483"),
    ("movies/intro", "feature-presentation", "FEATURE PRESENTATION", "MOVIE INTRO", 12, "0x145a32"),
    # Christmas channel (ch 12) follows the snowday-kit folder map: bump/ = IDs, greetings, trivia,
    # bump/pre/ = into-break, bump/post/ = out-of-break, next/--<tag>/ = "up next <show>"
    ("christmas/bump/pre", "into-break", "SNOW DAY BUMPER", "INTO BREAK", 5, "0xa93226"),
    ("christmas/bump/post", "out-of-break", "SNOW DAY BUMPER", "OUT OF BREAK", 5, "0xa93226"),
    ("christmas/bump", "station-id", "SNOW DAY", "ID / GREETING / TRIVIA", 8, "0x196f3d"),
] + [
    (f"christmas/next/--{tag}", "up-next", "UP NEXT", name, 6, "0x7d6608")
    for tag, name in CHRISTMAS_TITLES.items()
] + [
    (f"main/up_next/{key}", "up-next", "UP NEXT", name, 8, "0x9a7d0a")
    for key, name in MAIN_SHOWS.items()
]


def esc(text):
    # escape for ffmpeg drawtext
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")


def make_card(folder, stem, label, sub, seconds, colour):
    out_dir = os.path.join(ROOT, folder)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"PLACEHOLDER-{stem}.mp4")
    if os.path.exists(out):
        print(f"exists, skipped: {out}")
        return
    footer = f"PLACEHOLDER - replace in Station/{folder}/"
    text = (
        f"drawtext=fontfile={FONT}:text='{esc(label)}':fontcolor=white:fontsize=56:x=(w-tw)/2:y=150,"
        f"drawtext=fontfile={FONT}:text='{esc(sub)}':fontcolor=white:fontsize=34:x=(w-tw)/2:y=235,"
        f"drawtext=fontfile={FONT}:text='{esc(footer)}':fontcolor=white@0.7:fontsize=18:x=(w-tw)/2:y=390,"
        f"drawtext=fontfile={FONT}:text='%{{eif\\:{seconds}-t+0.999\\:d}}':fontcolor=white@0.8:fontsize=26:x=w-tw-70:y=60"
    )
    cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "lavfi", "-i", f"color=c={colour}:s=720x480:r=30000/1001:d={seconds}",
        "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={seconds}",
        "-vf", f"{text},setsar=8/9",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "96k", "-shortest", out,
    ]
    subprocess.run(cmd, check=True)
    print(f"made: {out}")


if __name__ == "__main__":
    for card in CARDS:
        make_card(*card)
