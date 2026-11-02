import datetime
import logging
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.modules.setdefault("ffmpeg", MagicMock())
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("moviepy.editor", MagicMock())

from fs42.autobump_agent import AutoBumpAgent  # noqa: E402
from fs42.catalog import ShowCatalog  # noqa: E402
from fs42.catalog_entry import MatchingContentNotFound  # noqa: E402

PAGE = "http://127.0.0.1:4242/static/snowday/engine.html"
WHEN = datetime.datetime(2026, 12, 14, 18, 30)


def _patch_page():
    return patch.object(AutoBumpAgent, "engine_page_url", staticmethod(lambda engine: PAGE))


def test_engine_bumps_are_pre_and_post_cues():
    with _patch_page():
        bumps = AutoBumpAgent.gen_bumps({"autobump": {"engine": "snowday", "duration": 6}, "network_name": "Christmas"})
    pre, post = bumps["message_bump"], bumps["next_bump"]
    assert pre.duration == 6 and post.duration == 6
    assert AutoBumpAgent.is_autobump_url(pre.path)
    assert AutoBumpAgent.engine_cue(AutoBumpAgent.extract_url(pre.path))["cue"] == "pre"
    assert AutoBumpAgent.engine_cue(AutoBumpAgent.extract_url(post.path))["cue"] == "post"


def test_engine_cue_parses_page_and_ignores_player_duration_param():
    cue = AutoBumpAgent.engine_cue(PAGE + "?cue=post&duration=5400")
    assert cue == {"engine": "snowday", "page": PAGE, "cue": "post"}


def test_stock_bump_page_is_not_an_engine_cue():
    assert AutoBumpAgent.engine_cue("http://127.0.0.1:4242/static/bump/bump.html?title=X") is None


def test_engine_default_duration():
    with _patch_page():
        assert AutoBumpAgent.gen_bumps({"autobump": {"engine": "snowday"}})["message_bump"].duration == 7


def _catalog():
    catalog = ShowCatalog.__new__(ShowCatalog)
    catalog.config = {
        "network_name": "Christmas", "break_strategy": "standard", "break_duration": 180,
        "commercial_free": False, "bump_dir": "bump", "autobump": {"engine": "snowday", "duration": 5},
        "monday": {"18": {"tags": "movies"}},
    }
    catalog.clip_index = {"bump": []}
    catalog._l = logging.getLogger("test")
    catalog.min_gap = 3

    def find_commercial(seconds, when, commercial_dir=None):
        if seconds < 30:
            raise MatchingContentNotFound("nothing fits")
        return SimpleNamespace(path="ad.mp4", duration=30, content_type="commercial", media_type="video")

    catalog.find_commercial = find_commercial
    return catalog


def test_every_mid_show_break_gets_engine_cues_including_leftover():
    with _patch_page():
        blocks = _catalog().make_reel_fill(WHEN, 370, strict_count=2)
    assert len(blocks) == 2
    for block in blocks:
        assert AutoBumpAgent.engine_cue(AutoBumpAgent.extract_url(block.start_bump.path))["cue"] == "pre"
        assert AutoBumpAgent.engine_cue(AutoBumpAgent.extract_url(block.end_bump.path))["cue"] == "post"
