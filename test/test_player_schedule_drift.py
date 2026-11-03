"""Entry end times follow the schedule, so per-file load time doesn't pile up over a block."""
import datetime as real_dt
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.modules.setdefault("ffmpeg", MagicMock())
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("moviepy.editor", MagicMock())

import fs42.station_player as sp  # noqa: E402
from fs42.liquid_manager import PlayPoint  # noqa: E402

T0 = real_dt.datetime(2026, 11, 3, 0, 0, 0)
LOAD = 0.4  # seconds every play_file call takes to load and seek


class Clock:
    def __init__(self):
        self.t = T0

    def advance(self, sec):
        self.t += real_dt.timedelta(seconds=sec)


def _run(plan, offset=0):
    clock = Clock()
    fake_dt = SimpleNamespace(
        datetime=SimpleNamespace(now=lambda: clock.t),
        timedelta=real_dt.timedelta,
    )
    player = sp.StationPlayer.__new__(sp.StationPlayer)
    player._l = MagicMock()
    player.mpv = MagicMock(duration=10_000)
    player._pending_response = None
    player.skip_reception_check = True
    player.scrambler = None
    player.web_process = None
    player.station_config = {}
    player.input_check_fn = lambda: None
    player._close_now_playing = lambda: None
    ends, starts = [], []

    def play_file(path, **kw):
        starts.append(clock.t)
        clock.advance(LOAD)
        return True

    player.play_file = play_file
    with patch.object(sp, "datetime", fake_dt), patch.object(sp.time, "sleep", clock.advance):
        orig_info = player._l.info

        def info(msg, *a, **k):
            if str(msg).startswith("Segment ended"):
                ends.append(clock.t)
            return orig_info(msg, *a, **k)

        player._l.info = info
        outcome = player._play_from_point(PlayPoint(0, offset, plan, "Movie"))
    return outcome, starts, ends


def _plan(durations):
    return [SimpleNamespace(path=f"f{i}.mp4", duration=d, skip=0, content_type="feature") for i, d in enumerate(durations)]


def test_load_time_does_not_accumulate_across_a_break():
    # movie segment, pre cue, 5 ads, post cue, movie segment: the layout of a ch 10 break
    durations = [423.4, 7, 29.9, 29.9, 14.9, 29.7, 15.0, 7, 423.4]
    outcome, starts, ends = _run(_plan(durations))
    assert outcome.status == sp.PlayerState.SUCCESS
    expected, acc = [], 0.0
    for d in durations:
        acc += d
        expected.append(T0 + real_dt.timedelta(seconds=acc))
    for got, want in zip(ends, expected):
        assert abs((got - want).total_seconds()) <= 0.06, (got, want)


def test_offset_into_first_entry_is_respected():
    # tuned in 100 s into the first entry: it plays the remaining 323.4 s, then the next entries on schedule
    outcome, starts, ends = _run(_plan([423.4, 7, 30]), offset=100)
    assert abs((ends[0] - T0).total_seconds() - 323.4) <= 0.06
    assert abs((ends[-1] - T0).total_seconds() - 360.4) <= 0.06
