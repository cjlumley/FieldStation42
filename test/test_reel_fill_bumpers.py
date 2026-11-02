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

MONDAY_8PM = datetime.datetime(2026, 10, 12, 20, 0)


def _bump(path, where=None):
    return SimpleNamespace(path=path, duration=5, hints=[], tag="bump", count=0,
                           content_type="bump", media_type="video")


def _catalog():
    catalog = ShowCatalog.__new__(ShowCatalog)
    catalog.config = {
        "network_name": "T", "break_strategy": "standard", "break_duration": 180,
        "commercial_free": False, "bump_dir": "bump", "monday": {"20": {"tags": "drama"}},
    }
    catalog.clip_index = {
        "bump": [_bump("station_id.mp4")],
        "bump-prebump": [_bump("pre.mp4")],
        "bump-postbump": [_bump("post.mp4")],
    }
    catalog._l = logging.getLogger("test")
    catalog.min_gap = 3

    def find_commercial(seconds, when, commercial_dir=None):
        if seconds < 30:
            raise MatchingContentNotFound("nothing fits")
        return SimpleNamespace(path="ad.mp4", duration=30, content_type="commercial", media_type="video")

    catalog.find_commercial = find_commercial
    return catalog


def test_leftover_mid_show_break_gets_bumpers():
    # 370s over 2 breaks: the first full block takes 190s, the second would overshoot the
    # remaining 180s and is discarded, so the second break is built from the leftover fill.
    blocks = _catalog().make_reel_fill(MONDAY_8PM, 370, strict_count=2)
    assert len(blocks) == 2
    for block in blocks:
        assert block.start_bump is not None and block.start_bump.path == "pre.mp4"
        assert block.end_bump is not None and block.end_bump.path == "post.mp4"
        assert len(block.comms) > 0


def test_leftover_after_last_strict_break_stays_bare():
    # once all strict breaks exist, extra leftover ads (played after the show) get no bumpers
    blocks = _catalog().make_reel_fill(MONDAY_8PM, 420, strict_count=1)
    assert blocks[0].start_bump is not None
    assert all(b.start_bump is None and b.end_bump is None for b in blocks[1:])
