#!/usr/bin/env python3
"""check.py v2  用法: BM_ROOT=<clone> node tests/dump.js <tja> [measures] > o.json && python3 tests/check.py o.json
JUMP : 单帧棒尖位移 > 30px（击中前 3 帧的下砸段放宽到 45px，击中后一帧豁免）
HOVER: 抬手中(lift>0.5)棒尖几乎不动(<2px/帧)连续 > 6 帧(0.1s，按主人参考片) —— 举着发呆/顶点定格
REST : 休息段(距上一击 > 0.35s 且距下一击 > 0.33s)棒尖单帧位移 > 0.5px —— 休息必须完全静止
EARLY: 距下一击 > 0.33s 时已经抬手(lift > 0.10) —— 蓄力起手太早（仅间隔 > 0.4s 时检查）
注意：v1 的 HOLD 把「待机静止」当错误，已废除；静止在休息段是对的。"""
import json, sys
d = json.load(open(sys.argv[1]))
ev = d['ev']
o = d['out']
dt = 1 / 60
cnt = {'JUMP': 0, 'HOVER': 0, 'REST': 0, 'EARLY': 0}
verbose = '-v' in sys.argv

def rep(k, *a):
    cnt[k] += 1
    if verbose or cnt[k] <= 8:
        print(k, *a)

for h in 'LR':
    hits = sorted(e[0] for e in ev if e[1] == h)
    s = [x for x in o if x[1] == h]
    run = 0
    for x in s:
        t, disp, lift = x[0], x[2], x[4]
        prv = max([e for e in hits if e <= t + 1e-9] + [-9])
        nxt = min([e for e in hits if e > t + 1e-9] + [99])
        strike = any(-dt * 1.01 < t - e < dt * 1.01 for e in hits)
        down = (nxt - t) <= 3 * dt * 1.01
        lim = 45 if down else 30
        if disp > lim and not strike and min(t - prv, nxt - t) < 1.0:
            rep('JUMP', h, round(t, 3), disp)
        if t - prv > 0.35 and nxt - t > 0.33 and disp > 0.5:
            rep('REST', h, round(t, 3), disp)
        if nxt - prv > 0.4 and nxt - t > 0.33 and t - prv > 0.35 and lift > 0.10:
            rep('EARLY', h, round(t, 3), round(lift, 3))
        if lift > 0.5 and disp < 2.0 and not strike:
            run += 1
        else:
            if run > 6:
                rep('HOVER', h, round(t - run * dt, 3), run, 'frames')
            run = 0

bad = sum(cnt.values())
print(' '.join(f'{k}={v}' for k, v in cnt.items()))
print('FAIL' if bad else 'PASS', bad)
sys.exit(1 if bad else 0)
