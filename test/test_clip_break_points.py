from fs42.liquid_blocks import LiquidBlock

# Chapter starts from a real SpongeBob double episode (two stories, scene-level chapters,
# last chapter = "End Credits" at 1418s of 1472s).
SPONGEBOB_STARTS = [
    0.0, 45.087, 47.089, 55.055, 125.083, 216.007, 316.107, 356.022, 466.049, 544.002,
    743.076, 746.037, 754.003, 816.024, 1052.051, 1106.022, 1153.235, 1267.141, 1312.061,
    1407.156, 1418.0,
]
SPONGEBOB_LEN = 1472.013


def _chapters(starts):
    return [{"chapter_start": s} for s in starts]


def _break_starts(segments):
    return [s["chapter_start"] for s in segments[1:]]


def _assert_contiguous(segments, length):
    assert segments[0]["chapter_start"] == 0.0
    assert segments[-1]["chapter_end"] == length
    for a, b in zip(segments, segments[1:]):
        assert a["chapter_end"] == b["chapter_start"]


def test_one_break_lands_between_stories_not_credits():
    segs = LiquidBlock.clip_break_points(_chapters(SPONGEBOB_STARTS), 2, SPONGEBOB_LEN)
    assert _break_starts(segs) == [743.076]
    _assert_contiguous(segs, SPONGEBOB_LEN)


def test_two_breaks_are_spread_by_time_and_avoid_credits():
    segs = LiquidBlock.clip_break_points(_chapters(SPONGEBOB_STARTS), 3, SPONGEBOB_LEN)
    breaks = _break_starts(segs)
    assert len(breaks) == 2
    assert all(SPONGEBOB_LEN - b >= LiquidBlock.BREAK_TAIL_GUARD for b in breaks)
    # closest chapters to 1/3 and 2/3 of the runtime
    assert breaks == [466.049, 1052.051]
    _assert_contiguous(segs, SPONGEBOB_LEN)


def test_few_chapters_with_credits_chapter_drops_the_credits_break():
    # mid-point chapter plus an end-credits chapter 60s before the end
    segs = LiquidBlock.clip_break_points(_chapters([0.0, 700.0, 1340.0]), 3, 1400.0)
    assert _break_starts(segs) == [700.0]
    _assert_contiguous(segs, 1400.0)


def test_exact_chapter_count_still_drops_credits_break():
    # real Scooby-Doo file: cold open, act 1, act 2, end credits; exactly as many chapters as segments wanted
    segs = LiquidBlock.clip_break_points(_chapters([0.0, 64.064, 642.058, 1327.493]), 4, 1363.626)
    breaks = _break_starts(segs)
    assert all(1363.626 - b >= LiquidBlock.BREAK_TAIL_GUARD for b in breaks)
    assert breaks == [64.064, 642.058]
    _assert_contiguous(segs, 1363.626)


def test_few_chapters_without_credits_chapter_unchanged():
    segs = LiquidBlock.clip_break_points(_chapters([0.0, 500.0, 1000.0]), 3, 1400.0)
    assert _break_starts(segs) == [500.0, 1000.0]
