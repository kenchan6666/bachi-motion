#!/usr/bin/env python3
"""HOVER 窄豁免回归：休息接密串且顶点叠在待机高度时不报；密串中间真定格仍报。

不依赖本家谱。构造 dump JSON（ev / out）直接喂给 check.py。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check import check_data, DT, REST_AFTER, DENSE_DT  # noqa: E402

# 待机棒尖 y：锁定的咚落点 314 减去 IDLE_HOVER_PX 40。
# 只用于自制 dump；check.py 仍从这段 dump 自己量待机高度，门槛不改。
IDLE_Y = 274.0
HIGH_Y = 140.0


def _out_frame(t, hand, disp, lift, y):
    return [round(t, 4), hand, round(disp, 1), 0.0, round(lift, 3), round(y, 1)]


def _fill(out, hand, t0, t1, disp=0.0, lift=0.0, y=IDLE_Y):
    t = t0
    while t <= t1 + 1e-9:
        out.append(_out_frame(t, hand, disp, lift, y))
        t += DT


def _result(d, verbose=False):
    cnt, lines = check_data(d, verbose=verbose)
    return cnt, lines, sum(cnt.values())


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_rest_then_dense_idle_peak_exempt():
    """同手长间隔 + 谱面上一音 ≤16 分 + 顶点在待机高度 → 不报 HOVER。

    三处结构对齐里狂千本樱那 3 个 FAIL（12/10/11 帧），但用自制时间轴，不含本家谱。
    """
    ev = []
    out = []
    # (prev L, other-hand note just before this L, this L, hover frames)
    cases = [
        (1.000, 2.315, 2.364, 12),  # same-hand 1.364s, chartPrev 0.049s
        (5.000, 5.487, 5.584, 10),  # same-hand 0.584s, chartPrev 0.097s
        (9.000, 10.266, 10.363, 11),  # same-hand 1.363s, chartPrev 0.097s
    ]
    ev.append([0.200, "R", "don", "single"])  # so early rest windows are valid
    _fill(out, "R", 0.00, 11.00, disp=0.0, lift=0.0, y=IDLE_Y)

    for prev_l, other_t, this_l, nframes in cases:
        ev.append([prev_l, "L", "don", "single"])
        ev.append([other_t, "R", "ka", "single"])
        ev.append([this_l, "L", "don", "single"])

        # still rest at idle (lift=0) until windup; then lift=1 but tip stays at idle
        hover_start = this_l - nframes * DT - 3 * DT
        rest_from = prev_l + 0.20
        _fill(out, "L", rest_from, hover_start - DT, disp=0.0, lift=0.0, y=IDLE_Y)
        _fill(out, "L", hover_start, hover_start + (nframes - 1) * DT, disp=0.3, lift=1.0, y=IDLE_Y)
        # downswing breaks the run (disp >= 2, lift drops)
        t = hover_start + nframes * DT
        for i, lift in enumerate((0.85, 0.55, 0.20, 0.0)):
            out.append(_out_frame(t + i * DT, "L", 4.0, lift, IDLE_Y + 8 + i * 8))
        # contact-ish then back to idle after the hit
        _fill(out, "L", this_l + DT, this_l + 0.15, disp=0.0, lift=0.0, y=IDLE_Y)

    ev.sort(key=lambda e: e[0])
    out.sort(key=lambda x: (x[0], x[1]))
    cnt, lines, bad = _result({"ev": ev, "out": out}, verbose=True)
    _assert(cnt["HOVER"] == 0, f"rest→dense idle peak should be exempt, got {cnt} {lines}")
    _assert(bad == 0, f"expected PASS 0, got {cnt} {lines}")
    print("ok  rest-then-dense idle peak is exempt (3 synthetic hovers)")


def test_mid_dense_freeze_still_fails():
    """密串/短语中间定格：即使顶点就在待机高度、且能测到待机样本，仍报 HOVER。

    同手间隔取 0.24s（约 14 帧，短于休息门槛 0.35s，又能放下连续 10 帧定格）。
    纯 16 分同手间隔只有约 6 帧，本身挤不进 >6 帧的 HOVER 门槛。
    """
    ev = []
    out = []
    # lead-in rest so idle_y can be measured
    ev.append([0.200, "L", "don", "single"])
    ev.append([0.250, "R", "don", "single"])
    _fill(out, "L", 0.00, 1.80, disp=0.0, lift=0.0, y=IDLE_Y)
    _fill(out, "R", 0.00, 3.50, disp=0.0, lift=0.0, y=IDLE_Y)

    # mid-string same-hand hits; 0.24s < REST_AFTER, so exemption must not apply
    times = [2.00, 2.24, 2.48, 2.72]
    for t in times:
        ev.append([t, "L", "don", "single"])
        ev.append([round(t - 0.08, 3), "R", "ka", "single"])  # chartPrev 0.08s, dense

    # motion into the string, then a 10-frame freeze strictly between 2.24 and 2.48
    _fill(out, "L", 1.81, 2.24 - DT, disp=1.0, lift=0.2, y=IDLE_Y + 4)
    freeze_start = 2.24 + 2 * DT
    nframes = 10
    freeze_end = freeze_start + (nframes - 1) * DT
    assert freeze_end < 2.48 - 2 * DT, (freeze_start, freeze_end)
    _fill(out, "L", freeze_start, freeze_end, disp=0.2, lift=1.0, y=IDLE_Y)
    t = freeze_start + nframes * DT
    for i, lift in enumerate((0.80, 0.40, 0.0)):
        out.append(_out_frame(t + i * DT, "L", 5.0, lift, IDLE_Y + 10 + i * 10))
    _fill(out, "L", 2.48 + DT, 2.70, disp=0.5, lift=0.2, y=IDLE_Y + 4)
    _fill(out, "L", 2.73, 3.50, disp=0.0, lift=0.0, y=IDLE_Y)

    ev.sort(key=lambda e: e[0])
    out.sort(key=lambda x: (x[0], x[1]))
    cnt, lines, bad = _result({"ev": ev, "out": out}, verbose=True)
    hovers = [ln for ln in lines if ln.startswith("HOVER L")]
    _assert(cnt["HOVER"] >= 1, f"mid-dense freeze must still FAIL HOVER, got {cnt} {lines}")
    _assert(any("frames" in ln for ln in hovers), f"expected HOVER L frames, got {lines}")
    # same-hand gaps are 0.08s, must not have been exempted
    _assert(bad >= 1, f"expected FAIL, got {cnt} {lines}")
    print(f"ok  mid-dense freeze still reported ({hovers[0]})")


def test_rest_then_sparse_high_peak_still_fails():
    """休息后接疏间隔（走满幅，不是密串高度）的顶点定格，仍报 HOVER。"""
    ev = [
        [0.200, "L", "don", "single"],
        [0.250, "R", "don", "single"],
        [2.000, "L", "don", "single"],
    ]
    out = []
    _fill(out, "R", 0.00, 2.20, disp=0.0, lift=0.0, y=IDLE_Y)
    _fill(out, "L", 0.00, 1.70, disp=0.0, lift=0.0, y=IDLE_Y)
    nframes = 10
    hover_start = 2.000 - nframes * DT - 3 * DT
    _fill(out, "L", hover_start, hover_start + (nframes - 1) * DT, disp=0.2, lift=1.0, y=HIGH_Y)
    t = hover_start + nframes * DT
    for i, lift in enumerate((0.80, 0.40, 0.0)):
        out.append(_out_frame(t + i * DT, "L", 6.0, lift, HIGH_Y + 20 + i * 20))
    _fill(out, "L", 2.000 + DT, 2.20, disp=0.0, lift=0.0, y=IDLE_Y)

    ev.sort(key=lambda e: e[0])
    out.sort(key=lambda x: (x[0], x[1]))
    cnt, lines, _bad = _result({"ev": ev, "out": out}, verbose=True)
    _assert(cnt["HOVER"] >= 1, f"sparse high-peak hover must still FAIL, got {cnt} {lines}")
    print(f"ok  rest-then-sparse high peak still reported ({[ln for ln in lines if ln.startswith('HOVER')][0]})")


def test_rest_then_dense_but_high_peak_still_fails():
    """休息接密串，但顶点远离待机高度（不是叠在待机上）→ 仍报 HOVER。"""
    ev = [
        [0.200, "L", "don", "single"],
        [1.900, "R", "ka", "single"],
        [1.997, "L", "don", "single"],  # chartPrev 0.097s, same-hand 1.797s
    ]
    out = []
    _fill(out, "R", 0.00, 2.20, disp=0.0, lift=0.0, y=IDLE_Y)
    _fill(out, "L", 0.40, 1.70, disp=0.0, lift=0.0, y=IDLE_Y)
    nframes = 10
    hover_start = 1.997 - nframes * DT - 3 * DT
    _fill(out, "L", hover_start, hover_start + (nframes - 1) * DT, disp=0.2, lift=1.0, y=HIGH_Y)
    t = hover_start + nframes * DT
    for i, lift in enumerate((0.80, 0.40, 0.0)):
        out.append(_out_frame(t + i * DT, "L", 6.0, lift, HIGH_Y + 20 + i * 20))
    _fill(out, "L", 1.997 + DT, 2.20, disp=0.0, lift=0.0, y=IDLE_Y)

    ev.sort(key=lambda e: e[0])
    out.sort(key=lambda x: (x[0], x[1]))
    cnt, lines, _bad = _result({"ev": ev, "out": out}, verbose=True)
    _assert(cnt["HOVER"] >= 1, f"dense but high peak must still FAIL, got {cnt} {lines}")
    print(f"ok  rest-then-dense high peak still reported ({[ln for ln in lines if ln.startswith('HOVER')][0]})")


def main():
    # sanity: thresholds used in comments stay aligned with check.py
    assert REST_AFTER == 0.35 and DENSE_DT == 0.10
    test_rest_then_dense_idle_peak_exempt()
    test_mid_dense_freeze_still_fails()
    test_rest_then_sparse_high_peak_still_fails()
    test_rest_then_dense_but_high_peak_still_fails()
    print("All HOVER exemption tests passed.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("FAIL:", e, file=sys.stderr)
        sys.exit(1)
