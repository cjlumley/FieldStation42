"""Clip shows that pair two short cartoons in one half hour (ZAP!, channel 7)."""
import datetime
import logging
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.modules.setdefault("ffmpeg", MagicMock())
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("moviepy.editor", MagicMock())

from fs42.catalog import ShowCatalog  # noqa: E402
from fs42.catalog_entry import MatchingContentNotFound  # noqa: E402
from fs42.liquid_blocks import LiquidClipBlock  # noqa: E402
from fs42.station_io import StationIO  # noqa: E402

START = datetime.datetime(2026, 11, 3, 14, 0)


def _io():
    io = StationIO.__new__(StationIO)
    io._l = logging.getLogger("test")
    return io


def test_normalize_keeps_clip_show_break_settings():
    out = _io()._normalize_clip_shows(
        [{"tags": "gumball", "duration": 30, "break_strategy": "end", "break_duration": 180}, "plain"], 30, "zap.json"
    )
    assert out["gumball"]["break_strategy"] == "end"
    assert out["gumball"]["break_duration"] == 180
    assert out["gumball"]["total_duration"] == 1800
    assert "break_strategy" not in out["plain"]


def test_end_strategy_fits_two_short_episodes_in_half_hour():
    # with the default 0.8 content ratio, a second 12-min episode would not fit a 30-min clip show
    catalog = ShowCatalog.__new__(ShowCatalog)
    catalog._l = logging.getLogger("test")
    ep = SimpleNamespace(path="ep.mkv", duration=730)

    def find_candidate(tag, seconds, when, **kw):
        if seconds < ep.duration:
            raise MatchingContentNotFound("nothing fits")
        return ep

    catalog.find_candidate = find_candidate
    duration = 30 * 60 * 0.95
    assert len(catalog.gather_clip_content("gumball", duration, START, None, None)) == 1
    assert len(catalog.gather_clip_content("gumball", duration, START, None, None, 180, "end")) == 2


def _bump(path):
    return SimpleNamespace(path=path, duration=5, hints=[], tag="bump", count=0, content_type="bump", media_type="video")


def test_two_clips_get_a_break_after_each():
    catalog = ShowCatalog.__new__(ShowCatalog)
    catalog.config = {
        "network_name": "T", "break_strategy": "standard", "break_duration": 180,
        "commercial_free": False, "bump_dir": "bump",
    }
    catalog.clip_index = {"bump": [_bump("id.mp4")], "bump-prebump": [_bump("pre.mp4")], "bump-postbump": [_bump("post.mp4")]}
    catalog._l = logging.getLogger("test")
    catalog.min_gap = 3

    def find_commercial(seconds, when, commercial_dir=None):
        if seconds < 30:
            raise MatchingContentNotFound("nothing fits")
        return SimpleNamespace(path="ad.mp4", duration=30, content_type="commercial", media_type="video")

    catalog.find_commercial = find_commercial
    clips = [
        SimpleNamespace(path=f"ep{i}.mkv", duration=730, content_type="feature", media_type="video", title="Gumball")
        for i in (1, 2)
    ]
    info = {"start_bump": None, "end_bump": None, "bump_dir": None, "commercial_dir": None}
    block = LiquidClipBlock(clips, START, START + datetime.timedelta(minutes=30), "gumball", "standard", info)
    block.make_plan(catalog)
    kinds = ["F" if e.content_type == "feature" else "-" for e in block.plan]
    # ep 1, a break, ep 2, a break: never one long break in the middle and a stub at the end
    collapsed = "".join(k for i, k in enumerate(kinds) if i == 0 or k != kinds[i - 1])
    assert collapsed == "F-F-"
    first_break = sum(float(e.duration) for e in block.plan[1:kinds.index("F", 1)])
    assert first_break < 200
