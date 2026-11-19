"use strict";

/* ===================================================================
 * 1. CONFIG / GEOM —— 尺寸、颜色、时长（颜色全部来自汐月 v2 规格）
 * =================================================================== */
const COL = {
  outline: "#2B2320",                  // 统一描边 3px
  skin: "#FFE3CC", tint: "#FFC9B8",      // 指尖/指节一点点浅粉（α0.4）
  shaft: "#F3E6C8", tape: "#B9A6E8", tapeLine: "#8F7BC8",   // 鼓棒 v2.3：米白棒身、浅紫缠胶带、黑环
  don: "#E8503A", ka: "#4FE0E6", gold: "#F5C542",
  R: "#5FC99A",                        // 右手（正手）袖口 + 残影：薄荷绿
  L: "#F49AC1",                        // 左手（逆手）袖口 + 残影：樱花粉（v2.3 起，避开浅紫胶带）
  face: "#F6EEDC", studBand: "#E9C48A", body: "#C8342A", bodyDark: "#9E2620", stud: "#2B2320",
  noteDon: "#E8503A", noteKa: "#3FB6E8",   // 谱面音符颜色（和谱面图一致）
};
const OUT = 3;   // 描边宽度

const CONFIG = {
  RISE: 0.15,           // 完全抬起 / 落下用时（播放秒）
  FULL_LIFT: 1,
  ROLL_REBOUND: 1 / 3,  // 滚奏回弹 = 单击高度的 1/3
  ROLL_PAIR_GAP: 0.12,  // 同手相邻两个滚奏音 ≤ 这个间隔 = 一次落下打两下
  BEND_PX: 50,          // 内刷/外刷弧线弯曲幅度
  WOBBLE_DEG: 4,        // 滚奏回弹：鼓棒以捏点为轴晃，两下间隔 ≥80ms 时 ±6°
  WOBBLE_DEG_SHORT: 4,  //            间隔 ≤50ms（BPM300 的 16 分）时 ±4°
  WOBBLE_DUR: 0.08,     //            时长 = 0.8×间隔，最多 80ms
  HAND_SCALE: 1.76,     // 手的几何缩放（裁到指关节后，整卡尺寸下也要看得清）
  TAPE_W: 30,           // 胶带握把宽（结实粗壮）；滚奏 ×0.92
  SHAFT_W: 26,          // 棒身在黑环处 26px，收到棒尖 ≈9px 圆头
  TAPE_LEN: 221,        // 胶带长度（略长于 1/3，手上面多露一截紫色）
  STUB: 76,             // 捏点以下的棒尾长度（约胶带 1/4~1/3）：穿过虎口继续藏到手背下面，圆头不会露在虎口里
  RING_W: 10,
  NOD_PX: 1.5,          // 滚奏：手最多点头 1~2px，棒子绕捏点转
  SINGLE_FOLLOW: 0.7,   // 单击：整只手 + 鼓棒一起往下砸（握点跟着棒尖走 70%，棒子是刚体）
  BLUR_DT: 0.1,         // 滚奏两下间隔 < 100ms 且 rate==1 → 残影合并成扇形模糊
  // 画师手图（默认 hands=img）。按文件名加载（相对路径，file:// 也能显示），换图只要同名覆盖即可。
  //   anchor  = 图里的捏点像素坐标（鼓棒旋转轴，棒子从拇指下面穿过）—— 锚点.txt 给的是拇指尖，这里微调到棒子中线上
  //   axisDeg = 图里「棒尖方向」的角度（屏幕坐标，-90 = 正上）；画的时候把它转到当前鼓棒的方向
  //   scale   = 图片缩放（让手和鼓的比例接近 hand_back_draft_v1.jpg）
  //   band    = 可选的腕带矩形（图片像素坐标 {x,y,w,h}），null = 腕带画在胶带上
  HAND_IMG: {   // 只有手的 PNG（棒子位置留空）。pinch = 拇指和食指之间缝隙在捏点那一行的中心（图片像素）= 鼓棒旋转轴；
                //   锚点.txt 给的是缝隙最下端（胶带在手里的最下端），棒尾比它再往下一截，藏在手背下面
    R: { roll:   { href: "assets/右手_滚奏捏棒.png", w: 435, h: 1142, pinch: [164, 672], axisDeg: -102.4, scale: 0.48, band: null },
         single: { href: "assets/右手_单击握拳.png", w: 421, h: 1139, pinch: [142, 662], axisDeg: -100.6, scale: 0.48, band: null } },
    L: { roll:   { href: "assets/左手_滚奏捏棒.png", w: 435, h: 1142, pinch: [270, 672], axisDeg: -77.6, scale: 0.48, band: null },
         single: { href: "assets/左手_单击握拳.png", w: 421, h: 1139, pinch: [278, 662], axisDeg: -79.4, scale: 0.48, band: null } },
  },
  PIVOT_Y: { img: 700, vector: 806, none: 806 },   // 捏点高度：图片手露到手腕；矢量手裁到指关节
  DON_RISE: 0.05, DON_FALL: 0.2,            // 咚：半边鼓面 0.05s 亮起，0.2s 退回
  KA_DUR: 0.25, KA_W: 14, KA_SPAN: 100,     // 咔：鼓边青光 100° 弧，宽 14，0.25s
  GOLD_DUR: 0.35, GOLD_W: 16,               // 插音金光
  SECOND_HIT: 0.8,                          // 滚奏第二下亮度/光宽 80%
  REBOUND_ARC_FADE: 0.15,
  TRAIL_STEP: 1 / 60,   // 残影每 1 帧（60fps）留 1 层
  TRAIL_ALPHA: [0.40, 0.25, 0.12],
  TRAIL_ARC_SPAN: 0.1,  // 方向弧线回溯 0.1s
  LABEL_DUR: 0.22,
  LEAD_IN: 0.7, TAIL_TIME: 0.5,
  BASE_PX_PER_SEC: 600,
};

const GEOM = {
  face: { cx: 400, cy: 300, rx: 190, ry: 118 },   // 米白椭圆鼓面
  bodyBottom: 548,                                 // 鼓身往下收成圆底的最低点
  lane: { y: 70, judgeX: 92, x0: 30, x1: 775 },
  card: { x: 40, y: 128, w: 720, h: 720 },
  hands: {
    // anchorX：手大概在的 x；kaAng：咔的鼓边位置（度，0 = 右，-90 = 上）
    // rest：举起时棒尖所在（在鼓面椭圆以内，靠这只手那一侧的上方）
    // 第一人称：手从画面底部进来，pivot = 捏点（手几乎不动）；两根棒呈「八」字往鼓面中上部伸
    L: { pivot: { x: 255, y: 806 }, don: { x: 350, y: 272 }, kaAng: 200, out: -1, rest: { x: 338, y: 208 } },
    R: { pivot: { x: 545, y: 806 }, don: { x: 450, y: 272 }, kaAng: -20, out: 1, rest: { x: 462, y: 208 } },
  },
};
// 咔落点：鼓面边缘往里一点
for (const h of ["L", "R"]) GEOM.hands[h].ka = ellipsePt(GEOM.hands[h].kaAng, -8);

function ellipsePt(deg, grow = 0) {
  const f = GEOM.face, a = deg * Math.PI / 180;
  return { x: f.cx + (f.rx + grow) * Math.cos(a), y: f.cy + (f.ry + grow) * Math.sin(a) };
}

/* ===================================================================
 * 2. 纯函数（不碰 DOM）
 * =================================================================== */
const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, k) => ({ x: a.x * k, y: a.y * k }),
  lerp: (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }),
  len: (a) => Math.hypot(a.x, a.y),
  norm: (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  dot: (a, b) => a.x * b.x + a.y * b.y,
  rot: (p, c, deg) => { const r = deg * Math.PI / 180, s = Math.sin(r), k = Math.cos(r), dx = p.x - c.x, dy = p.y - c.y;
                        return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k }; },
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (u) => u * u * (3 - 2 * u);

/** grip 统一成 roll（滚奏，捏）/ single（单击，握）。旧写法 pinch/full 也认。 */
function normGrip(g) { return (g === "roll" || g === "pinch") ? "roll" : "single"; }
/** route：内刷/inner、外刷/outer、其他 = straight（直上直下，默认） */
function normRoute(r) {
  if (r === "内刷" || r === "inner") return "inner";
  if (r === "外刷" || r === "outer") return "outer";
  return "straight";
}

function normalizeEvents(data) {
  return (data.events || []).map((e, i) => ({
    i, t: +e.t, hand: e.hand === "L" ? "L" : "R",
    face: e.face === "ka" ? "ka" : "don",
    grip: normGrip(e.grip), route: normRoute(e.route),
    inserted: !!e.inserted, src: e.src || "",
    both: !!e.both, big: !!e.big || !!e.both,
  })).sort((a, b) => a.t - b.t || (a.hand === "R" ? -1 : 1));
}

/**
 * 每只手的落点序列。滚奏：同手相邻两个 roll 音（间隔 ≤ ROLL_PAIR_GAP）= 一次落下打两下。
 * 返回 { R:[...], L:[...], second:Set(事件 i) } —— second 是滚奏第二下（效果缩到 80%）。
 */
function buildHandTracks(events, routeOverride = "data") {
  const tracks = { R: [], L: [], second: new Set() };
  let strokeId = 0;
  for (const hand of ["R", "L"]) {
    const evs = events.filter((e) => e.hand === hand);
    for (let k = 0; k < evs.length; k++) {
      const e = evs[k], next = evs[k + 1];
      const route = routeOverride === "data" ? e.route : routeOverride;
      const mk = (ev, idx) => ({ t: ev.t, ev, face: ev.face, grip: ev.grip, route,
                                 target: GEOM.hands[hand][ev.face], stroke: strokeId, idxInStroke: idx });
      if (e.grip === "roll" && next && next.grip === "roll" && next.t - e.t <= CONFIG.ROLL_PAIR_GAP) {
        const c0 = mk(e, 0), c1 = mk(next, 1);
        c0.pairDt = c1.pairDt = next.t - e.t;      // 滚奏两下的间隔（晃动用）
        tracks[hand].push(c0, c1);
        tracks.second.add(next.i);
        k++;
      } else tracks[hand].push(mk(e, 0));
      strokeId++;
    }
  }
  return tracks;
}

function findSegment(track, t) {
  let a = null, b = null;
  for (const c of track) { if (c.t <= t) a = c; else { b = c; break; } }
  return { a, b };
}

/** 两个落点之间的抬起高度：贴鼓 0，最高 peak；打击瞬间有速度（尖角） */
function arcHeight(t, ta, tb, peak) {
  const d = tb - ta, R = CONFIG.RISE;
  if (d <= 2 * R) { const u = clamp01((t - ta) / d); return peak * 4 * u * (1 - u); }
  if (t - ta < R) { const s = (t - ta) / R; return peak * (1 - (1 - s) * (1 - s)); }
  if (tb - t < R) { const s = (tb - t) / R; return peak * (1 - (1 - s) * (1 - s)); }
  return peak;
}

/**
 * 滚奏落点之后的晃动（度），以捏点为轴。
 * 时长 = 0.8 × 这次滚奏两下的间隔（最多 80ms）—— 所以在下一下之前自然归零，不需要硬截断。
 * 幅度：间隔 ≤50ms 时 ±4°，≥80ms 时 ±6°，中间线性过渡。
 */
function wobbleAfter(contact, t) {
  if (!contact || contact.grip !== "roll" || !contact.pairDt) return 0;
  const dt = contact.pairDt;
  const dur = Math.min(CONFIG.WOBBLE_DUR, 0.8 * dt);
  const amp = CONFIG.WOBBLE_DEG_SHORT + (CONFIG.WOBBLE_DEG - CONFIG.WOBBLE_DEG_SHORT) * clamp01((dt - 0.05) / (0.08 - 0.05));
  const s = (t - contact.t) / dur;
  if (s <= 0 || s >= 1) return 0;
  // 包络 sin(2πs)·(1-s) 两端为 0、峰值约 0.77，除掉它让峰值 = amp
  return amp / 0.77 * Math.sin(2 * Math.PI * s) * (1 - s);
}

/** 内刷/外刷：棒尖在两个落点之间往鼓心弯（inner）或往外甩（outer） */
function routeBend(pa, pb, route, k) {
  if (route === "straight" || k <= 0) return { x: 0, y: 0 };
  let chord = V.sub(pb, pa);
  if (V.len(chord) < 1) chord = { x: 0, y: -1 };          // 同一落点：抬起方向（往上）
  const perp = V.norm({ x: -chord.y, y: chord.x });
  const mid = V.lerp(pa, pb, 0.5);
  const C = { x: GEOM.face.cx, y: GEOM.face.cy };
  const towardC = V.dot(perp, V.sub(C, mid)) > 0 ? 1 : -1;
  return V.mul(perp, (route === "inner" ? towardC : -towardC) * CONFIG.BEND_PX * k);
}

/**
 * 核心纯函数：某只手在播放时间 t 的姿势。
 * 返回 { tip, grip:握点, gripType, handDeg（手的朝向）, stickDeg（棒的朝向，含晃动）, lift }
 */
function poseAt(hand, track, t, opts = {}) {
  const H = GEOM.hands[hand];
  const { a, b } = findSegment(track, t);
  let lift, base, bend = { x: 0, y: 0 }, grip, wobble = 0, buzz = null;   // buzz = 正在滚奏的那一对（画震动线/残影用）
  if (!a && !b) { lift = 1; base = H.rest; grip = "single"; }
  else if (!a) {
    const s = clamp01((b.t - t) / CONFIG.RISE);
    lift = 1 - (1 - s) * (1 - s); base = b.target; grip = b.grip;
  } else if (!b) {
    const s = clamp01((t - a.t) / CONFIG.RISE);
    lift = 1 - (1 - s) * (1 - s); base = a.target; grip = a.grip;
    wobble = wobbleAfter(a, t);
    if (wobble) buzz = a;
  } else {
    const u = clamp01((t - a.t) / (b.t - a.t));
    const same = a.stroke === b.stroke;               // 滚奏两下之间 = 回弹
    const peak = same ? CONFIG.ROLL_REBOUND : CONFIG.FULL_LIFT;
    lift = arcHeight(t, a.t, b.t, peak);
    base = V.lerp(a.target, b.target, smooth(u));
    grip = same ? a.grip : (u < 0.5 ? a.grip : b.grip);   // 手型直接切换，不做中间帧
    wobble = wobbleAfter(a, t);
    if (same && a.grip === "roll" || wobble) buzz = a;
    if (!same) bend = routeBend(a.target, b.target, b.route, Math.sin(Math.PI * u) * peak);
  }
  const p = composePose(hand, base, lift, bend, opts.noWobble ? 0 : wobble, grip, base);
  p.buzz = buzz; p.wobble = opts.noWobble ? 0 : wobble;
  return p;
}

/** 落点 + 抬起 + 弯曲 + 晃动 → 棒尖、握点、角度。手在鼓下方，从下往上握棒。 */
function composePose(hand, base, lift, bend, wobble, grip) {
  const H = GEOM.hands[hand];
  if (grip === "single") {
    // 单击：手和棒一起动（刚体）。握点跟着棒尖的位移走 SINGLE_FOLLOW，棒子角度由握点→棒尖决定
    const tipS = V.add(V.lerp(base, H.rest, lift), bend);
    const gripS = V.add(H.pivot, V.mul(V.sub(tipS, base), CONFIG.SINGLE_FOLLOW));
    const d = V.sub(tipS, gripS), deg = Math.atan2(d.y, d.x) * 180 / Math.PI;
    return { tip: tipS, grip: gripS, gripType: grip, handDeg: deg, stickDeg: deg, lift };
  }
  // 举起：棒尖朝鼓面里的 rest 点移动（rest 在鼓面边缘以内），所以停着时棒尖一定在鼓面范围内
  const tip0 = V.add(V.lerp(base, H.rest, lift), bend);
  // 鼓棒以手里的捏点为轴转；手只跟着轻轻点头（往棒尖方向挪 NOD_PX × lift）
  // 手的朝向只看落点（不看抬棒和晃动）→ 滚奏时手几乎不动，只有鼓棒绕捏点转
  const dirH = V.norm(V.sub(base, H.pivot));
  const gripPt = V.add(H.pivot, V.mul(dirH, CONFIG.NOD_PX * lift));   // 手最多点头 1.5px
  const handDeg = Math.atan2(dirH.y, dirH.x) * 180 / Math.PI;
  const tip = wobble ? V.rot(tip0, gripPt, wobble) : tip0;   // 回弹晃动：以捏点为轴
  const dS = V.sub(tip, gripPt);
  return { tip, grip: gripPt, gripType: grip, handDeg, stickDeg: Math.atan2(dS.y, dS.x) * 180 / Math.PI, lift };
}

function noteX(tNote, now, scroll) {
  return GEOM.lane.judgeX + (tNote - now) * CONFIG.BASE_PX_PER_SEC * scroll;
}

/** 咚：每半边鼓面当前亮度 0..1（左右各取最大） */
function faceGlow(events, second, now) {
  const g = { L: 0, R: 0 };
  for (const e of events) {
    if (e.face !== "don") continue;
    const age = now - e.t;
    if (age < 0 || age > CONFIG.DON_RISE + CONFIG.DON_FALL) continue;
    let v = age < CONFIG.DON_RISE ? age / CONFIG.DON_RISE : 1 - (age - CONFIG.DON_RISE) / CONFIG.DON_FALL;
    if (second.has(e.i)) v *= CONFIG.SECOND_HIT;
    g[e.hand] = Math.max(g[e.hand], v);
  }
  return g;
}

/** 当前在显示的打击（咔光、金光、标签用） */
function activeHits(events, now, maxAge) {
  return events.filter((e) => now - e.t >= 0 && now - e.t <= maxAge).map((e) => ({ e, age: now - e.t }));
}

/** 滚奏回弹弧线：第一下 → 第二下 期间显示，第二下后 0.15s 消失 */
function activeReboundArcs(tracks, now) {
  const out = [];
  for (const hand of ["R", "L"]) {
    const tr = tracks[hand];
    for (let k = 0; k + 1 < tr.length; k++) {
      const a = tr[k], b = tr[k + 1];
      if (a.stroke !== b.stroke) continue;
      const end = b.t + CONFIG.REBOUND_ARC_FADE;
      if (now >= a.t && now <= end)
        out.push({ hand, a, b, draw: clamp01((now - a.t) / (b.t - a.t)),
                   fade: now <= b.t ? 1 : 1 - (now - b.t) / CONFIG.REBOUND_ARC_FADE });
    }
  }
  return out;
}

/* ===================================================================
 * 3. 渲染
 * =================================================================== */
const f1 = (n) => (+n).toFixed(1);
function mixWhite(hex, k) {   // 颜色往白色混 k（0..1）
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
/** 椭圆弧折线（a0→a1 度），用来画鼓边光 */
function ellipseArcD(a0, a1, grow, n = 28) {
  let d = "";
  for (let k = 0; k <= n; k++) {
    const p = ellipsePt(a0 + (a1 - a0) * k / n, grow);
    d += (k ? " L" : "M") + f1(p.x) + "," + f1(p.y);
  }
  return d;
}

/** 鼓身轮廓：从鼓面两侧往下收成圆底。dy 往上平移（画深红暗带用） */
function drumBodyD(dy) {
  const F = GEOM.face, by = GEOM.bodyBottom + dy, y0 = F.cy + dy;
  return `M${F.cx - F.rx},${y0} C${F.cx - F.rx},${y0 + 150} ${F.cx - 120},${by} ${F.cx},${by} ` +
         `C${F.cx + 120},${by} ${F.cx + F.rx},${y0 + 150} ${F.cx + F.rx},${y0} Z`;
}

function renderStatic() {
  const F = GEOM.face, L = GEOM.lane, c = GEOM.card;
  let s = "";
  // 谱面轨道
  s += `<rect x="${L.x0}" y="28" width="${L.x1 - L.x0}" height="84" rx="42" fill="#4b4550" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  s += `<line x1="${L.x0 + 20}" y1="${L.y}" x2="${L.x1 - 20}" y2="${L.y}" stroke="#5c5562" stroke-width="2"/>`;
  s += `<circle cx="${L.judgeX}" cy="${L.y}" r="27" fill="#3a343f" stroke="#8d8693" stroke-width="2"/>`;
  s += `<circle cx="${L.judgeX}" cy="${L.y}" r="18" fill="none" stroke="#b9b2bf" stroke-width="2"/>`;
  // 圆角卡片 + 三角格纹 + 鼓后面的浅色方块（照参考视频）
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="30" fill="url(#triPat)" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  s += `<rect x="170" y="150" width="460" height="470" rx="28" fill="#FBFAF8" opacity=".75"/>`;
  // ---- 鼓：全部平涂色块做立体感（汐月 v2.1 §1），鼓身往下收成圆底（溯溯） ----
  const bodyD = drumBodyD(0);
  s += `<defs><clipPath id="cardClip"><rect x="${c.x + 1.5}" y="${c.y + 1.5}" width="${c.w - 3}" height="${c.h - 3}" rx="29"/></clipPath></defs>`;
  s += `<defs><clipPath id="bodyClip"><path d="${bodyD}"/></clipPath></defs>`;
  s += `<path d="${bodyD}" fill="${COL.bodyDark}"/>`;                       // 底部深红暗带（整块先铺深红）
  s += `<path d="${drumBodyD(-24)}" fill="${COL.body}" clip-path="url(#bodyClip)"/>`; // 上面盖鼓身红，露出底下一条
  // 钉带：贴着鼓面下缘的一圈米黄带 + 一排鼓钉
  const band = ellipseArcD(4, 176, 0, 40);
  s += `<g clip-path="url(#bodyClip)" transform="translate(0,24)">
          <path d="${band}" fill="none" stroke="${COL.outline}" stroke-width="32"/>
          <path d="${band}" fill="none" stroke="${COL.studBand}" stroke-width="25"/></g>`;
  for (let a = 18; a <= 162; a += 12) {
    const p = ellipsePt(a, 0);
    if (p.y + 24 < F.cy + 8) continue;
    s += `<circle cx="${f1(p.x)}" cy="${f1(p.y + 24)}" r="4.2" fill="${COL.stud}"/>`;
  }
  s += `<path d="${bodyD}" fill="none" stroke="${COL.outline}" stroke-width="${OUT}" stroke-linejoin="round"/>`;
  // 米白鼓面 + 左上白色椭圆高光（α0.55）
  s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="${COL.face}" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  return s;
}

function renderChart(events, now, scroll) {
  const L = GEOM.lane;
  let s = "";
  const seenBar = new Set();
  for (const e of events) {
    const parts = String(e.src || "").split(":");
    const bar = parts[0], pos = parts[1];
    if (pos !== "0") continue;
    const key = bar + "@" + e.t;
    if (seenBar.has(key)) continue;
    seenBar.add(key);
    const x = noteX(e.t, now, scroll);
    if (x > L.x0 && x < L.x1)
      s += `<line x1="${f1(x)}" y1="32" x2="${f1(x)}" y2="108" stroke="#e8e2ec" stroke-width="2"/>
            <text x="${f1(x + 4)}" y="42" font-size="11" fill="#f5e7a8">${bar}</text>`;
  }
  for (let k = events.length - 1; k >= 0; k--) {   // 早的音画在上面
    const e = events[k], age = now - e.t;
    if (e.both && e.hand === "L") continue;       // 双手音符只画一次
    let x = noteX(e.t, now, scroll), r = e.big ? 20 : 15, op = 1;
    if (age > 0) { if (age > 0.06) continue; x = L.judgeX; r = r + age / 0.06 * 10; op = 1 - age / 0.06; }
    if (x < L.x0 - 20 || x > L.x1 + 20) continue;
    if (e.inserted)
      s += `<circle cx="${f1(x)}" cy="${L.y}" r="${f1(r + 9)}" fill="${COL.gold}" opacity="${f1(0.85 * op)}" filter="url(#goldGlow)"/>`;
    if (e.big)
      s += `<circle cx="${f1(x)}" cy="${L.y}" r="${f1(r + 4.5)}" fill="none" stroke="${COL.outline}" stroke-width="3" opacity="${op}"/>`;
    s += `<circle cx="${f1(x)}" cy="${L.y}" r="${f1(r + 1.5)}" fill="${COL.outline}" opacity="${op}"/>
          <circle cx="${f1(x)}" cy="${L.y}" r="${f1(r)}" fill="${e.face === "don" ? COL.noteDon : COL.noteKa}" stroke="#fff" stroke-width="2.5" opacity="${op}"/>`;
    if (e.both) {
      s += `<text x="${f1(x - 7)}" y="${L.y + 33}" font-size="10" font-weight="700" text-anchor="middle" fill="${COL.R}" opacity="${op}">R</text>
            <text x="${f1(x + 7)}" y="${L.y + 33}" font-size="10" font-weight="700" text-anchor="middle" fill="${COL.L}" opacity="${op}">L</text>`;
    } else {
      s += `<text x="${f1(x)}" y="${L.y + 33}" font-size="10" font-weight="700" text-anchor="middle" fill="${COL[e.hand]}" opacity="${op}">${e.hand}</text>`;
    }
  }
  return s;
}

/* ---------- 鼓棒（v2.3：米白尖头棒身 + 黑环 + 浅紫缠胶带握把） ---------- */
function stickGeom(pose) {
  const r = pose.stickDeg * Math.PI / 180, dir = { x: Math.cos(r), y: Math.sin(r) };
  const k = pose.gripType === "roll" ? 0.82 : 1;   // 滚奏棒略细（胶带 ≈25px），比虎口缝窄，不碰食指轮廓
  const butt = V.sub(pose.grip, V.mul(dir, CONFIG.STUB));               // 棒尾：捏点下面露 1/4 胶带
  const ring = V.add(butt, V.mul(dir, CONFIG.TAPE_LEN));                // 胶带上端 = 黑环
  return { dir, n: { x: -dir.y, y: dir.x }, butt, ring, tip: pose.tip, tw: CONFIG.TAPE_W * k, sw: CONFIG.SHAFT_W * k };
}
/** 棒身：从黑环到棒尖慢慢收尖的多边形 */
function shaftD(g, grow = 0) {
  const a = V.add(g.ring, V.mul(g.n, g.sw / 2 + grow)), b = V.sub(g.ring, V.mul(g.n, g.sw / 2 + grow));
  const r = 4.5 + grow;                                 // 棒尖 ≈9px 宽的圆头
  const near = V.sub(g.tip, V.mul(g.dir, 4));
  const c = V.add(near, V.mul(g.n, r)), d = V.sub(near, V.mul(g.n, r));
  return `M${f1(a.x)},${f1(a.y)} L${f1(c.x)},${f1(c.y)} A${f1(r)},${f1(r)} 0 0 0 ${f1(d.x)},${f1(d.y)} L${f1(b.x)},${f1(b.y)} Z`;
}
function line(a, b, color, w, extra = "") {
  return `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${color}" stroke-width="${f1(w)}" ${extra.includes("linecap") ? "" : 'stroke-linecap="round"'} ${extra}/>`;
}
function renderStick(pose, hand) {
  const g = stickGeom(pose);
  let s = `<path d="${shaftD(g)}" fill="${COL.shaft}" stroke="${COL.outline}" stroke-width="${OUT}" stroke-linejoin="round"/>`;
  // 胶带握把：浅紫胶囊 + 一圈圈横向缠绕线（圈距 8px）
  const tapeEnd = V.sub(g.ring, V.mul(g.dir, g.tw / 2));   // 圆头收在黑环下面，不从环上冒出来
  s += line(g.butt, tapeEnd, COL.outline, g.tw + 2 * OUT);
  s += line(g.butt, tapeEnd, COL.tape, g.tw);
  for (let d = 8; d < CONFIG.TAPE_LEN - 4; d += 8) {
    const p = V.add(g.butt, V.mul(g.dir, d)), h = g.tw / 2 - 0.5;
    const p1 = V.add(p, V.mul(g.n, h)), p2 = V.sub(p, V.mul(g.n, h));
    const c = V.add(p, V.mul(g.dir, 2.2));       // 轻微弧形，像一圈凸棱
    s += `<path d="M${f1(p1.x)},${f1(p1.y)} Q${f1(c.x)},${f1(c.y)} ${f1(p2.x)},${f1(p2.y)}" fill="none" stroke="${COL.tapeLine}" stroke-width="1.5"/>`;
  }
  // 黑环（6px）
  const r0 = V.sub(g.ring, V.mul(g.dir, CONFIG.RING_W / 2)), r1 = V.add(g.ring, V.mul(g.dir, CONFIG.RING_W / 2));
  s += line(r0, r1, COL.outline, g.tw + 1, 'stroke-linecap="butt"');
  // 左右手标记：手上面一点点的胶带上一圈粉/薄荷色（手被画框裁掉、看不到袖口时靠它分左右）
  if (hand) {
    const m = V.add(g.butt, V.mul(g.dir, CONFIG.STUB + 50));
    s += line(V.sub(m, V.mul(g.dir, 3)), V.add(m, V.mul(g.dir, 3)), COL[hand], g.tw + 1, 'stroke-linecap="butt"');
  }
  return s;
}
function stickSilhouette(pose, fill) {
  const g = stickGeom(pose);
  return `<path d="${shaftD(g, 1)}" fill="${fill}"/>` + line(g.butt, g.ring, fill, g.tw + 2);
}

/* ---------- 手（v2.1：正常比例、线稿风） ----------
 * 局部坐标：原点 = 握点（滚奏 = 捏点），-y 指向棒尖（往上），x 往右。
 * 画的是右手，-x 是靠鼓中心的内侧；左手用 scale(-1,1) 镜像。
 * 手指 = 一串关节点（pts）+ 每节粗细（w）。描边每节粗细不同（指根粗、指尖细），
 * 关节处画 1.5px 短线，指尖一点浅粉。正常渲染和残影剪影共用同一份几何。
 */
const HAND_SHAPES = {
  // 第一人称手背视角。原点 = 捏点，-y 朝棒尖；画右手，-x 是内侧（靠鼓中心）。
  // 画框底边大约裁在指关节下面一点，所以只看得到拇指、食指和一排指关节。
  single: {   // 拳头背面：棒子从拇指和食指之间伸出来；拇指单独一块斜贴在棒内侧，盖住食指中节
    palm: "M2,-6 C18,-6 36,2 48,14 C56,28 56,50 52,72 L-2,72 C-4,50 -4,24 -2,6 C-2,0 -1,-4 2,-6 Z",
    palmAccent: "M48,14 C56,28 56,50 52,72",
    cuff: { x: -6, y: 84, w: 60, h: 16 },
    fingers: [  // 卷起来的四指只露第一节（拳头前沿一排），小指先画
      { pts: [[34, 8], [45, 15]], w: [10] },
      { pts: [[22, 1], [34, 6]], w: [11] },
      { pts: [[10, -4], [22, -1]], w: [11.5] },
      { pts: [[2, -6], [-8, -2]], w: [12] },      // 食指：中节往内侧弯到棒子下面，被拇指盖住
    ],
    thumb: { pts: [[-17, 40], [-11, 14], [-4, -10]], w: [14, 13], sep: true },   // 单独一块，指尖朝鼓
    knuckles: [[6, 4], [18, 8], [30, 13], [41, 20]],
  },
  roll: {     // 楔形手背：指关节处最宽，往手腕收窄。棒子从食指下面穿过；后三指卷进掌心，从上面只看到关节
    palm: "M4,-4 C18,-2 34,8 48,20 C50,40 47,64 42,96 L4,96 C0,74 -4,54 -7,34 C-9,18 -4,2 4,-4 Z",
    palmAccent: "M48,20 C50,40 47,64 42,96",
    cuff: { x: -6, y: 90, w: 52, h: 14 },
    fingers: [
      { pts: [[10, 2], [4, -12], [-7, -14]], w: [12, 11] },   // 食指：往前伸、第二节弯过棒子，指腹压住棒外侧
    ],
    thumb: { pts: [[-22, 30], [-17, 12], [-9, 1]], w: [13.5, 12.5], sep: true },  // 短、中间弯，指尖压住棒内侧
    knuckles: [[10, 4], [22, 12], [33, 19], [43, 27]],   // 一个比一个低，斜着往下错开
  },
};

/** 手指的一层：color + 每节加宽 extra(k)。用来做「整只手一起描边」的两遍画法 */
function fingerPass(f, color, extra) {
  const P = f.pts;
  let s = "";
  for (let k = 0; k + 1 < P.length; k++)
    s += `<line x1="${P[k][0]}" y1="${P[k][1]}" x2="${P[k + 1][0]}" y2="${P[k + 1][1]}" stroke="${color}" stroke-width="${f1(f.w[k] + extra(k))}" stroke-linecap="round"/>`;
  return s;
}
/** 手指的细节：关节短线（只点到）+ 指尖一点浅粉 */
function fingerDetail(f, k0 = 1) {
  const P = f.pts, n = P.length - 1, sc = CONFIG.HAND_SCALE;
  let s = "";
  for (let k = k0; k < n; k++) {
    const [x, y] = P[k], [px, py] = P[k - 1], dx = x - px, dy = y - py, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, h = f.w[k] * 0.16;
    s += `<line x1="${f1(x + nx * h)}" y1="${f1(y + ny * h)}" x2="${f1(x - nx * h * 0.6)}" y2="${f1(y - ny * h * 0.6)}" stroke="${COL.outline}" stroke-width="${f1(1.4 / sc)}" stroke-linecap="round" opacity=".35"/>`;
  }
  const [tx, ty] = P[n];
  s += `<circle cx="${tx}" cy="${ty}" r="${f1(f.w[n - 1] * 0.3)}" fill="${COL.tint}" opacity=".4"/>`;
  return s;
}

/**
 * 画手。ghost = null：正常（描边、肤色平涂、关节/掌纹细线、指尖浅粉）
 *       ghost = 颜色：残影剪影（只填色、不描边）
 */
/** 画师手图：把图里的锚点放到捏点上，图里的棒子方向转到当前鼓棒方向。ghost = 透明度（残影用） */
function handImg(handSide, pose) {
  const I = CONFIG.HAND_IMG[handSide][pose.gripType];
  const rot = pose.handDeg - I.axisDeg;          // 手的朝向（不含滚奏晃动：手几乎不动，只有棒子抖）
  // 图里的捏点直接对到鼓棒的旋转轴（pose.grip）上；手的朝向用 handDeg（不含滚奏晃动）
  const T = `translate(${f1(pose.grip.x)},${f1(pose.grip.y)}) rotate(${f1(rot)}) scale(${I.scale}) translate(${-I.pinch[0]},${-I.pinch[1]})`;
  let s = `<g transform="${T}">`;
  s += `<image href="${I.href}" x="0" y="0" width="${I.w}" height="${I.h}" preserveAspectRatio="none"/>`;
  // 不画腕带（主人：不要腕带）；左右靠胶带上的粉/薄荷色细环区分
  return s + `</g>`;
}

function handSVG(handSide, pose, ghost = null) {
  const S = HAND_SHAPES[pose.gripType];
  const rot = pose.handDeg + 90;               // 局部 -y 对准棒尖
  const mirror = handSide === "L" ? -1 : 1;
  const k = CONFIG.HAND_SCALE;
  const T = `translate(${f1(pose.grip.x)},${f1(pose.grip.y)}) rotate(${f1(rot)}) scale(${mirror * k},${k})`;
  const c = S.cuff;
  let s = `<g transform="${T}">`;
  if (ghost) {
    s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="3" fill="${ghost}"/>`;
    s += `<path d="${S.palm}" fill="${ghost}"/>`;
    for (const f of [...S.fingers, S.thumb]) s += fingerPass(f, ghost, () => 0);
    return s + `</g>`;
  }
  // 整只手 = 一个剪影：先把手掌+所有手指+拇指一起画成深色（外扩出描边宽度），
  // 再把同样的形状用肤色盖上去 —— 内部的接缝全部消失，只剩一圈连续的外轮廓。
  const all = [...S.fingers, ...(S.thumb.sep ? [] : [S.thumb])];
  const ow = (f) => (kk) => 2 * (3.2 - 1.0 * kk / Math.max(1, f.pts.length - 2)) / k;   // 指根粗、指尖细
  s += `<path d="${S.palm}" fill="${COL.outline}" stroke="${COL.outline}" stroke-width="${f1(2 * 2.8 / k)}" stroke-linejoin="round"/>`;
  for (const f of all) s += fingerPass(f, COL.outline, ow(f));
  s += `<path d="${S.palm}" fill="${COL.skin}"/>`;
  for (const f of all) s += fingerPass(f, COL.skin, () => 0);
  // 外侧转折处轮廓加重
  s += `<path d="${S.palmAccent}" fill="none" stroke="${COL.outline}" stroke-width="${f1(4 / k)}" stroke-linecap="round"/>`;
  // 内部只用短线：指缝、掌纹、拇指根
  // 指缝：相邻两指之间，只在指尖那一段画一条短线（手是一整块）
  for (let i = 0; i + 1 < S.fingers.length; i++) {
    const A = S.fingers[i].pts, B = S.fingers[i + 1].pts;
    const ta = A[A.length - 1], tb = B[B.length - 1], ma = A[A.length - 2], mb = B[B.length - 2];
    const p = [(ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2], q = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2];
    const e = [p[0] + (q[0] - p[0]) * 0.6, p[1] + (q[1] - p[1]) * 0.6];
    s += `<line x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(e[0])}" y2="${f1(e[1])}" stroke="${COL.outline}" stroke-width="${f1(1.6 / k)}" stroke-linecap="round"/>`;
  }
  // 手背上只画指根一排 4 个关节小弧线（1.5px），不画掌纹/皱纹
  for (const [x, y] of S.knuckles)
    s += `<path d="M${x - 4},${y + 1} q4,-3.5 8,0" fill="none" stroke="${COL.outline}" stroke-width="${f1(1.5 / k)}" stroke-linecap="round" opacity=".6"/>`;
  if (S.thumb.sep) {   // 拇指单独一块：自己描一圈边，压在手和棒上面，和拳头之间自然有一条分界线
    s += fingerPass(S.thumb, COL.outline, (kk) => 2 * (2.8 - 0.8 * kk) / k);
    s += fingerPass(S.thumb, COL.skin, () => 0);
  }
  for (const f of [...S.fingers, S.thumb]) s += fingerDetail(f, 99);   // 只要指尖浅粉，不画关节线
  // 袖口压在手腕上：普通直边，左右手颜色
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="3" fill="${COL[handSide]}" stroke="${COL.outline}" stroke-width="${f1(OUT / k)}" stroke-linejoin="round"/>`;
  return s + `</g>`;
}

/* ---------- 残影：3 层剪影 + 方向弧线 + 箭头尖 ---------- */
function renderTrail(hand, track, now) {
  const col = COL[hand];
  const p0 = poseAt(hand, track, now);
  if (p0.buzz) return "";   // 滚奏抖动时由 renderRollFx 画残影，这里不重复
  const p3 = poseAt(hand, track, now - 3 * CONFIG.TRAIL_STEP);
  if (V.len(V.sub(p0.tip, p3.tip)) < 3) return "";          // 几乎没动就不画
  let s = "";
  for (let k = 3; k >= 1; k--) {                              // 越早越淡，外层混白
    const p = poseAt(hand, track, now - k * CONFIG.TRAIL_STEP);
    const fill = mixWhite(col, 0.15 * (k - 1));
    s += `<g opacity="${CONFIG.TRAIL_ALPHA[k - 1]}">${stickSilhouette(p, fill)}${state.hands === "none" ? "" : state.hands === "img" ? "" : handSVG(hand, p, fill)}</g>`;
  }
  // 方向弧线：取棒尖（不含晃动）在 0.1s 前、0.05s 前、现在三个点，画一条过这三点的二次曲线，
  // 不跟着回弹的小抖动走；末端一个三角箭头（同色 α0.6）
  const span = CONFIG.TRAIL_ARC_SPAN;
  const A = poseAt(hand, track, now - span, { noWobble: true }).tip;
  const M = poseAt(hand, track, now - span / 2, { noWobble: true }).tip;
  const B = poseAt(hand, track, now, { noWobble: true }).tip;
  if (V.len(V.sub(B, A)) + V.len(V.sub(M, A)) < 14) return s;     // 动得太少（比如滚奏小回弹）就不画弧
  const Q = V.sub(V.mul(M, 2), V.mul(V.add(A, B), 0.5));            // 让曲线经过 M 的控制点
  const d = `M${f1(A.x)},${f1(A.y)} Q${f1(Q.x)},${f1(Q.y)} ${f1(B.x)},${f1(B.y)}`;
  s += `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".5"/>`;
  s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round" opacity=".75"/>`;
  let tan = V.sub(B, Q); if (V.len(tan) < 0.5) tan = V.sub(B, A);   // 末端切线方向
  const dir = V.norm(tan), n = { x: -dir.y, y: dir.x };
  const head = V.add(B, V.mul(dir, 10)), b1 = V.add(B, V.mul(n, 6)), b2 = V.sub(B, V.mul(n, 6));
  s += `<path d="M${f1(head.x)},${f1(head.y)} L${f1(b1.x)},${f1(b1.y)} L${f1(b2.x)},${f1(b2.y)} Z" fill="${col}" opacity=".6"/>`;
  return s;
}

/* ---------- 打击效果 ---------- */
function renderFaceGlow(events, second, now) {
  const g = faceGlow(events, second, now), F = GEOM.face;
  let s = `<g clip-path="url(#faceClip)">`;
  if (g.L > 0) s += `<rect x="${F.cx - F.rx - 5}" y="${F.cy - F.ry - 5}" width="${F.rx + 5}" height="${2 * F.ry + 10}" fill="${COL.don}" opacity="${f1(g.L)}"/>`;
  if (g.R > 0) s += `<rect x="${F.cx}" y="${F.cy - F.ry - 5}" width="${F.rx + 5}" height="${2 * F.ry + 10}" fill="${COL.don}" opacity="${f1(g.R)}"/>`;
  s += `</g>`;
  // 鼓面描边压在上面
  s += `<ellipse cx="${F.cx - 70}" cy="${F.cy - 62}" rx="72" ry="21" fill="#fff" opacity=".55" transform="rotate(-10 ${F.cx - 70} ${F.cy - 62})"/>`;
  s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="none" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  return s;
}

function renderHitFx(events, second, now) {
  let s = "";
  const maxAge = Math.max(CONFIG.KA_DUR, CONFIG.GOLD_DUR, CONFIG.LABEL_DUR);
  for (const { e, age } of activeHits(events, now, maxAge)) {
    const H = GEOM.hands[e.hand], k2 = second.has(e.i) ? CONFIG.SECOND_HIT : 1;
    if (e.face === "ka" && age <= CONFIG.KA_DUR) {     // 咔：那一侧鼓边外圈青色柔光 100°
      const k = age / CONFIG.KA_DUR, half = CONFIG.KA_SPAN / 2;
      const d = ellipseArcD(H.kaAng - half, H.kaAng + half, 7);
      s += `<path d="${d}" fill="none" stroke="${COL.ka}" stroke-width="${f1(CONFIG.KA_W * k2)}" stroke-linecap="round"
            opacity="${f1(0.9 * (1 - k) * k2)}" filter="url(#softGlow)"/>`;
      s += `<path d="${d}" fill="none" stroke="${COL.ka}" stroke-width="${f1(CONFIG.KA_W * k2 * 0.45)}" stroke-linecap="round"
            opacity="${f1(0.9 * (1 - k) * k2)}"/>`;
    }
    if (e.inserted && age <= CONFIG.GOLD_DUR) {      // 插音：效果外面再一圈金色柔光
      const k = age / CONFIG.GOLD_DUR;
      const d = e.face === "ka"
        ? ellipseArcD(H.kaAng - 62, H.kaAng + 62, 20)
        : (e.hand === "R" ? ellipseArcD(-90, 90, 12) : ellipseArcD(90, 270, 12));
      s += `<path d="${d}" fill="none" stroke="${COL.gold}" stroke-width="${CONFIG.GOLD_W}" stroke-linecap="round"
            opacity="${f1(0.7 * (1 - k))}" filter="url(#softGlow)"/>`;
    }
  }
  return s;
}

/** 滚奏回弹弧：同手颜色、虚线、3px，从落点鼓起一个小拱 */
function renderReboundArcs(tracks, now) {
  let s = "";
  for (const r of activeReboundArcs(tracks, now)) {
    const p = r.a.target, H = GEOM.hands[r.hand];
    // 画在棒子外侧一点，免得被鼓棒挡住
    const ox = p.x + 26 * H.out;
    const a = { x: ox - 14, y: p.y - 2 }, b = { x: ox + 14, y: p.y - 2 };
    const c = { x: ox, y: p.y - 70 };
    const d = `M${f1(a.x)},${f1(a.y)} Q${f1(c.x)},${f1(c.y)} ${f1(b.x)},${f1(b.y)}`;
    s += `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="${f1(0.7 * r.fade)}"/>`;
    s += `<path d="${d}" fill="none" stroke="${COL[r.hand]}" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" opacity="${f1(r.fade)}"/>`;
    s += `<path d="${d}" fill="none" stroke="${COL.outline}" stroke-width="1" stroke-dasharray="6 5" stroke-linecap="round" opacity="${f1(0.25 * r.fade)}" transform="translate(0,2)"/>`;
  }
  return s;
}

/** R/L 小标签（打击时出现在落点旁边） */
function renderLabels(events, now) {
  let s = "";
  for (const { e, age } of activeHits(events, now, CONFIG.LABEL_DUR)) {
    const H = GEOM.hands[e.hand], p = H[e.face];
    const at = e.face === "ka" ? ellipsePt(H.kaAng, -42) : { x: p.x + 78 * H.out, y: p.y - 34 };
    s += `<g opacity="${f1(1 - age / CONFIG.LABEL_DUR)}"><circle cx="${f1(at.x)}" cy="${f1(at.y)}" r="12" fill="${COL[e.hand]}" stroke="${COL.outline}" stroke-width="2.5"/>
          <text x="${f1(at.x)}" y="${f1(at.y + 5)}" font-size="14" font-weight="800" text-anchor="middle" fill="${COL.outline}">${e.hand}</text></g>`;
  }
  return s;
}

/* ===================================================================
 * 4. 时钟与控制
 * =================================================================== */
const params = new URLSearchParams(location.search);
const state = {
  events: [], tracks: { R: [], L: [], second: new Set() },
  now: 0, start: 0, end: 1,
  playing: false,   // app.js starts playback when ?autoplay=1, after the chart is loaded
  autoplay: params.get("autoplay") === "1",
  loop: params.get("autoplay") === "1" ? false : params.get("loop") !== "0",
  hands: ["none", "vector"].includes(params.get("hands")) ? params.get("hands") : "img",   // img=画师手图（默认）；vector=代码画的手；none=不画手
  rate: pickNum(params.get("rate"), 1, 0.05, 4),
  scroll: pickNum(params.get("scroll"), 1, 0.5, 8),
  route: ["inner", "outer", "straight"].includes(params.get("route")) ? params.get("route") : "data",
  labels: params.get("labels") === "1",                 // R/L 调试标签：?labels=1 打开
  lastTs: null,
};
// 捏点高度随手的模式变（图片手露到手腕，矢量手裁到指关节）
for (const h of ["L", "R"]) GEOM.hands[h].pivot.y = CONFIG.PIVOT_Y[state.hands];
function pickNum(v, def, lo, hi) { const n = parseFloat(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; }

const $ = (id) => document.getElementById(id);
const els = { chart: $("chart"), dyn: $("dynamic"), stat: $("static") };

/** hands=none 时代替手：单击 = 整段握把一圈光；滚奏 = 捏点一个小光点 */
function gripMarker(hand, pose) {
  const g = stickGeom(pose), col = COL[hand];
  if (pose.gripType === "single")
    return `<g filter="url(#softGlow)" opacity=".7">${line(g.butt, g.ring, col, g.tw + 10)}</g>` + line(g.butt, g.ring, col, 2.5, 'opacity=".9"');
  return `<circle cx="${f1(pose.grip.x)}" cy="${f1(pose.grip.y)}" r="9" fill="${col}" opacity=".6" filter="url(#softGlow)"/>` +
         `<circle cx="${f1(pose.grip.x)}" cy="${f1(pose.grip.y)}" r="4.5" fill="#fff" stroke="${col}" stroke-width="2.5"/>`;
}

/**
 * 滚奏特效。layer="under"（画在棒子下面）：左右两根淡残影棒 / 合并后的扇形模糊 + 鼓边持续微光。
 *           layer="over"（画在手上面）：捏点旁 2~3 条短震动线 + 每次落点的小圆点闪光。
 * 慢放（rate<1）时每一下都单独画；只有 rate==1 且两下间隔 < 100ms 才合并成模糊。
 */
function renderRollFx(hand, pose, track, now, layer) {
  const col = COL[hand];
  let s = "";
  if (layer === "over") {   // 落点小圆点闪光（第二下 80%）
    for (const c of track) {
      if (c.grip !== "roll") continue;
      const age = now - c.t;
      if (age < 0 || age > 0.15) continue;
      const k2 = c.idxInStroke === 1 ? CONFIG.SECOND_HIT : 1;   // 滚奏第二下 80%
      const u = age / 0.15;
      s += `<circle cx="${f1(c.target.x)}" cy="${f1(c.target.y)}" r="${f1((5 + 9 * u) * k2)}" fill="#fff" opacity="${f1((1 - u) * 0.9 * k2)}"/>`;
      s += `<circle cx="${f1(c.target.x)}" cy="${f1(c.target.y)}" r="${f1((5 + 9 * u) * k2)}" fill="none" stroke="${col}" stroke-width="2.5" opacity="${f1(1 - u)}"/>`;
    }
  }
  if (!pose.buzz || pose.gripType !== "roll") return s;
  const g = stickGeom(pose), P = pose.grip;
  if (layer === "under") {
    const merged = state.rate === 1 && pose.buzz.pairDt < CONFIG.BLUR_DT;
    if (merged) {   // 扇形模糊：从捏点张开 ±4° 的楔形，手的颜色
      const L = V.len(V.sub(pose.tip, P)), a0 = pose.stickDeg - CONFIG.WOBBLE_DEG, a1 = pose.stickDeg + CONFIG.WOBBLE_DEG;
      const pt = (deg, r) => V.add(P, { x: Math.cos(deg * Math.PI / 180) * r, y: Math.sin(deg * Math.PI / 180) * r });
      const A = pt(a0, L * 0.35), B = pt(a0, L), C = pt(a1, L), D = pt(a1, L * 0.35);
      s += `<path d="M${f1(A.x)},${f1(A.y)} L${f1(B.x)},${f1(B.y)} L${f1(C.x)},${f1(C.y)} L${f1(D.x)},${f1(D.y)} Z" fill="${col}" opacity=".35" filter="url(#softGlow)"/>`;
      const F = GEOM.face;   // 鼓边一圈细细的持续微光
      s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="none" stroke="${col}" stroke-width="7" opacity=".6" filter="url(#softGlow)"/>` +
           `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="none" stroke="${col}" stroke-width="2" opacity=".65"/>`;
    } else {        // 两根淡残影棒，左右张开（25% / 12%）
      for (const [d, a] of [[CONFIG.WOBBLE_DEG, 0.25], [-CONFIG.WOBBLE_DEG, 0.12]]) {
        const ghost = Object.assign({}, pose, { stickDeg: pose.stickDeg + d, tip: V.rot(pose.tip, P, d) });
        s += `<g opacity="${a}">${stickSilhouette(ghost, col)}</g>`;
      }
    }
    return s;
  }
  // 捏点旁的短震动线：棒子两侧各几条，位置在手的上沿外面一点
  const base = V.add(P, V.mul(g.dir, 34));
  const marks = [[-1, 0], [-1, 9], [1, 4]];
  for (const [side, off] of marks) {
    const c = V.add(V.add(base, V.mul(g.dir, off)), V.mul(g.n, side * (g.tw / 2 + 8)));
    const p1 = V.add(c, V.mul(g.n, side * 0)), p2 = V.add(c, V.mul(g.n, side * 9));
    s += line(V.add(p1, V.mul(g.dir, -2)), V.add(p2, V.mul(g.dir, 2)), COL.outline, 2.2, 'opacity=".75"');
  }
  return s;
}

function renderFrame(now) {
  const { events, tracks } = state;
  els.chart.innerHTML = renderChart(events, now, state.scroll);
  let s = renderFaceGlow(events, tracks.second, now);
  s += renderHitFx(events, tracks.second, now);
  s += `<g clip-path="url(#cardClip)">`;            // 手从画框底部进来，被卡片边缘裁掉
  s += renderTrail("L", tracks.L, now) + renderTrail("R", tracks.R, now);
  s += renderReboundArcs(tracks, now);
  for (const hand of ["L", "R"]) {
    const pose = poseAt(hand, tracks[hand], now);
    s += renderRollFx(hand, pose, tracks[hand], now, "under");
    s += `<g id="stick-${hand}">${renderStick(pose, state.hands === "img" && CONFIG.HAND_IMG[hand][pose.gripType].band ? null : hand)}</g>`;
    // 每只手是一个独立图层，压在鼓棒上面、锚在捏点。以后直接换成画师的手图（CONFIG.HAND_IMG）
    s += `<g id="hand-${hand}" data-grip="${pose.gripType}">` + (state.hands === "none" ? gripMarker(hand, pose) : state.hands === "img" ? handImg(hand, pose) : handSVG(hand, pose)) + `</g>`;
    s += renderRollFx(hand, pose, tracks[hand], now, "over");
  }
  s += `</g>`;
  const c = GEOM.card;   // 卡片边框压在手上面，看起来像被画框裁掉
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="30" fill="none" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  if (state.labels) s += renderLabels(events, now);   // R/L 调试标签，默认关
  els.dyn.innerHTML = s;
  const cur = [...events].reverse().find((e) => e.t <= now + 1e-9);
  $("clock").textContent = `t = ${now.toFixed(3)} s　慢放 ${state.rate}×　流速 ${state.scroll}×`;
  $("src").textContent = cur ? `上一个音：#${cur.i + 1} ${cur.src} ${cur.both ? "双手" : cur.hand} ${cur.face === "don" ? (cur.big ? "大咚" : "咚") : (cur.big ? "大咔" : "咔")} ${cur.grip === "roll" ? "滚奏(捏)" : "单击(握)"}${cur.inserted ? " ★插音" : ""}` : "";
  $("scrub").value = String((now - state.start) / (state.end - state.start));
}

function tick(ts) {
  if (state.lastTs !== null && state.playing) {
    const realDt = Math.min(0.1, (ts - state.lastTs) / 1000);
    state.now += realDt * state.rate;                       // 唯一的时钟累加（实时播放）
    if (state.now > state.end) {
      if (state.loop) state.now = state.start + (state.now - state.end);
      else { state.now = state.end; setPlaying(false); signalBachiDone({ ok: true }); }
    }
  }
  state.lastTs = ts;
  renderFrame(state.now);
  requestAnimationFrame(tick);
}

/**
 * Deterministic frame render: the picture is a pure function of chart time t
 * (same units as event.t, seconds). Does not read the wall clock or rAF.
 * Pauses realtime playback so a later rAF tick cannot advance mid-export.
 * Same t + same settings (scroll / rate / route) → the same frame.
 */
function renderAt(t) {
  const n = +t;
  const time = isFinite(n) ? Math.max(state.start, Math.min(state.end, n)) : state.start;
  state.now = time;
  if (state.playing) setPlaying(false);
  renderFrame(time);
  return time;
}

/** Fire once when autoplay reaches the end (or when the app reports an unrecoverable load error). */
function signalBachiDone(detail) {
  if (window.__BACHI_DONE__) return;
  window.__BACHI_DONE__ = true;
  const payload = Object.assign({
    ok: true,
    t: state.now,
    start: state.start,
    end: state.end,
    duration: state.end,
  }, detail || {});
  document.dispatchEvent(new CustomEvent("bachimotion:done", { detail: payload }));
}

function signalBachiReady() {
  window.__BACHI_READY__ = true;
  document.dispatchEvent(new CustomEvent("bachimotion:ready", {
    detail: { start: state.start, end: state.end, duration: state.end, events: state.events.length },
  }));
}

window.__BACHI_DONE__ = false;
window.__BACHI_READY__ = false;
window.renderAt = renderAt;
Object.defineProperty(window, "chartDuration", { get() { return state.end; }, configurable: true });
Object.defineProperty(window, "chartStart", { get() { return state.start; }, configurable: true });

function setPlaying(p) { state.playing = p; $("btnPlay").textContent = p ? "⏸ 暂停" : "▶ 播放"; }
function setRate(r) {
  state.rate = r;
  document.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", +b.dataset.rate === r));
}
function seek(t) { state.now = Math.max(state.start, Math.min(state.end, t)); renderFrame(state.now); }
/** 换数据（调试/验收用）：传原始 JSON 对象 */
function setData(data) {
  state.events = normalizeEvents(data);
  state.tracks = buildHandTracks(state.events, state.route);
  const first = state.events.length ? state.events[0].t : 0;
  const last = state.events.length ? state.events[state.events.length - 1].t : 0;
  // Optional rangeStart / rangeEnd (seconds, same units as event.t) let the CLI
  // crop to a measure range, including leading/trailing rests in those bars.
  const rangeStart = data && isFinite(+data.rangeStart) ? +data.rangeStart : first;
  const rangeEnd = data && isFinite(+data.rangeEnd) ? +data.rangeEnd : last;
  state.start = rangeStart - CONFIG.LEAD_IN;
  state.end = rangeEnd + CONFIG.TAIL_TIME;
}

function bindControls() {
  $("btnPlay").onclick = () => setPlaying(!state.playing);
  $("btnRestart").onclick = () => { seek(state.start); setPlaying(true); };
  $("btnLoop").onclick = () => { state.loop = !state.loop; $("btnLoop").classList.toggle("on", state.loop); };
  document.querySelectorAll("[data-rate]").forEach((b) => b.onclick = () => setRate(+b.dataset.rate));
  $("scroll").oninput = (e) => { state.scroll = +e.target.value; $("scrollVal").textContent = state.scroll + "×"; };
  $("route").onchange = (e) => { state.route = e.target.value; state.tracks = buildHandTracks(state.events, state.route); };
  $("scrub").oninput = (e) => seek(state.start + (+e.target.value) * (state.end - state.start));
  setRate(state.rate); setPlaying(state.playing);
  $("btnLoop").classList.toggle("on", state.loop);
  $("scroll").value = state.scroll; $("scrollVal").textContent = state.scroll + "×";
  $("route").value = state.route;
  $("labels").checked = state.labels;
  $("labels").onchange = (e) => { state.labels = e.target.checked; };
}

let engineStarted = false;
function startEngine(data, meta) {
  window.__BACHI_DONE__ = false;
  window.__BACHI_READY__ = false;
  setData(data || { events: [] });
  state.now = params.has("t") ? pickNum(params.get("t"), state.start, state.start, state.end) : state.start;
  if (els.stat && !els.stat.innerHTML) els.stat.innerHTML = renderStatic();
  if (!engineStarted) {
    bindControls();
    requestAnimationFrame(tick);
    engineStarted = true;
  } else {
    renderFrame(state.now);
  }
  const info = meta || data || {};
  window.taikoAnim = {
    state, seek, setPlaying, setRate, setData, startEngine,
    renderAt, signalBachiDone, poseAt, buildHandTracks,
    raw: data, meta: info,
  };
  window.renderAt = renderAt;
  signalBachiReady();
  return state;
}
