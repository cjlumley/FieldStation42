import datetime
import logging
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.modules.setdefault("ffmpeg", MagicMock())
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("moviepy.editor", MagicMock())

from fs42.catalog import ShowCatalog  # noqa: E402
from fs42.catalog_entry import MatchingContentNotFound  # noqa: E402
from fs42.liquid_blocks import LiquidBlock  # noqa: E402

START = datetime.datetime(2026, 12, 14, 18, 30)


def _bump(path):
    return SimpleNamespace(path=path, duration=5, hints=[], tag="bump", count=0, content_type="bump", media_type="video")


def _catalog(break_every):
    catalog = ShowCatalog.__new__(ShowCatalog)
    catalog.config = {
        "network_name": "T", "break_strategy": "standard", "break_duration": 180, "break_every": break_every,
        "commercial_free": False, "bump_dir": "bump", "monday": {"18": {"tags": "movies"}},
    }
    catalog.clip_index = {"bump": [_bump("id.mp4")], "bump-prebump": [_bump("pre.mp4")], "bump-postbump": [_bump("post.mp4")]}
    catalog._l = logging.getLogger("test")
    catalog.min_gap = 3

    def find_commercial(seconds, when, commercial_dir=None):
        if seconds < 30:
            raise MatchingContentNotFound("nothing fits")
        return SimpleNamespace(path="ad.mp4", duration=30, content_type="commercial", media_type="video")

    catalog.find_commercial = find_commercial
    return catalog


def _segments(content_min, slot_min, break_every, chapters=None):
    movie = SimpleNamespace(path="movie.mp4", realpath="movie.mp4", duration=content_min * 60, title="Movie",
                            content_type="feature", media_type="video")
    info = {"start_bump": None, "end_bump": None, "bump_dir": None, "commercial_dir": None}
    block = LiquidBlock(movie, START, START + datetime.timedelta(minutes=slot_min), "Movie", "standard", info)
    fluid = MagicMock()
    fluid.return_value.get_chapters.return_value = chapters or []
    fluid.return_value.get_breaks.return_value = []
    with patch("fs42.liquid_blocks.FluidBuilder", fluid):
        block.make_plan(_catalog(break_every))
    segs, cur = [], 0.0
    for e in block.plan:
        if e.path == "movie.mp4":
            cur += e.duration
        elif cur:
            segs.append(cur)
            cur = 0.0
    if cur:
        segs.append(cur)
    return segs


def test_movie_without_markers_breaks_every_12_minutes():
    # Home Alone (103 min) in a 150 min slot used to get a break every ~6 minutes
    segs = _segments(103, 150, 12)
    assert len(segs) == 9
    assert all(10 * 60 <= s <= 13 * 60 for s in segs)


def test_half_hour_show_gets_two_mid_breaks():
    segs = _segments(23, 30, 8)
    assert len(segs) == 3


def test_chapters_follow_break_every():
    chapters = [{"chapter_start": float(m * 60)} for m in range(0, 103, 5)]  # a chapter every 5 min
    segs = _segments(103, 150, 12, chapters)
    assert 8 <= len(segs) <= 10
    assert all(segs[i] >= 5 * 60 for i in range(len(segs) - 1))
