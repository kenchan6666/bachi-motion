#!/usr/bin/env python3
"""check.py v2  用法: BM_ROOT=<clone> node tests/dump.js <tja> [measures] > o.json && python3 tests/check.py o.json
JUMP : 单帧棒尖位移 > 30px（击中前 3 帧的下砸段放宽到 45px，击中后一帧豁免）
HOVER: 抬手中(lift>0.5)棒尖几乎不动(<2px/帧)连续 > 6 帧(0.1s，按主人参考片) —— 举着发呆/顶点定格
REST : 休息段(距上一击 > 0.35s 且距下一击 > 0.33s)棒尖单帧位移 > 0.5px —— 休息必须完全静止
EARLY: 距下一击 > 0.33s 时已经抬手(lift > 0.10) —— 蓄力起手太早（仅间隔 > 0.4s 时检查）
注意：v1 的 HOLD 把「待机静止」当错误，已废除；静止在休息段是对的。

HOVER 窄豁免（只放行这一种，不放宽全局门槛，不改幅度/起手）：
  休息接密串、顶点叠在待机高度。须同时满足：
  1. 同手上一击到本击间隔 > 0.35s（与 REST 的「上一击后」门槛一致，视为休息）
  2. 本击谱面相邻上一音间隔 ≤ 0.10s（与引擎 LIFT_DT_DENSE 一致，设计高度走密串 36px）
  3. 这段顶点 tip.y 距该手待机高度 ≤ 8px
     待机高度 = 该手休息段（距上一击 > 0.35s 且距下一击 > 0.33s）且几乎静止（disp ≤ 0.5）的 tip.y 中位数；
     若整段没有这种休息样本，则不豁免。
  密串中间的真定格：同手间隔短，不满足 (1)，仍报 HOVER。
"""
import json, sys

DT = 1 / 60
REST_AFTER = 0.35
REST_BEFORE = 0.33
DENSE_DT = 0.10
IDLE_Y_TOL = 8.0
INF = 1e9


def _median(xs):
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return None
    return xs[n // 2]


def _same_hits(ev, hand):
    return sorted(e[0] for e in ev if e[1] == hand)


def _all_times(ev):
    return sorted(e[0] for e in ev)


def _prev_next(hits, t):
    prv = max([e for e in hits if e <= t + 1e-9] + [-INF])
    nxt = min([e for e in hits if e > t + 1e-9] + [INF])
    return prv, nxt


def idle_tip_y(hand, ev, out):
    """Standby tip.y: median tip.y while this hand is in a still rest window."""
    hits = _same_hits(ev, hand)
    ys = []
    for x in out:
        if x[1] != hand or len(x) < 6:
            continue
        t, disp, y = x[0], x[2], x[5]
        prv, nxt = _prev_next(hits, t)
        if t - prv > REST_AFTER and nxt - t > REST_BEFORE and disp <= 0.5:
            ys.append(y)
    return _median(ys)


def chart_prev_gap(all_times, t_hit):
    prev = [e for e in all_times if e < t_hit - 1e-6]
    if not prev:
        return INF
    return t_hit - max(prev)


def is_rest_dense_idle_hover(t0, run_ys, hits, all_times, idle_y):
    """True iff this HOVER run is rest → dense, peak sitting on standby height."""
    nxt = min([e for e in hits if e > t0 + 1e-9] + [INF])
    prv = max([e for e in hits if e <= t0 + 1e-9] + [-INF])
    if nxt >= INF / 2 or prv <= -INF / 2:
        return False
    if nxt - prv <= REST_AFTER:
        return False
    if chart_prev_gap(all_times, nxt) > DENSE_DT + 1e-6:
        return False
    if idle_y is None or not run_ys:
        return False
    peak_y = _median(run_ys)
    if peak_y is None or abs(peak_y - idle_y) > IDLE_Y_TOL:
        return False
    return True


def check_data(d, verbose=False):
    ev = d["ev"]
    o = d["out"]
    all_times = _all_times(ev)
    cnt = {"JUMP": 0, "HOVER": 0, "REST": 0, "EARLY": 0}
    lines = []

    def rep(k, *a):
        cnt[k] += 1
        text = " ".join(str(x) for x in (k,) + a)
        if verbose or cnt[k] <= 8:
            lines.append(text)

    for h in "LR":
        hits = _same_hits(ev, h)
        idle_y = idle_tip_y(h, ev, o)
        s = [x for x in o if x[1] == h]
        run = 0
        run_ys = []

        def flush_hover(t_break):
            nonlocal run, run_ys
            if run > 6:
                t0 = t_break - run * DT
                if not is_rest_dense_idle_hover(t0, run_ys, hits, all_times, idle_y):
                    rep("HOVER", h, round(t0, 3), run, "frames")
            run = 0
            run_ys = []

        for x in s:
            t, disp, lift = x[0], x[2], x[4]
            tip_y = x[5] if len(x) > 5 else None
            # JUMP/REST/EARLY 哨兵与旧版一致（-9 / 99），避免改动长谱在 99s 之后的既有行为
            prv = max([e for e in hits if e <= t + 1e-9] + [-9])
            nxt = min([e for e in hits if e > t + 1e-9] + [99])
            strike = any(-DT * 1.01 < t - e < DT * 1.01 for e in hits)
            down = (nxt - t) <= 3 * DT * 1.01
            lim = 45 if down else 30
            if disp > lim and not strike and min(t - prv, nxt - t) < 1.0:
                rep("JUMP", h, round(t, 3), disp)
            if t - prv > REST_AFTER and nxt - t > REST_BEFORE and disp > 0.5:
                rep("REST", h, round(t, 3), disp)
            if nxt - prv > 0.4 and nxt - t > REST_BEFORE and t - prv > REST_AFTER and lift > 0.10:
                rep("EARLY", h, round(t, 3), round(lift, 3))
            if lift > 0.5 and disp < 2.0 and not strike:
                run += 1
                run_ys.append(tip_y)
            else:
                flush_hover(t)
        if s:
            flush_hover(s[-1][0] + DT)

    return cnt, lines


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    verbose = "-v" in argv
    args = [a for a in argv if a != "-v"]
    if not args:
        print("Usage: python3 tests/check.py o.json [-v]", file=sys.stderr)
        return 2
    d = json.load(open(args[0]))
    cnt, lines = check_data(d, verbose=verbose)
    for line in lines:
        print(line)
    bad = sum(cnt.values())
    print(" ".join(f"{k}={v}" for k, v in cnt.items()))
    print("FAIL" if bad else "PASS", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
