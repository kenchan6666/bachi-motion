"use strict";

/* ===================================================================
 * 1. CONFIG / GEOM —— 尺寸、颜色、时长（颜色全部来自汐月 v2 规格）
 * =================================================================== */
const COL = {
  outline: "#2B2320",                  // 统一描边 3px
  skin: "#FFE3CC", tint: "#FFC9B8",      // 指尖/指节一点点浅粉（α0.4）
  shaft: "#F3E6C8", tape: "#B9A6E8", tapeLine: "#8F7BC8",   // 鼓棒 v2.3：米白棒身、浅紫缠胶带、黑环
  don: "#E8503A", ka: "#4FE0E6", gold: "#F5C542",
  R: "#5FC99A",                        // 右手（正手）袖口 + 握把粉/绿标记
  L: "#F49AC1",                        // 左手（逆手）袖口 + 握把粉/绿标记（v2.3 起，避开浅紫胶带）
  face: "#F6EEDC", studBand: "#E9C48A", body: "#C8342A", bodyDark: "#9E2620", stud: "#2B2320",
  noteDon: "#E8503A", noteKa: "#3FB6E8",   // 谱面音符颜色（和谱面图一致）
};
const OUT = 3;   // 描边宽度

const CONFIG = {
  RISE: 0.10,           // 兼容旧调用：等于 STRIKE_DOWN_MAX（稀疏下砸）
  FULL_LIFT: 1,
  ROLL_REBOUND: 1 / 3,  // 保留兼容字段
  ROLL_PAIR_GAP: 0.12,  // 同手相邻两个滚奏音 ≤ 这个间隔 = 一对 (RR)/(LL)
  ROLL_ROCK_DEG: 0,     // 滚奏全程焊死：棒不再绕捏点单独转 12°（保留键名供模糊计算兼容）
  ROLL_BOB_SCALE: 1,    // 滚奏改为整只手带棒大抬回（不再缩成 1/3 点头）
  ROLL_RISE: 0.05,      // 滚奏对间下砸参考时长（BPM300 16分=50ms）
  ROLL_DOWN_MAX: 0.075, // 滚奏对间从最高点加速下砸的最大用时
  ROLL_BOUNCE_RATIO: 0.32, // 一对内部「小弹」高度占滚奏大抬回的比例
  ROLL_BOUNCE_PEAK_U: 0.42,// 小弹顶点在一对间隔里的归一化时刻（碰完立刻弹起再加速压下）
  ROLL_SECOND_PRESS_PX: 12,// 第二下手再往下补压的像素（保持焊死、不穿鼓）
  ROLL_LIFT_OUT_PX: 8,  // 滚奏大抬回时略微外带
  ROLL_WRIST_TILT_SCALE: 0.7, // 滚奏大抬回时整手+棒微后倒比例（焊死）
  ROLL_END_GRIP_KEEP: 0.04,   // 滚奏最后一下结束后多久切回单击握拳手图
  BEND_PX: 50,          // 内刷/外刷弧线弯曲幅度
  WOBBLE_DEG: 4,        // 保留：32 分扇形模糊的张角参考
  WOBBLE_DEG_SHORT: 4,
  WOBBLE_DUR: 0.08,
  HAND_SCALE: 1.76,     // 手的几何缩放（裁到指关节后，整卡尺寸下也要看得清）
  TAPE_W: 30,           // 胶带握把宽（结实粗壮）；滚奏 ×0.92
  SHAFT_W: 26,          // 棒身在黑环处 26px，收到棒尖 ≈9px 圆头
  TAPE_LEN: 221,        // 胶带长度（略长于 1/3，手上面多露一截紫色）
  STUB: 76,             // 捏点以下的棒尾长度（约胶带 1/4~1/3）：穿过虎口继续藏到手背下面，圆头不会露在虎口里
  RING_W: 10,
  NOD_PX: 1.5,          // 旧滚奏点头（像素）；新滚奏手腕用 LIFT_PX * ROLL_BOB_SCALE
  SINGLE_FOLLOW: 1,     // 单击完全固定：手+棒同一变换，跟手比例永远是 1（密度只缩抬起高度，不缩跟手）
  SINGLE_FOLLOW_DENSE: 1, // 已停用：密击不再降低 follow（保留键以免旧调用读到 undefined）
  LIFT_PX: 200,         // 咚全幅度抬起高度：最高点要明显高于预备，才能看出「打下去」
  KA_LIFT_PX: 72,       // 咔举起：在已经抬到鼓下缘的接触位上再往上送一截
  ROLL_LIFT_PX: 150,    // 滚奏大抬回：任意一帧都能看出一只手低（在打）、一只手高（抬起）
  LIFT_OUT_PX: 12,      // 咚举起时棒尖略向外；咔的外移靠宽站位，不靠这个小数
  KA_STICK_OUT_DEG: 10, // 咔棒近竖直，只外倾一点（不再靠长棒斜着从画面下方够鼓边）
  KA_GRIP_Y: 536,       // 咔接触时握点高度：至少抬到鼓下缘（bodyBottom=548）附近
  KA_TIP_OUT_PX: 14,    // 咔接触点相对 H.ka 沿棒伸出的距离：校准后接触点落在 1/11 点钟鼓边黑线上
  KA_TIP_PAST_RATIO: 0.20, // 棒尖再沿棒伸出接触点，长度为可见棒身（黑环→接触点）的约 1/5；冲击光仍用接触点
  WRIST_TILT_DEG: 5,    // 举起时整只手+棒绕手腕后倒 4–6°（焊死，棒相对手仍是 0°）
  WRIST_PX: 100,        // 握点沿棒往下到手腕的距离
  WINDUP: 0.066,        // 兼容旧调用：等于 STRIKE_UPFLICK（快速上挑，不是慢抬蓄力）
  // 打击节奏「打下去」（秒）。越砸越快，碰到那一帧不停顿、立刻反向回弹（高光留在接触点）。
  STRIKE_UPFLICK: 0.066,
  STRIKE_DOWN_MIN: 0.066,
  STRIKE_DOWN_MAX: 0.100,
  STRIKE_HIT: 0.0,      // 接触瞬间零停顿，下一帧立刻反向弹起（发光/波纹由 FX 计时负责）
  STRIKE_HIT_DENSE: 0.0,
  STRIKE_REBOUND: 0.133,
  STRIKE_REBOUND_DENSE: 0.066,
  HIT_KICK_DUR: 0.042,  // 击中后力道传回：手带棒整体微回顿的窗口（t>hitTime，不破坏接触帧贴面）
  HIT_KICK_BACK_PX: 4,  // 回顿沿棒退回像素
  HIT_KICK_LIFT_PX: 8,  // 回顿顺势弹出像素
  DRUM_SHAKE_DUR: 0.028,// 鼓轻震只在击中那一帧出现，不延到回弹帧
  DRUM_SHAKE_SCALE: 0.020, // 接触帧鼓轻震约 2%（scale = 0.980）
  DRUM_SHAKE_DY: 2.2,   // 接触帧鼓皮下沉像素
  IMPACT_DUR: 0.028,    // 击中光+波纹只在击中那一帧亮起（绝不延到回弹帧）
  IMPACT_ROLL_DUR: 0.020,
  KA_LIFT_OUT_PX: 44,   // 咔举起时整只手往斜上外侧送
  IDLE_HOVER_PX: 112,   // 闲手/预备棒尖明显高出鼓外轮廓（鼓顶 y=182，尖约 y=146，不贴鼓边像也在打）
  IDLE_V_DEG: 16,       // 倒V：近平行微收（两棒不交叉）
  IDLE_KA_SHIFT_RX: 0.15, // 对方打咔时，闲置棒尖往自己一侧偏 0.15 个面半径，避免两棒交叉
  IDLE_SETTLE: 0.22,    // 同手间隔够宽时，中间回到鼓心倒V；实际是否回预备由 strikeFit 按相位时值判断
  SCENE_SCALE: 0.95,    // 鼓+手整组缩小，咔高举时棒尖不容易顶到卡片上沿
  SCENE_CLIP_PAD_TOP: 170, // 卡片上沿额外留白：单击最高点抬高后棒尖不裁切
  KA_GLOW_GROW: 12,     // 青光沿鼓边外侧（中心对齐棒尖接触点，不落在鼓面里）
  // 同手相邻击的间隔 → 抬起高度（8 分及更疏 = 满幅，16 分起收小，32/48 分贴住）
  LIFT_DT_FULL: 0.18,   // ≥ 约 8 分（@160 ≈ 0.1875s）→ 满幅
  LIFT_DT_16: 0.094,    // 16 分 @160
  LIFT_DT_MIN: 0.031,   // 48 分 @160（32 分更密时也收在下限）
  LIFT_SCALE_16: 1 / 3, // 16 分幅度约单击的 1/3（规格）
  LIFT_SCALE_MIN: 0.18,
  BLUR_DT: 0.04,        // 32 分及更密（两下间隔 < 40ms）且 rate==1 → 汐月扇形残影；16 分不合并
  ROLL_TRAIL_COUNT: 4,  // 滚奏残影缩短，只留棒尖附近一小截
  ROLL_TRAIL_ALPHA: [0.48, 0.34, 0.22, 0.12],
  ROLL_TRAIL_ARC_SPAN: 0.18, // 内刷/外刷残影弧的回溯时长；符号由 kd 内收 / dk 外甩决定
  TRAIL_TIP_LEN: 52,    // 拖影只画棒尖往回这一段（不画握把/手臂）
  TRAIL_COLOR: "#FFFFFF",
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
  DON_RISE: 0.025, DON_FALL: 0.2,           // 咚：接触帧即亮起(0.75→1.0)，0.2s 退回
  KA_DUR: 0.032, KA_W: 14, KA_SPAN: 60,     // 咔：鼓边青光只留在击中帧附近（紧贴 1/11 点钟外侧）
  GOLD_DUR: 0.35, GOLD_W: 16, GOLD_KA_SPAN: 68,  // 插音金光；咔插音弧略宽于青光，仍留在落点一侧
  SECOND_HIT: 0.8,                          // 滚奏第二下亮度/光宽 80%
  REBOUND_ARC_FADE: 0.15,
  TRAIL_STEP: 1 / 60,   // 单击残影每 1 帧（60fps）留 1 层
  TRAIL_ALPHA: [0.48, 0.30, 0.16],  // 白色短拖影；浅灰底上纯 35% 几乎看不见，略提到约 50% 并加柔光
  TRAIL_ARC_SPAN: 0.1,  // 单击方向弧线回溯 0.1s
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
    // 咔落在同侧偏上、靠近咚的近端鼓边（斜上方），不是远端侧面
    // rest：滚奏回弹用的棒尖参考（保持上一轮高度，避免滚奏被单击加大幅度带走）
    // 单击举起高度走 LIFT_PX（从当前落点向上），不再靠这个 rest
    // 第一人称：手从画面底部进来；单击时手+棒是刚体，pivot 只是握点的参考原点
    // kaAng：咔在近端鼓边的位置（0=右，-90=上）。右手约 1 点钟 -55°，左手镜像 11 点钟 235°。
    // 闲置/预备：棒尖在鼓心咚位上方悬停，两棒倒V；idle 坐标已不用（姿势由 singleIdlePose 算）。
    // don 是落点；donLen 只用来定棒长（跟手焊死用），避免把落点上提时把棒拉长。
    L: { pivot: { x: 255, y: 806 }, don: { x: 350, y: 258 }, donLen: { x: 350, y: 272 }, kaAng: 226, out: -1, rest: { x: 342, y: 226 }, idle: { x: 360, y: 410 } },
    R: { pivot: { x: 545, y: 806 }, don: { x: 450, y: 258 }, donLen: { x: 450, y: 272 }, kaAng: -46, out: 1, rest: { x: 458, y: 226 }, idle: { x: 440, y: 410 } },
  },
};
// 咔接触点：鼓边黑线上（grow=0）。棒头再沿棒伸出 KA_TIP_OUT_PX。
for (const h of ["L", "R"]) GEOM.hands[h].ka = ellipsePt(GEOM.hands[h].kaAng, 0);

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

/** 滚奏一对的四类：读两颗音的 face 自判，不加新 JSON 标记。 */
function rollPairType(face0, face1) {
  const a = face0 === "ka" ? "k" : "d";
  const b = face1 === "ka" ? "k" : "d";
  return a + b; // dd 滚红 / kk 滚蓝 / kd 内刷 / dk 外刷
}
function rollTypeRoute(type) {
  if (type === "kd") return "inner";
  if (type === "dk") return "outer";
  return "straight";
}
/** 滚奏落点：咚用鼓面中心 H.don，咔用鼓边黑线上的接触点（不是伸出鼓外的棒尖）。 */
function rollLanding(hand, face) {
  if (face === "ka") {
    const p = singleContactPose(hand, "ka");
    return p.contact || p.tip;
  }
  return GEOM.hands[hand].don;
}

/**
 * 每只手的落点序列。滚奏：同手相邻两个 roll 音（间隔 ≤ ROLL_PAIR_GAP）= 一次落下打两下。
 * 成对时按两音 face 自判 dd/kk/kd/dk，并写入 rollType / route（内收/外甩）。
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
      const mk = (ev, idx, rt, extra) => ({
        t: ev.t, ev, face: ev.face, grip: ev.grip, route: rt,
        target: ev.grip === "roll" ? rollLanding(hand, ev.face) : GEOM.hands[hand][ev.face],
        stroke: strokeId, idxInStroke: idx, ...(extra || {}),
      });
      if (e.grip === "roll" && next && next.grip === "roll" && next.t - e.t <= CONFIG.ROLL_PAIR_GAP) {
        const type = rollPairType(e.face, next.face);
        const pairRoute = routeOverride === "data" ? rollTypeRoute(type) : routeOverride;
        const c0 = mk(e, 0, pairRoute, { rollType: type });
        const c1 = mk(next, 1, pairRoute, { rollType: type });
        c0.pairDt = c1.pairDt = next.t - e.t;      // 滚奏两下的间隔（晃动用）
        tracks[hand].push(c0, c1);
        tracks.second.add(next.i);
        k++;
      } else {
        const loneType = e.grip === "roll" ? rollPairType(e.face, e.face) : undefined;
        tracks[hand].push(mk(e, 0, route, loneType ? { rollType: loneType } : {}));
      }
      strokeId++;
    }
    const arr = tracks[hand];
    for (let i = 0; i < arr.length; i++) {
      const dts = [];
      if (i > 0) dts.push(arr[i].t - arr[i - 1].t);
      if (i + 1 < arr.length) dts.push(arr[i + 1].t - arr[i].t);
      arr[i].gap = dts.length ? Math.min.apply(null, dts) : Infinity;
    }
  }
  return tracks;
}

/** 同手间隔 → 单击抬起比例：8 分及更疏 = 1，16 分 ≈ 1/3，32/48 分 → LIFT_SCALE_MIN。映射连续。 */
function densityScale(dt) {
  if (!isFinite(dt) || dt >= CONFIG.LIFT_DT_FULL) return 1;
  if (dt <= CONFIG.LIFT_DT_MIN) return CONFIG.LIFT_SCALE_MIN;
  if (dt >= CONFIG.LIFT_DT_16) {
    const u = (dt - CONFIG.LIFT_DT_16) / (CONFIG.LIFT_DT_FULL - CONFIG.LIFT_DT_16);
    return CONFIG.LIFT_SCALE_16 + (1 - CONFIG.LIFT_SCALE_16) * smooth(clamp01(u));
  }
  const u = (dt - CONFIG.LIFT_DT_MIN) / (CONFIG.LIFT_DT_16 - CONFIG.LIFT_DT_MIN);
  return CONFIG.LIFT_SCALE_MIN + (CONFIG.LIFT_SCALE_16 - CONFIG.LIFT_SCALE_MIN) * smooth(clamp01(u));
}

/** 单击跟手永远是 1.0（完全固定）。密度只通过 densityScale 缩抬起高度，不再改 follow。 */
function followFromScale(_scale) {
  return 1;
}

/** 单击举起方向。咚：从落点向上（外移很小）。咔：斜上外侧——整只手连棒明显往外送，再往下砸到鼓边。 */
function liftVec(hand, face) {
  if (face === "ka") {
    return { x: GEOM.hands[hand].out * CONFIG.KA_LIFT_OUT_PX, y: -CONFIG.KA_LIFT_PX };
  }
  return { x: GEOM.hands[hand].out * CONFIG.LIFT_OUT_PX, y: -CONFIG.LIFT_PX };
}

function sceneTransform(shake) {
  const F = GEOM.face, s = CONFIG.SCENE_SCALE;
  if (!shake || (Math.abs(shake.scale - 1) < 1e-5 && Math.abs(shake.dx) < 1e-3 && Math.abs(shake.dy) < 1e-3)) {
    return `translate(${F.cx},${F.cy}) scale(${s}) translate(${-F.cx},${-F.cy})`;
  }
  return `translate(${f1(F.cx + shake.dx)},${f1(F.cy + shake.dy)}) scale(${(s * shake.scale).toFixed(4)}) translate(${-F.cx},${-F.cy})`;
}

/** 屏幕坐标 → 场景缩放后的本地坐标（卡片裁剪要对齐未缩放的画框，上沿再放宽）。 */
function sceneInvPt(p) {
  const F = GEOM.face, s = CONFIG.SCENE_SCALE;
  return { x: (p.x - F.cx) / s + F.cx, y: (p.y - F.cy) / s + F.cy };
}

/** 椭圆参数角（度），与 ellipsePt 用的 t 一致，不是几何 atan2。 */
function ellipseParamDeg(p) {
  const F = GEOM.face;
  return Math.atan2((p.y - F.cy) / F.ry, (p.x - F.cx) / F.rx) * 180 / Math.PI;
}

/**
 * 棒画在未震动的 sceneDyn 里；击中光画在带鼓震的 sceneFaceFx 里。
 * 把与棒同一套 GEOM 坐标的点换到 sceneFaceFx 局部坐标，使屏幕位置对齐。
 */
function unshakenToShakenLocal(p, shake) {
  if (!shake) return p;
  const F = GEOM.face, sc0 = CONFIG.SCENE_SCALE;
  const sc1 = sc0 * (shake.scale != null ? shake.scale : 1);
  const dx = shake.dx || 0, dy = shake.dy || 0;
  if (Math.abs(sc1 - sc0) < 1e-8 && Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return p;
  return {
    x: F.cx + (sc0 * (p.x - F.cx) - dx) / sc1,
    y: F.cy + (sc0 * (p.y - F.cy) - dy) / sc1,
  };
}

/** 咔冲击特效中心：鼓边黑线上的接触点（不是伸出鼓外的棒尖，也不是鼓面内的 H.ka）。 */
function kaImpactPt(hand, shake) {
  const pose = singleContactPose(hand, "ka");
  return unshakenToShakenLocal(pose.contact || pose.tip, shake);
}

function sceneCardClipRect() {
  const c = GEOM.card, pad = CONFIG.SCENE_CLIP_PAD_TOP;
  const tl = sceneInvPt({ x: c.x + 1.5, y: c.y + 1.5 - pad });
  const br = sceneInvPt({ x: c.x + c.w - 1.5, y: c.y + c.h - 1.5 });
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y, rx: 29 / CONFIG.SCENE_SCALE };
}

function targetFace(hand, base) {
  const H = GEOM.hands[hand];
  if (!base) return "don";
  return V.len(V.sub(base, H.ka)) < V.len(V.sub(base, H.don)) ? "ka" : "don";
}

/** 单击落点姿势（未抬、未后倒）。咚：原来的焊死持棒。咔：棒几乎竖直、往外倒 KA_STICK_OUT_DEG，接触点在鼓边，棒头再伸出鼓外，手连棒一起外移。 */
function singleContactPose(hand, face) {
  const H = GEOM.hands[hand];
  const L = stickLen(hand);
  if (face !== "ka") {
    const tip = H.don;
    const back = V.sub(H.pivot, tip);
    const dirBack = V.len(back) > 1 ? V.norm(back) : { x: 0, y: 1 };
    const grip = V.add(tip, V.mul(dirBack, L));
    const d = V.sub(tip, grip);
    return { tip, grip, deg: Math.atan2(d.y, d.x) * 180 / Math.PI, contact: tip };
  }
  const C0 = H.ka; // H.ka 在椭圆上；再沿棒走 KA_TIP_OUT_PX，接触点落在已校准的 1/11 点钟鼓边黑线上
  // 手抬到鼓下缘高度，棒短而近竖直（只外倾一点）。
  // 不改全局 don 棒长：咔这一击的握点离棒尖更近，整只手停在鼓右侧，不再从画面下方用长棒斜着够边。
  const deg = -90 - CONFIG.KA_STICK_OUT_DEG * H.out;
  const r = deg * Math.PI / 180;
  const dir = { x: Math.cos(r), y: Math.sin(r) };
  const contact = V.add(C0, V.mul(dir, CONFIG.KA_TIP_OUT_PX));
  // 握点高度仍按接触点算，手的位置不变。棒尖再沿棒伸出：约可见棒身（黑环→接触点）的 1/5，
  // 让接触点在离棒尖约 1/5 棒身处、棒头露出鼓边外，冲击光仍落在接触点。
  const lenToContact = Math.max(220, (CONFIG.KA_GRIP_Y - contact.y) / Math.max(0.25, -dir.y));
  const ringFromGrip = CONFIG.TAPE_LEN - CONFIG.STUB;
  const shaftToContact = Math.max(80, lenToContact - ringFromGrip);
  const past = shaftToContact * (CONFIG.KA_TIP_PAST_RATIO || 0);
  const tip = V.add(contact, V.mul(dir, past));
  const grip = V.sub(contact, V.mul(dir, lenToContact));
  return { tip, grip, deg, contact };
}

/** 预备/闲置：两棒回到鼓心咚位，倒V悬在鼓面上方。shiftOut=1 时棒尖往自己一侧微偏（对方打咔用）。 */
function singleIdlePose(hand, shiftOut) {
  const H = GEOM.hands[hand];
  const L = stickLen(hand);
  const shift = (shiftOut ? CONFIG.IDLE_KA_SHIFT_RX : 0) * GEOM.face.rx;
  const tip = { x: H.don.x + H.out * shift, y: H.don.y - CONFIG.IDLE_HOVER_PX };
  const deg = -90 - CONFIG.IDLE_V_DEG * H.out; // 棒尖往内、手下往外 = 倒V
  const r = deg * Math.PI / 180;
  const dir = { x: Math.cos(r), y: Math.sin(r) };
  const grip = V.sub(tip, V.mul(dir, L));
  return { tip, grip, deg };
}

/** 另一只手正在打咔（起势到打中后一小段）时，这只闲置手往外侧让一点。 */
function kaIdleShift(hand, t) {
  const other = hand === "R" ? "L" : "R";
  const evs = (state.events || []).filter((e) => e.hand === other && e.face === "ka" && e.grip !== "roll");
  const win = CONFIG.STRIKE_UPFLICK + CONFIG.STRIKE_DOWN_MAX;
  for (const e of evs) {
    if (t >= e.t - win && t <= e.t + 0.05) return 1;
  }
  return 0;
}

function weldSnap(tip, grip, L) {
  const back = V.sub(grip, tip);
  const dirBack = V.len(back) > 1 ? V.norm(back) : { x: 0, y: 1 };
  const gripS = V.add(tip, V.mul(dirBack, L));
  const d = V.sub(tip, gripS);
  return { tip, grip: gripS, deg: Math.atan2(d.y, d.x) * 180 / Math.PI };
}

function lerpPose(a, b, u, L) {
  const tip = V.lerp(a.tip, b.tip, u);
  const grip = V.lerp(a.grip, b.grip, u);
  const lenA = V.len(V.sub(a.tip, a.grip));
  const lenB = V.len(V.sub(b.tip, b.grip));
  const len = isFinite(L) ? L : lenA + (lenB - lenA) * u;
  return weldSnap(tip, grip, len);
}

/** 举起时整组绕手腕后倒；棒相对手仍是 0°，握点不滑动。 */
function applyWristTilt(pose, lift) {
  if (lift <= 1e-6) return pose;
  const tiltAmp = CONFIG.WRIST_TILT_DEG * lift;
  const r = pose.deg * Math.PI / 180;
  const dir = { x: Math.cos(r), y: Math.sin(r) };
  const wrist = V.sub(pose.grip, V.mul(dir, CONFIG.WRIST_PX));
  const tipUp = V.rot(pose.tip, wrist, 1);
  const sign = tipUp.y < pose.tip.y ? 1 : -1;
  const tilt = sign * tiltAmp;
  return {
    tip: V.rot(pose.tip, wrist, tilt),
    grip: V.rot(pose.grip, wrist, tilt),
    deg: pose.deg + tilt,
  };
}

/** 鼓棒握点到棒尖的固定长度（以咚的持棒为准，单击过程中不滑动）。 */
function stickLen(hand) {
  const H = GEOM.hands[hand];
  const src = H.donLen || H.don;
  return V.len(V.sub(src, H.pivot));
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

/** 内刷/外刷：落点之间的中段沿鼓的径向往鼓心收（inner）或往鼓外甩（outer）。 */
function routeBend(pa, pb, route, k) {
  if (route === "straight" || k <= 0) return { x: 0, y: 0 };
  const mid = V.lerp(pa, pb, 0.5);
  const C = { x: GEOM.face.cx, y: GEOM.face.cy };
  const toC = V.sub(C, mid);
  const radial = V.len(toC) > 1 ? V.norm(toC) : { x: 0, y: 1 };
  const sign = route === "inner" ? 1 : -1;
  return V.mul(radial, sign * CONFIG.BEND_PX * k);
}

/**
 * 核心纯函数：某只手在播放时间 t 的姿势。
 * 返回 { tip, grip:握点, gripType, handDeg（手的朝向）, stickDeg（棒的朝向，含晃动）, lift }
 */
function isRollContact(c) { return c && c.grip === "roll"; }

/** 一对滚奏之后抬起到手停、下一对之前落下：返回手腕 bob 0..1（1 = 停在 1/3 单击高度）。 */
function rollBobBetween(t, ta, tb) {
  const rise = CONFIG.ROLL_RISE;
  if (t - ta < rise) {
    const s = clamp01((t - ta) / rise);
    return 1 - (1 - s) * (1 - s);
  }
  if (tb - t < rise) {
    const s = clamp01((tb - t) / rise);
    return 1 - (1 - s) * (1 - s);
  }
  return 1;
}

function easeInOut(s) { const x = clamp01(s); return 1 - (1 - x) * (1 - x); }
function easeInQuad(s) { const x = clamp01(s); return Math.pow(x, 3.0); }  // 越砸越快，最后1-2帧加速最明显
function easeOutQuad(s) { const x = clamp01(s); return 1 - Math.pow(1 - x, 2.2); } // 碰到立刻高速弹回

/** 间隔 → 0（≤16 分）.. 1（≥8 分）。和 densityScale 同一条分界，连续。 */
function strikeSparseU(dt) {
  if (!isFinite(dt) || dt >= CONFIG.LIFT_DT_FULL) return 1;
  if (dt <= CONFIG.LIFT_DT_16) return 0;
  const u = (dt - CONFIG.LIFT_DT_16) / (CONFIG.LIFT_DT_FULL - CONFIG.LIFT_DT_16);
  return smooth(clamp01(u));
}

/** 稀疏/密集目标时值。16 分及更密去掉上挑；下砸/击中/回弹往短的一端靠。 */
function strikeTimes(dt) {
  const u = strikeSparseU(dt);
  return {
    upflick: CONFIG.STRIKE_UPFLICK * u,
    down: CONFIG.STRIKE_DOWN_MIN + (CONFIG.STRIKE_DOWN_MAX - CONFIG.STRIKE_DOWN_MIN) * u,
    hit: CONFIG.STRIKE_HIT_DENSE + (CONFIG.STRIKE_HIT - CONFIG.STRIKE_HIT_DENSE) * u,
    rebound: CONFIG.STRIKE_REBOUND_DENSE + (CONFIG.STRIKE_REBOUND - CONFIG.STRIKE_REBOUND_DENSE) * u,
    u,
  };
}

/**
 * 把目标时值塞进两击间隔：够宽就击中后回预备再上挑打下；不够就丢掉预备/上挑并按比例压缩回弹+下砸。
 * 返回的 hit 是上一击结束后停在落点的时间（发光、棒不另作停顿）。
 */
function strikeFit(gap) {
  const tm = strikeTimes(gap);
  if (!isFinite(gap) || gap > 4) return Object.assign({}, tm, { idleMid: true });
  const rest = gap - tm.hit;
  if (rest <= 1e-6) {
    const hit = Math.min(tm.hit, gap * 0.25);
    return { hit: hit, rebound: 0, upflick: 0, down: Math.max(1e-4, gap - hit), u: tm.u, idleMid: false };
  }
  const wantIdle = tm.rebound + tm.upflick + tm.down;
  if (rest >= wantIdle) return Object.assign({}, tm, { idleMid: true });
  if (rest >= tm.rebound + tm.down) {
    return { hit: tm.hit, rebound: tm.rebound, upflick: Math.min(tm.upflick, rest - tm.rebound - tm.down), down: tm.down, u: tm.u, idleMid: false };
  }
  const k = rest / (tm.rebound + tm.down);
  return { hit: tm.hit, rebound: tm.rebound * k, upflick: 0, down: Math.max(1e-4, tm.down * k), u: tm.u, idleMid: false };
}

/** 单击接近落点：预备 → 极快上挑到最高 → 加速下砸。没有上挑（16 分）就从预备/当前高度直接打下。 */
function singleApproach(t, b) {
  const tm = strikeTimes(isFinite(b.gap) ? b.gap : Infinity);
  if (t >= b.t) return { lift: 0, idle: 0 };
  if (t >= b.t - tm.down) {
    const s = (t - (b.t - tm.down)) / Math.max(1e-6, tm.down);
    return { lift: 1 - easeInQuad(s), idle: 0 };
  }
  if (tm.upflick > 1e-6 && t >= b.t - tm.down - tm.upflick) {
    const s = (t - (b.t - tm.down - tm.upflick)) / tm.upflick;
    return { lift: 1, idle: 1 - easeOutQuad(s) };
  }
  return { lift: 0, idle: 1 };
}

/** 单击打完：落点上留出发光的击中帧，立刻像皮球弹回预备高度（回弹≈下砸速度）。 */
function singleDepart(t, a) {
  const tm = strikeTimes(isFinite(a.gap) ? a.gap : Infinity);
  if (t - a.t < tm.hit) return { lift: 0, idle: 0 };
  const s = clamp01((t - a.t - tm.hit) / Math.max(1e-6, tm.rebound));
  return { lift: 0, idle: easeOutQuad(s) };
}

/** 两下单击之间：够宽就弹回倒V再打下一击；更密就在两落点之间起落，不回预备。 */
function singleBetween(t, a, b, scale) {
  const gap = b.t - a.t;
  const tm = strikeFit(gap);
  const ta = a.t, tb = b.t;
  if (t < ta + tm.hit) return { lift: 0, idle: 0, base: a.target };

  if (tm.idleMid) {
    if (t < ta + tm.hit + tm.rebound) {
      const s = (t - ta - tm.hit) / Math.max(1e-6, tm.rebound);
      return { lift: 0, idle: easeOutQuad(s), base: a.target };
    }
    const upStart = tb - tm.down - tm.upflick;
    if (t < upStart) return { lift: 0, idle: 1, base: a.target };
    if (t < tb - tm.down) {
      const s = (t - upStart) / Math.max(1e-6, tm.upflick);
      return { lift: 1, idle: 1 - easeOutQuad(s), base: b.target };
    }
    const s = (t - (tb - tm.down)) / Math.max(1e-6, tm.down);
    return { lift: 1 - easeInQuad(s), idle: 0, base: b.target };
  }

  const mid = V.lerp(a.target, b.target, smooth(clamp01((t - ta) / gap)));
  const peakT = tb - tm.down;
  if (t < peakT) {
    const s = clamp01((t - (ta + tm.hit)) / Math.max(1e-6, peakT - (ta + tm.hit)));
    return { lift: easeOutQuad(s), idle: 0, base: mid };
  }
  const s = (t - peakT) / Math.max(1e-6, tm.down);
  return { lift: 1 - easeInQuad(s), idle: 0, base: mid };
}

/** 滚奏接触姿势：基准在咚落点（鼓心V不交叉），第二下 press=1 时整手再往下补压一点（仍焊死、不穿鼓）。 */
/** 滚奏接触姿势：保持咚的刚体棒长，把整组平移到 tipTarget（dd 鼓心 / kk 鼓边 / 刷的当前插值点）。 */
function rollContactPose(hand, tipTarget, press) {
  const L = stickLen(hand);
  const base = singleContactPose(hand, "don");
  const src = tipTarget || base.tip;
  const shift = V.sub(src, base.tip);
  const p = press || 0;
  const tip = { x: src.x, y: src.y + 8 * p };
  const grip = { x: base.grip.x + shift.x, y: base.grip.y + shift.y + CONFIG.ROLL_SECOND_PRESS_PX * p };
  return weldSnap(tip, grip, L);
}

/** 查对侧手在 (tLo, tHi) 内最后一个滚奏击中时刻，用来让「一手最低点 = 另一手最高点开始往下」。 */
function otherHandRollPeak(hand, tLo, tHi, fallbackDown) {
  const other = hand === "R" ? "L" : "R";
  const otr = state.tracks && state.tracks[other];
  if (!otr || !otr.length) return tHi - fallbackDown;
  let last = null;
  for (const c of otr) {
    if (c.grip === "roll" && c.t > tLo + 1e-4 && c.t < tHi - 1e-4) last = c;
  }
  if (last && tHi - last.t >= 0.015 && tHi - last.t <= (tHi - tLo) * 0.7) return last.t;
  return tHi - fallbackDown;
}

/** 滚奏相位：一对内部「下→小弹→再下(补压)」，两对之间「大抬回→最高点→加速往下砸」。 */
function rollPhase(hand, track, a, b, t) {
  if (!a && isRollContact(b)) {
    const bNext = track[1];
    const pairDt = (bNext && bNext.stroke === b.stroke) ? (bNext.t - b.t) : CONFIG.ROLL_RISE;
    const down = Math.min(CONFIG.ROLL_DOWN_MAX, Math.max(0.025, pairDt));
    const peakT = otherHandRollPeak(hand, b.t - 3 * down, b.t, down);
    // 抬起要提早完成：对侧第一下时这只手已经接近最高，才能看出「一只手低、一只手高」
    const upDur = Math.max(0.16, 3 * down);
    const upStart = peakT - upDur;
    const grip = t >= b.t - 0.25 ? "roll" : "single";
    if (t >= peakT) {
      const s = clamp01((t - peakT) / Math.max(1e-6, b.t - peakT));
      return { lift: 1 - easeInQuad(s), idle: 0, press: 0, grip, base: b.target, buzz: null };
    }
    if (t >= upStart) {
      const s = clamp01((t - upStart) / upDur);
      return { lift: easeOutQuad(s), idle: 1 - easeOutQuad(s), press: 0, grip, base: b.target, buzz: null };
    }
    return { lift: 0, idle: 1, press: 0, grip, base: b.target, buzz: null };
  }

  if (a && !b && isRollContact(a)) {
    const reboundDur = 0.12;
    const s = clamp01((t - a.t) / reboundDur);
    const press = (a.idxInStroke === 1 ? 1 : 0) * (1 - easeOutQuad(s));
    const grip = t <= a.t + CONFIG.ROLL_END_GRIP_KEEP ? "roll" : "single";
    return { lift: 0, idle: easeOutQuad(s), press, grip, base: a.target, buzz: null };
  }

  if (a.stroke === b.stroke && isRollContact(a) && isRollContact(b)) {
    // 成对内部 (RR)/(LL)：下(a) → 立刻小弹 → 加速再下(b, 补压)
    const u = clamp01((t - a.t) / Math.max(1e-6, b.t - a.t));
    const uPeak = CONFIG.ROLL_BOUNCE_PEAK_U;
    let lift, press;
    if (u <= uPeak) {
      lift = CONFIG.ROLL_BOUNCE_RATIO * easeOutQuad(u / uPeak);
      press = 0;
    } else {
      const s = (u - uPeak) / (1 - uPeak);
      lift = CONFIG.ROLL_BOUNCE_RATIO * (1 - easeInQuad(s));
      press = easeInQuad(s);
    }
    return { lift, idle: 0, press, grip: "roll", base: V.lerp(a.target, b.target, smooth(u)), buzz: a };
  }

  if (isRollContact(a) && isRollContact(b)) {
    // 两对之间：大抬回 → 对侧第二下时正好到达最高点 → 加速砸向下一对第一下
    const gap = b.t - a.t;
    const fallbackDown = Math.min(CONFIG.ROLL_DOWN_MAX, gap / 3);
    const peakT = otherHandRollPeak(hand, a.t, b.t, fallbackDown);
    const u = clamp01((t - a.t) / Math.max(1e-6, gap));
    const base = V.lerp(a.target, b.target, smooth(u));
    if (t <= peakT) {
      const s = clamp01((t - a.t) / Math.max(1e-6, peakT - a.t));
      const press = (a.idxInStroke === 1 ? 1 : 0) * (1 - easeOutQuad(s));
      return { lift: easeOutQuad(s), idle: 0, press, grip: "roll", base, buzz: null };
    }
    const s = clamp01((t - peakT) / Math.max(1e-6, b.t - peakT));
    return { lift: 1 - easeInQuad(s), idle: 0, press: 0, grip: "roll", base, buzz: null };
  }

  // 滚奏 ↔ 单击交接：滚奏结束马上切回单击握拳
  const u = clamp01((t - a.t) / Math.max(1e-6, b.t - a.t));
  const scale = densityScale(b.t - a.t);
  const gap = b.t - a.t;
  const down = Math.min(CONFIG.STRIKE_DOWN_MAX, gap * 0.45);
  const peakT = b.t - down;
  const lift = t <= peakT ? easeOutQuad(clamp01((t - a.t) / Math.max(1e-6, peakT - a.t)))
                          : 1 - easeInQuad(clamp01((t - peakT) / Math.max(1e-6, down)));
  const grip = isRollContact(a)
    ? (t <= a.t + CONFIG.ROLL_END_GRIP_KEEP ? "roll" : "single")
    : (u >= 0.45 ? "roll" : "single");
  const press = (isRollContact(a) && a.idxInStroke === 1) ? (1 - easeOutQuad(clamp01(u * 2))) : 0;
  return { lift, idle: 0, press, grip, base: V.lerp(a.target, b.target, smooth(u)), scale, buzz: null };
}

/** 击中瞬间后的刚性反冲：力道从鼓面传回，手带着棒整体往回顿一下（t>hitTime，保证接触帧零缝隙且保持焊死）。 */
function applyHitKickback(pose, hand, track, t) {
  let last = null, next = null;
  for (const c of track) { if (c.t <= t) last = c; else { next = c; break; } }
  if (!last) return pose;
  const age = t - last.t;
  const nextGap = next ? (next.t - last.t) : Infinity;
  const dur = Math.min(CONFIG.HIT_KICK_DUR, nextGap * 0.52);
  if (age <= 1e-5 || age >= dur) return pose;
  const u = age / dur;
  // u=0 为 0（贴鼓），紧接着 u≈0.28 冲到峰值 1.0，然后快速融入回弹
  const k = Math.sin(Math.PI * u) * (1 - u) * 2.598;
  const L = V.len(V.sub(pose.tip, pose.grip)); // 用当前刚体长度（咔比咚短），不要一律用 don 的 stickLen
  const r = pose.stickDeg * Math.PI / 180;
  const dir = { x: Math.cos(r), y: Math.sin(r) };
  const amp = last.grip === "roll" ? 0.65 : clamp01(0.45 + 0.55 * densityScale(last.gap));
  const shift = V.add(
    V.mul(dir, -CONFIG.HIT_KICK_BACK_PX * amp * k),
    { x: 0, y: -CONFIG.HIT_KICK_LIFT_PX * amp * k }
  );
  const snapped = weldSnap(V.add(pose.tip, shift), V.add(pose.grip, shift), L);
  return { tip: snapped.tip, grip: snapped.grip, gripType: pose.gripType, handDeg: snapped.deg, stickDeg: snapped.deg, lift: pose.lift };
}

function poseAt(hand, track, t, opts = {}) {
  const H = GEOM.hands[hand];
  const { a, b } = findSegment(track, t);
  let lift, base, bend = { x: 0, y: 0 }, grip, wobble = 0, buzz = null;
  let follow = CONFIG.SINGLE_FOLLOW;
  let rollState = null;
  let singleState = null;
  if (!a && !b) {
    lift = 0; base = H.don; grip = "single";
    singleState = { idle: 1, face: "don", idleShift: kaIdleShift(hand, t) };
  } else if (isRollContact(a) || isRollContact(b)) {
    const ph = rollPhase(hand, track, a, b, t);
    lift = ph.lift; base = ph.base; grip = ph.grip; buzz = ph.buzz;
    if (grip === "roll") {
      rollState = { lift: ph.lift, idle: ph.idle, press: ph.press };
      // 一对内部：kd 内收 / dk 外甩走 routeBend；dd/kk 为 straight，残影无横向偏移
      if (a && b && a.stroke === b.stroke && isRollContact(a) && isRollContact(b)) {
        const u = clamp01((t - a.t) / Math.max(1e-6, b.t - a.t));
        const route = a.route || rollTypeRoute(a.rollType);
        bend = routeBend(a.target, b.target, route, Math.sin(Math.PI * u));
      }
    } else {
      const face = b ? targetFace(hand, ph.base) : "don";
      singleState = { idle: ph.idle, face, scale: ph.scale || 1, idleShift: kaIdleShift(hand, t) };
    }
  } else if (!a) {
    const phase = singleApproach(t, b);
    lift = phase.lift; base = b.target; grip = "single"; follow = 1;
    singleState = { idle: phase.idle, face: targetFace(hand, b.target), scale: densityScale(b.gap), idleShift: kaIdleShift(hand, t) };
  } else if (!b) {
    const phase = singleDepart(t, a);
    lift = phase.lift; base = a.target; grip = "single"; follow = 1;
    singleState = { idle: phase.idle, face: targetFace(hand, a.target), scale: densityScale(a.gap), idleShift: kaIdleShift(hand, t) };
  } else {
    const u = clamp01((t - a.t) / (b.t - a.t));
    const scale = densityScale(b.t - a.t);
    const phase = singleBetween(t, a, b, scale);
    lift = phase.lift; base = phase.base; grip = "single"; follow = 1;
    singleState = { idle: phase.idle, face: targetFace(hand, phase.base), scale, idleShift: kaIdleShift(hand, t) };
    if (!phase.idle) bend = routeBend(a.target, b.target, b.route, Math.sin(Math.PI * u) * lift);
  }
  let p = composePose(hand, base, lift, bend, opts.noWobble ? 0 : wobble, grip, follow, rollState, singleState);
  if (!opts.noKick) p = applyHitKickback(p, hand, track, t);
  p.buzz = buzz; p.wobble = opts.noWobble ? 0 : wobble;
  return p;
}

function composePose(hand, base, lift, bend, wobble, grip, follow, rollState, singleState) {
  const H = GEOM.hands[hand];
  if (grip === "single") {
    // 单击：完全固定。follow=1，握点在棒上的位置和握点→棒尖夹角不变，handDeg===stickDeg。
    // 咚：从落点向上举起，绕手腕后倒（上下主要靠手腕轴；近竖直的棒要抬起棒尖，手会跟着焊死的棒走一点）。
    // 咔：整只手连棒明显往斜上外侧平移，再往下砸到 1 点钟鼓边；不靠手腕外翻，平移是主力。
    const face = (singleState && singleState.face) || targetFace(hand, base);
    const scale = singleState && isFinite(+singleState.scale) ? +singleState.scale : 1;
    const idleAmt = singleState && isFinite(+singleState.idle) ? clamp01(+singleState.idle) : 0;
    const hit = singleContactPose(hand, face);
    const L = V.len(V.sub(hit.tip, hit.grip)); // 咚/咔各自刚体长度：咔握点更高，棒身看起来短而竖
    const lv = liftVec(hand, face);
    const raised = weldSnap(
      V.add(V.add(hit.tip, V.mul(lv, scale)), bend),
      V.add(V.add(hit.grip, V.mul(lv, scale)), bend),
      L
    );
    const contact = weldSnap(V.add(hit.tip, bend), V.add(hit.grip, bend), L);
    let pose = lerpPose(contact, raised, clamp01(lift), L);
    // 咚才加手腕后倒，让「打下」读成手腕一弹；咔不加，避免把整手外移读成翻腕。
    if (face !== "ka") pose = applyWristTilt(pose, clamp01(lift) * scale);
    if (idleAmt > 0) pose = lerpPose(pose, singleIdlePose(hand, singleState && singleState.idleShift), idleAmt);
    return { tip: pose.tip, grip: pose.grip, gripType: grip, handDeg: pose.deg, stickDeg: pose.deg, lift };
  }
  // 滚奏全程焊死：手与棒一体，不再绕捏点单独转 12°。
  // 下→小弹→再下(第二下补压)→大抬回，全按刚体焊死平移+微绕手腕转动，handDeg === stickDeg。
  // 落点跟 base（一对两音 face 对应的鼓心/鼓边）；bend 给 kd 内收 / dk 外甩弧。
  const L = stickLen(hand);
  const rLift = rollState && isFinite(+rollState.lift) ? clamp01(+rollState.lift) : clamp01(lift);
  const press = rollState && isFinite(+rollState.press) ? clamp01(+rollState.press) : 0;
  const idleAmt = rollState && isFinite(+rollState.idle) ? clamp01(+rollState.idle) : 0;
  const hit = rollContactPose(hand, base, press);
  const lv = { x: H.out * CONFIG.ROLL_LIFT_OUT_PX, y: -CONFIG.ROLL_LIFT_PX };
  const bnm = bend || { x: 0, y: 0 };
  const raised = weldSnap(V.add(V.add(hit.tip, lv), bnm), V.add(V.add(hit.grip, lv), bnm), L);
  const contact = weldSnap(V.add(hit.tip, bnm), V.add(hit.grip, bnm), L);
  let pose = lerpPose(contact, raised, rLift, L);
  pose = applyWristTilt(pose, rLift * CONFIG.ROLL_WRIST_TILT_SCALE);
  if (idleAmt > 0) pose = lerpPose(pose, singleIdlePose(hand, 0), idleAmt, L);
  return { tip: pose.tip, grip: pose.grip, gripType: grip, handDeg: pose.deg, stickDeg: pose.deg, lift: rLift };
}

function noteX(tNote, now, scroll) {
  return GEOM.lane.judgeX + (tNote - now) * CONFIG.BASE_PX_PER_SEC * scroll;
}

/** 咚：每半边鼓面当前亮度 0..1（左右各取最大） */
function faceGlow(events, second, now) {
  const g = { L: 0, R: 0 };
  for (const e of events) {
    if (e.face !== "don") continue;
    if (e.grip === "roll") continue;   // 滚奏半边鼓面用下面的脉冲，接触点冲击圈另画
    const age = now - e.t;
    if (age < 0 || age > CONFIG.DON_RISE + CONFIG.DON_FALL) continue;
    // 接触帧 age=0 立刻亮起 0.75，避免击中那一帧鼓面还是全白
    let v = age < CONFIG.DON_RISE ? 0.75 + 0.25 * (age / CONFIG.DON_RISE) : 1 - (age - CONFIG.DON_RISE) / CONFIG.DON_FALL;
    if (second.has(e.i)) v *= CONFIG.SECOND_HIT;
    g[e.hand] = Math.max(g[e.hand], v);
  }
  return g;
}

/** 鼓面/鼓体受击微震：咚/咔/滚奏每下接触帧瞬间压沉微缩，1-2帧后回弹归零（只作用在鼓层，不改棒长）。 */
function drumShake(events, now) {
  let maxEnv = 0;
  let signed = 0;
  for (const e of events) {
    const age = now - e.t;
    if (age < 0 || age > CONFIG.DRUM_SHAKE_DUR) continue;
    const u = age / CONFIG.DRUM_SHAKE_DUR;
    // 只在击中那一帧(age≈0)有约2%轻震，迅速归零，不延到回弹帧
    const wave = Math.pow(1 - u, 1.5);
    const weight = e.grip === "roll" ? 0.75 : 1;
    if (Math.abs(wave * weight) > maxEnv) {
      maxEnv = Math.abs(wave * weight);
      signed = wave * weight;
    }
  }
  return {
    scale: 1 - CONFIG.DRUM_SHAKE_SCALE * signed,
    dx: 0,
    dy: CONFIG.DRUM_SHAKE_DY * signed,
  };
}

/** 滚奏期间鼓面/鼓边持续微光，跟着节奏轻轻脉冲，不是每一下开关。 */
function rollGlowPulse(events, now) {
  const rolls = events.filter((e) => e.grip === "roll");
  if (!rolls.length) return 0;
  const first = rolls[0].t, last = rolls[rolls.length - 1].t;
  if (now < first - 0.04 || now > last + 0.1) return 0;
  let dt = Infinity;
  for (let i = 1; i < rolls.length; i++) dt = Math.min(dt, rolls[i].t - rolls[i - 1].t);
  if (!isFinite(dt) || dt <= 1e-4) dt = 0.05;
  const phase = (now - first) / dt;
  return 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(2 * Math.PI * phase));
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
  // 卡片本身不缩；鼓+手整组绕鼓心缩小，棒尖允许略画出框上沿。
  const bodyD = drumBodyD(0);
  const cc = sceneCardClipRect();
  s += `<defs>
          <clipPath id="cardClip"><rect x="${c.x + 1.5}" y="${c.y + 1.5}" width="${c.w - 3}" height="${c.h - 3}" rx="29"/></clipPath>
          <clipPath id="sceneCardClip"><rect x="${f1(cc.x)}" y="${f1(cc.y)}" width="${f1(cc.w)}" height="${f1(cc.h)}" rx="${f1(cc.rx)}"/></clipPath>
          <clipPath id="sceneFaceClip"><ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}"/></clipPath>
        </defs>`;
  s += `<g id="sceneDrum" transform="${sceneTransform()}">`;
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
  s += `</g>`;
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
  const stub = pose.gripType === "roll" ? CONFIG.TAPE_LEN * 0.25 : CONFIG.STUB;  // 滚奏捏点钉在胶带约 1/4
  const butt = V.sub(pose.grip, V.mul(dir, stub));
  const ring = V.add(butt, V.mul(dir, CONFIG.TAPE_LEN));                // 胶带上端 = 黑环
  return { dir, n: { x: -dir.y, y: dir.x }, butt, ring, tip: pose.tip, tw: CONFIG.TAPE_W * k, sw: CONFIG.SHAFT_W * k };
}

/**
 * Auto-check: 单击时握点→棒尾长度、握点→棒尖长度每帧不变（允许 1px 误差），
 * 且 handDeg === stickDeg。samples 是 { t, pose } 或 pose 数组。
 * 返回 { ok, errors, stats }；ok=false 时 errors 里有说明。
 */
function checkSingleWeld(samples) {
  const poses = (samples || []).map((s) => s.pose || s).filter((p) => p && p.gripType === "single");
  const errors = [], stubLens = [], tipLens = [], handDegs = [], stickDegs = [];
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i], g = stickGeom(p);
    const stubLen = V.len(V.sub(p.grip, g.butt));
    const tipLen = V.len(V.sub(p.grip, p.tip));
    stubLens.push(stubLen);
    tipLens.push(tipLen);
    handDegs.push(p.handDeg);
    stickDegs.push(p.stickDeg);
    const dAng = Math.abs(p.handDeg - p.stickDeg);
    const angErr = Math.min(dAng, Math.abs(dAng - 360));
    if (angErr > 1e-3) {
      errors.push("frame " + i + ": handDeg=" + p.handDeg.toFixed(4) + " !== stickDeg=" + p.stickDeg.toFixed(4));
    }
  }
  function drift(arr, label, throwErr) {
    if (!arr.length) return;
    const lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr);
    if (throwErr !== false && hi - lo > 1) errors.push(label + " drifted " + (hi - lo).toFixed(3) + "px (min " + lo.toFixed(3) + ", max " + hi.toFixed(3) + ")");
    return { min: lo, max: hi, span: hi - lo, n: arr.length };
  }
  // 咚与咔是两套刚体长度（咔握点抬到鼓下缘，棒身更短），各自内部 span 必须为 0；
  // 从预备/咚过渡到咔时长度在两者之间插值，这些中间帧不计入漂移。
  const donL = stickLen("R");
  const kaPose = singleContactPose("R", "ka");
  const kaL = V.len(V.sub(kaPose.tip, kaPose.grip));
  const donTips = [], kaTips = [], blendTips = [];
  for (const L of tipLens) {
    if (Math.abs(L - donL) <= 0.08) donTips.push(L);
    else if (Math.abs(L - kaL) <= 0.08) kaTips.push(L);
    else blendTips.push(L);
  }
  const donStat = drift(donTips, "grip→tip (don) length");
  const kaStat = drift(kaTips, "grip→tip (ka) length");
  for (const L of blendTips) {
    const lo = Math.min(donL, kaL), hi = Math.max(donL, kaL);
    if (L < lo - 1.05 || L > hi + 1.05) {
      errors.push("grip→tip length " + L.toFixed(3) + "px outside don/ka range [" + lo.toFixed(3) + ", " + hi.toFixed(3) + "]");
    }
  }
  const clusterSpan = Math.max(donStat && donStat.span || 0, kaStat && kaStat.span || 0);
  const stats = {
    n: poses.length,
    stub: drift(stubLens, "grip→棒尾 length"),
    gripTip: { min: clusterSpan, max: clusterSpan, span: clusterSpan, don: donStat, ka: kaStat, blend: blendTips.length, donL: donL, kaL: kaL },
    handDeg: handDegs.length ? { min: Math.min.apply(null, handDegs), max: Math.max.apply(null, handDegs) } : null,
    stickDeg: stickDegs.length ? { min: Math.min.apply(null, stickDegs), max: Math.max.apply(null, stickDegs) } : null,
  };
  return { ok: errors.length === 0, errors, stats };
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
  // 单击：手图和棒共用 stickDeg（handDeg === stickDeg），棒在手里永远是 0°。
  // 旋转中心是捏点（棒轴上的握点）；手腕在图里、捏点下方，跟着整只手一起转、一起抬。
  // 滚奏：仍用手朝向 handDeg（手几乎不动，只有棒绕捏点晃）。
  const alignDeg = pose.stickDeg; // 无论单击还是滚奏，手棒全程焊死：handDeg === stickDeg
  const rot = alignDeg - I.axisDeg;
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

/* ---------- 残影：棒尖附近白色短拖影；内刷/外刷再叠一条不过棒尖的方向弧 ---------- */
/** 只画棒尖往回 TRAIL_TIP_LEN 的一小截，不画握把、手臂、粉绿胶带。 */
function tipTrailSilhouette(pose, fill) {
  const g = stickGeom(pose);
  const len = CONFIG.TRAIL_TIP_LEN || 52;
  const half = Math.min(g.sw / 2, 8) + 2;
  const r = 6;
  const start = V.sub(g.tip, V.mul(g.dir, len));
  const near = V.sub(g.tip, V.mul(g.dir, 4));
  const a = V.add(start, V.mul(g.n, half)), b = V.sub(start, V.mul(g.n, half));
  const c = V.add(near, V.mul(g.n, r)), d = V.sub(near, V.mul(g.n, r));
  return `<path d="M${f1(a.x)},${f1(a.y)} L${f1(c.x)},${f1(c.y)} A${f1(r)},${f1(r)} 0 0 0 ${f1(d.x)},${f1(d.y)} L${f1(b.x)},${f1(b.y)} Z" fill="${fill}" stroke="${fill}" stroke-width="1.6" filter="url(#softGlow)"/>`;
}

function renderTrail(hand, track, now) {
  const col = CONFIG.TRAIL_COLOR || "#FFFFFF";
  const p0 = poseAt(hand, track, now);
  const rolling = p0.gripType === "roll";
  const count = rolling ? CONFIG.ROLL_TRAIL_COUNT : CONFIG.TRAIL_ALPHA.length;
  const alphas = rolling ? CONFIG.ROLL_TRAIL_ALPHA : CONFIG.TRAIL_ALPHA;
  const seg = findSegment(track, now);
  const hit = seg.a || seg.b;
  const type = hit && hit.rollType;
  // 滚奏残影回溯一对之内，避免把上一对的大抬回画进弧里；内刷/外甩才能看出往鼓心/鼓外的方向。
  const pairSpan = hit && hit.pairDt ? hit.pairDt * 1.25 : CONFIG.ROLL_TRAIL_ARC_SPAN;
  const span = rolling ? Math.max(count * CONFIG.TRAIL_STEP, Math.min(CONFIG.ROLL_TRAIL_ARC_SPAN, pairSpan)) : count * CONFIG.TRAIL_STEP;
  const pN = poseAt(hand, track, now - span);
  if (V.len(V.sub(p0.tip, pN.tip)) < (rolling ? 2 : 3)) return "";          // 几乎没动就不画（停手时没有残影）
  let s = "";
  for (let k = count; k >= 1; k--) {                              // 越早越淡；只留棒尖短截
    const p = poseAt(hand, track, now - k * span / count);
    s += `<g opacity="${alphas[k - 1]}">${tipTrailSilhouette(p, col)}</g>`;
  }
  // kd 内收 / dk 外甩：用一对时长（ROLL_TRAIL_ARC_SPAN 为上限）画白色弧，终点就是当前棒尖，不向外伸箭头。
  if (type === "kd" || type === "dk") {
    const A = poseAt(hand, track, now - span, { noWobble: true }).tip;
    const M = poseAt(hand, track, now - span / 2, { noWobble: true }).tip;
    const B = poseAt(hand, track, now, { noWobble: true }).tip;
    if (V.len(V.sub(B, A)) + V.len(V.sub(M, A)) >= 8) {
      const Q = V.sub(V.mul(M, 2), V.mul(V.add(A, B), 0.5));
      const d = `M${f1(A.x)},${f1(A.y)} Q${f1(Q.x)},${f1(Q.y)} ${f1(B.x)},${f1(B.y)}`;
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" opacity=".35"/>`;
    }
  }
  return s;
}

/* ---------- 打击效果 ---------- */
function renderFaceGlow(_events, _second, _now) {
  const F = GEOM.face;
  // 去掉旧的半边橙红/粉色染色残留（不再整半边鼓染色），只保留鼓面高光和外圈描边；击中光集中在落点侧。
  let s = `<ellipse cx="${F.cx - 70}" cy="${F.cy - 62}" rx="72" ry="21" fill="#fff" opacity=".55" transform="rotate(-10 ${F.cx - 70} ${F.cy - 62})"/>`;
  s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="none" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  return s;
}

function renderHitFx(events, second, now, shake) {
  let s = "";
  // 不在滚奏期间整面染红；每一下的落点侧击中光+波纹在下方循环里单独按接触帧画出。
  const maxAge = Math.max(CONFIG.KA_DUR, CONFIG.GOLD_DUR, CONFIG.LABEL_DUR, CONFIG.IMPACT_DUR);
  for (const { e, age } of activeHits(events, now, maxAge)) {
    const H = GEOM.hands[e.hand], k2 = second.has(e.i) ? CONFIG.SECOND_HIT : 1;
    const isRoll = e.grip === "roll";
    const impDur = isRoll ? CONFIG.IMPACT_ROLL_DUR : CONFIG.IMPACT_DUR;
    if (age <= impDur) {
      // 接触点小冲击圈（咚打鼓面 / 咔打鼓边 / 滚奏每一下都有）
      // 咔：中心对齐棒尖在鼓边黑线上的接触点（1/11 点钟），不要偏到鼓面里。
      const u = clamp01(age / impDur);
      const fade = (1 - u) * (1 - 0.35 * u) * k2;
      const pt = e.face === "ka" ? kaImpactPt(e.hand, shake) : H.don;
      const col = e.face === "ka" ? COL.ka : COL.don;
      const maxR = isRoll ? 24 : 34;
      const r = 10 + maxR * easeOutQuad(u);
      const ry = e.face === "ka" ? r * 0.85 : r * 0.62;
      // 落点侧局部击中光晕（仅在接触帧亮，不染半边鼓）
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1((isRoll ? 34 : 46))}" ry="${f1((isRoll ? 22 : 30))}" fill="${col}" opacity="${f1(0.32 * fade)}" filter="url(#softGlow)"/>`;
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1(r)}" ry="${f1(ry)}" fill="none" stroke="${col}" stroke-width="${f1((isRoll ? 3.4 : 4.5) * (1 - 0.4 * u))}" opacity="${f1(0.95 * fade)}"/>`;
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1(9.5 * (1 - 0.2 * u))}" ry="${f1(6.5 * (1 - 0.2 * u))}" fill="#fff" stroke="${col}" stroke-width="2.2" opacity="${f1(0.98 * fade)}"/>`;
      // 4条短放射冲击线（咚沿着鼓面散开，咔朝鼓边外侧放射）
      const baseAng = e.face === "ka" ? ellipseParamDeg(pt) : -90;
      const offsets = e.face === "ka" ? [-55, -18, 18, 55] : [-145, -35, 35, 145];
      const r0 = 7 + maxR * 0.45 * easeOutQuad(u);
      const r1 = r0 + (isRoll ? 6 : 9) * (1 - 0.3 * u);
      for (const da of offsets) {
        const rad = (baseAng + da) * Math.PI / 180;
        const x0 = pt.x + Math.cos(rad) * r0, y0 = pt.y + Math.sin(rad) * r0 * (e.face === "ka" ? 0.9 : 0.65);
        const x1 = pt.x + Math.cos(rad) * r1, y1 = pt.y + Math.sin(rad) * r1 * (e.face === "ka" ? 0.9 : 0.65);
        s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${col}" stroke-width="2.4" stroke-linecap="round" opacity="${f1(0.85 * fade)}"/>`;
      }
    }
    if (isRoll) continue;                             // 滚奏不用单击那种一下一灭的大咔光
    if (e.face === "ka" && age <= CONFIG.KA_DUR) {
      // 青光沿鼓边、压在棒尖接触点那一段（右 1 点钟 / 左 11 点钟），亮在鼓边外侧、不在鼓面里。
      const k = age / CONFIG.KA_DUR;
      const mid = ellipseParamDeg(kaImpactPt(e.hand, shake));
      const halfSpan = CONFIG.KA_SPAN / 2;
      const a0 = mid - halfSpan;
      const a1 = mid + halfSpan;
      const d = ellipseArcD(a0, a1, CONFIG.KA_GLOW_GROW);
      s += `<path d="${d}" fill="none" stroke="${COL.ka}" stroke-width="${f1(CONFIG.KA_W * k2)}" stroke-linecap="round"
            opacity="${f1(0.9 * (1 - k) * k2)}" filter="url(#softGlow)"/>`;
      s += `<path d="${d}" fill="none" stroke="${COL.ka}" stroke-width="${f1(CONFIG.KA_W * k2 * 0.45)}" stroke-linecap="round"
            opacity="${f1(0.9 * (1 - k) * k2)}"/>`;
    }
    if (e.inserted && age <= CONFIG.GOLD_DUR) {      // 插音：效果外面再一圈金色柔光
      const k = age / CONFIG.GOLD_DUR;
      const goldHalf = CONFIG.GOLD_KA_SPAN / 2;
      const kaAngFx = e.face === "ka" ? ellipseParamDeg(kaImpactPt(e.hand, shake)) : 0;
      const d = e.face === "ka"
        ? ellipseArcD(kaAngFx - goldHalf, kaAngFx + goldHalf, CONFIG.KA_GLOW_GROW + 8)
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
    const c = { x: ox, y: p.y - 26 };
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
  // 落点不再画一下一闪的圆点（改由 rollGlowPulse 做持续微光）
  if (!pose.buzz || pose.gripType !== "roll") return s;
  const g = stickGeom(pose), P = pose.grip;
  if (layer === "under") {
    // 32 分及更密、且实时 rate==1：汐月扇形残影。16 分只靠更长更淡的 trail。
    const merged = state.rate === 1 && pose.buzz.pairDt && pose.buzz.pairDt < CONFIG.BLUR_DT;
    if (merged) {
      const L = V.len(V.sub(pose.tip, P)), a0 = pose.stickDeg - CONFIG.ROLL_ROCK_DEG, a1 = pose.stickDeg + CONFIG.ROLL_ROCK_DEG;
      const pt = (deg, r) => V.add(P, { x: Math.cos(deg * Math.PI / 180) * r, y: Math.sin(deg * Math.PI / 180) * r });
      const A = pt(a0, L * 0.35), B = pt(a0, L), C = pt(a1, L), D = pt(a1, L * 0.35);
      s += `<path d="M${f1(A.x)},${f1(A.y)} L${f1(B.x)},${f1(B.y)} L${f1(C.x)},${f1(C.y)} L${f1(D.x)},${f1(D.y)} Z" fill="${CONFIG.TRAIL_COLOR || "#FFFFFF"}" opacity=".28" filter="url(#softGlow)"/>`;
    }
    return s;
  }
  // 捏点旁的短震动线：只在一对回弹时轻轻画，不做成闪烁
  const base = V.add(P, V.mul(g.dir, 34));
  const marks = [[-1, 0], [-1, 9], [1, 4]];
  for (const [side, off] of marks) {
    const c = V.add(V.add(base, V.mul(g.dir, off)), V.mul(g.n, side * (g.tw / 2 + 8)));
    const p1 = V.add(c, V.mul(g.n, side * 0)), p2 = V.add(c, V.mul(g.n, side * 9));
    s += line(V.add(p1, V.mul(g.dir, -2)), V.add(p2, V.mul(g.dir, 2)), COL.outline, 1.8, 'opacity=".4"');
  }
  return s;
}

function renderFrame(now) {
  const { events, tracks } = state;
  els.chart.innerHTML = renderChart(events, now, state.scroll);
  const shake = drumShake(events, now);
  const drumEl = document.getElementById("sceneDrum");
  if (drumEl) drumEl.setAttribute("transform", sceneTransform(shake));
  let s = `<g id="sceneFaceFx" transform="${sceneTransform(shake)}">`;
  s += renderFaceGlow(events, tracks.second, now);
  s += renderHitFx(events, tracks.second, now, shake);
  s += `</g>`;
  s += `<g id="sceneDyn" transform="${sceneTransform()}">`;
  s += `<g clip-path="url(#sceneCardClip)">`;       // 左右下仍齐卡片；上沿放宽，咔棒尖可略画出框
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
  s += `</g></g>`;
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
    renderAt, signalBachiDone, poseAt, buildHandTracks, stickGeom, checkSingleWeld,
    singleContactPose, singleIdlePose, rollPairType, rollLanding, rollTypeRoute, CONFIG, GEOM,
    raw: data, meta: info,
  };
  window.renderAt = renderAt;
  signalBachiReady();
  return state;
}
