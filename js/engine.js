"use strict";

/* ===================================================================
 * 1. CONFIG / GEOM —— 尺寸、颜色、时长（颜色全部来自汐月 v2 规格）
 * =================================================================== */
const COL = {
  outline: "#2B2320",                  // 统一描边 3px（手、棒、卡片、谱面；鼓不用这根）
  skin: "#FFE3CC", tint: "#FFC9B8",      // 指尖/指节一点点浅粉（α0.4）
  shaft: "#F3E6C8", tape: "#B9A6E8", tapeLine: "#8F7BC8",   // 鼓棒 v2.3：米白棒身、浅紫缠胶带、黑环
  don: "#E8503A", ka: "#4FE0E6", gold: "#F5C542",
  R: "#5FC99A",                        // 右手（正手）袖口 + 握把粉/绿标记
  L: "#F49AC1",                        // 左手（逆手）袖口 + 握把粉/绿标记（v2.3 起，避开浅紫胶带）
  face: "#FFFDF8", studBand: "#F3D08A", body: "#FF4F19", bodyDark: "#D63A10", stud: "#8A3A28",
  noteDon: "#E8503A", noteKa: "#3FB6E8",   // 谱面音符颜色（和谱面图一致）
};
const OUT = 3;   // 全局描边宽度（鼓以外）
const DRUM_OUT = 10;            // 鼓自己的轮廓描边。只画在鼓上，不改 OUT
const DRUM_OUTLINE = "#000000"; // 鼓轮廓纯黑

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
  // 棒尖比击中位置高出的像素（按同一手上一下间隔查表）
  LIFT_PX_DENSE: 52,    // 密串/纯 16 分滚串 ≲0.1s
  LIFT_PX_LIGHT: 140,   // 8+16 复合轻点兜底（实际按同组重音 × 0.75 ≈ 141px）
  LIFT_PX_8TH: 105,     // 纯 8 分连串 ~0.1–0.2s（后面不接 16 分对）
  LIFT_PX_SPARSE: 130,  // 普通散音 ~0.2–0.4s
  LIFT_PX_LONG: 200,    // 长散音 / 休息后第一下 ≳0.4s
  LIFT_PX_COMPOUND_HEAVY: 188, // 复合重音（8 分后紧跟 16 分密对），旧版幅度 185–190
  LIFT_COMPOUND_LIGHT_RATIO: 0.75, // 复合轻点 = 同组重音 × 0.75 ≈ 141px，重轻比 ≈ 1.33
  LIFT_PX_SLOW: 130,    // 兼容旧调用：等于普通散音
  LIFT_PX_FAST: 52,     // 兼容旧调用：等于密串
  LIFT_PX_FAST_MIN: 52,
  LIFT_PX_WINDUP: 180,  // 不再用于「密串前预抬」；保留键以免旧调用读到 undefined
  LIFT_PX: 130,         // 兼容旧调用：等于普通散音
  KA_LIFT_PX: 14,       // 咔举起：在接触位上再往上送；与快串同量级，避免回弹跨度过大
  ROLL_LIFT_PX: 150,    // 滚奏大抬回：任意一帧都能看出一只手低（在打）、一只手高（抬起）
  LIFT_OUT_PX: 12,      // 咚举起时棒尖略向外；咔的外移靠宽站位，不靠这个小数
  KA_STICK_OUT_DEG: 10, // 咔棒近竖直，只外倾一点（不再靠长棒斜着从画面下方够鼓边）
  KA_GRIP_Y: 536,       // 咔接触时握点高度：至少抬到鼓下缘（bodyBottom=548）附近
  KA_TIP_OUT_PX: 14,    // 咔接触点相对 H.ka 沿棒伸出的距离：校准后接触点落在 1/11 点钟鼓边黑线上
  KA_TIP_PAST_RATIO: 0.20, // 棒尖再沿棒伸出接触点，长度为可见棒身（黑环→接触点）的约 1/5；冲击光仍用接触点
  WRIST_TILT_DEG: 5,    // 举起时整只手+棒绕手腕后倒 4–6°（焊死，棒相对手仍是 0°）
  WRIST_PX: 100,        // 握点沿棒往下到手腕的距离
  WINDUP: 0.10,         // 兼容旧调用：默认上抬（实际走 WINDUP_UP_*）
  // 起手时机：抬到顶 0.08–0.12s，顶点可停 0–0.1s（≤6 帧），下砸 0.07–0.1s；整段 ≤0.33s。
  WINDUP_UP_MIN: 6 / 60,  // 6 帧，越密越短
  WINDUP_UP_MAX: 8 / 60,  // 8 帧，散音
  WINDUP_HOLD_MAX: 0.10,  // 最多 6 帧停在顶点
  WINDUP_LEAD_MAX: 0.33,  // 起手不早于击打前 0.33s（EARLY 门槛）
  STRIKE_UPFLICK: 8 / 60,
  STRIKE_DOWN_MIN: 5 / 60,// 下砸 5–6 帧（快才有力）
  STRIKE_DOWN_MAX: 6 / 60,
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
  // 落点侧局部击中光晕 + 冲击圈/白芯/放射线（汐月 2026-11-20 5b9a）。
  // 哚再收一档（尺寸 0.76、不透明度 0.60，由 0.20→0.12）；哔保持原值。
  HIT_GLOW: {
    don: {
      rx: 28, ry: 18, op: 0.12,            // was 36×24 / 0.20
      maxR: 25.84, stroke: 3.42, ringOp: 0.57,
      coreRx: 7.22, coreRy: 4.94, coreStroke: 1.67, coreOp: 0.588,
      rayLen: 6.84, rayStroke: 1.82, rayOp: 0.51,
    },
    ka: {
      rx: 46, ry: 30, op: 0.32,
      maxR: 34, stroke: 4.5, ringOp: 0.95,
      coreRx: 9.5, coreRy: 6.5, coreStroke: 2.2, coreOp: 0.98,
      rayLen: 9, rayStroke: 2.4, rayOp: 0.85,
    },
    rollDon: {
      rx: 20, ry: 14, op: 0.12,            // was 27×18 / 0.20
      maxR: 18.24, stroke: 2.58, ringOp: 0.57,
      coreRx: 7.22, coreRy: 4.94, coreStroke: 1.67, coreOp: 0.588,
      rayLen: 4.56, rayStroke: 1.82, rayOp: 0.51,
    },
    rollKa: {
      rx: 34, ry: 22, op: 0.32,
      maxR: 24, stroke: 3.4, ringOp: 0.95,
      coreRx: 9.5, coreRy: 6.5, coreStroke: 2.2, coreOp: 0.98,
      rayLen: 6, rayStroke: 2.4, rayOp: 0.85,
    },
  },
  // 大音符谱面光圈（汐月可再调）：加粗 + 一层白晕，击中/判定时和小音符更容易分开。
  BIG_RING: {
    offset: 6,        // was 4.5
    width: 5,         // was 3
    haloOffset: 8,    // new
    haloWidth: 2.4,   // new
    haloOp: 0.80,     // new, white
  },
  KA_LIFT_OUT_PX: 9,    // 与 KA_LIFT_PX 等比（原 44px @ 72px），保持斜向外抬的角度
  IDLE_HOVER_PX: 40,    // 预备/休息高度：约棒长 1/4（原 112）
  REBOUND_MIN_FRAMES: 6,    // 从咔弹回预备：至少 5–6 帧
  REBOUND_MAX_STEP_PX: 30,  // 验收：除下砸最后一帧，棒尖单帧 ≤ 30px
  HOLD_WINDOW: 0.6,         // 与 check.py 一致：上一击后 / 下一击前 0.6s 内不许举着发呆
  HOLD_STILL_PX: 2,
  IDLE_V_DEG: 16,       // 倒V：近平行微收（两棒不交叉）
  IDLE_KA_SHIFT_RX: 0.15, // 对方打咔时，闲置棒尖往自己一侧偏 0.15 个面半径，避免两棒交叉
  IDLE_SETTLE: 0.22,    // 同手间隔够宽时，中间回到鼓心倒V；实际是否回预备由 strikeFit 按相位时值判断
  SCENE_SCALE: 0.95,    // 鼓+手整组缩小，咔高举时棒尖不容易顶到卡片上沿
  DRUM_Y_SHIFT: 60,     // 鼓+手整体下移（px，正值向下，汐月定值 60）。
  SCENE_CLIP_PAD_TOP: 170, // 卡片上沿额外留白：单击最高点抬高后棒尖不裁切
  KA_GLOW_GROW: 12,     // 青光沿鼓边外侧（中心对齐棒尖接触点，不落在鼓面里）
  // 同手相邻击的间隔 → 抬起高度（8 分及更疏 = 满幅，16 分起收小，32/48 分贴住）
  LIFT_DT_FULL: 0.18,   // ≥ 约 8 分（@160 ≈ 0.1875s）→ 满幅（densityScale 用，不改方向）
  LIFT_DT_16: 0.094,    // 16 分 @160
  LIFT_DT_MIN: 0.031,   // 48 分 @160（32 分更密时也收在下限）
  LIFT_DT_DENSE: 0.10,  // 查表：密串/16 分上沿
  LIFT_DT_8TH: 0.20,    // 查表：8 分上沿
  LIFT_DT_SPARSE: 0.40, // 查表：普通散音上沿；更长走长散音
  LIFT_SCALE_16: 1 / 3, // 16 分幅度约单击的 1/3（规格）
  LIFT_SCALE_MIN: 0.18,
  GRIP_CROSSFADE: 3 / 60, // 单击握拳↔滚奏捏棒换图/锚点：2–3 帧位置交叉淡入淡出
  IDLE_SHIFT_FADE: 8 / 60, // 对方打咔时闲手外让：至少 8 帧，避免 28px 一帧跳变
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
    R: { roll:   { href: "assets/右手_滚奏捏棒.png", w: 835, h: 1942, pinch: [164, 672], axisDeg: -102.4, scale: 0.48, band: null },
         single: { href: "assets/右手_单击握拳.png", w: 849, h: 1939, pinch: [142, 662], axisDeg: -100.6, scale: 0.48, band: null } },
    L: { roll:   { href: "assets/左手_滚奏捏棒.png", w: 835, h: 1942, pinch: [670, 672], axisDeg: -77.6, scale: 0.48, band: null },
         single: { href: "assets/左手_单击握拳.png", w: 849, h: 1939, pinch: [706, 662], axisDeg: -79.4, scale: 0.48, band: null } },
  },
  PIVOT_Y: { img: 700, vector: 806, none: 806 },   // 捏点高度：图片手露到手腕；矢量手裁到指关节
  DON_RISE: 0.025, DON_FALL: 0.2,           // 咚：接触帧即亮起(0.75→1.0)，0.2s 退回
  KA_DUR: 0.032, KA_W: 14, KA_SPAN: 60,     // 咔：鼓边青光只留在击中帧附近（紧贴 1/11 点钟外侧）
  GOLD_DUR: 0.35, GOLD_W: 16, GOLD_KA_SPAN: 68,  // 插音金光；咔插音弧略宽于青光，仍留在落点一侧
  SECOND_HIT: 0.8,                          // 滚奏第二下亮度/光宽 80%
  TRAIL_STEP: 1 / 60,   // 单击残影每 1 帧（60fps）留 1 层
  TRAIL_ALPHA: [0.48, 0.30, 0.16],  // 白色短拖影；浅灰底上纯 35% 几乎看不见，略提到约 50% 并加柔光
  TRAIL_ARC_SPAN: 0.1,  // 单击方向弧线回溯 0.1s
  LABEL_DUR: 0.22,
  LEAD_IN: 0.7, TAIL_TIME: 0.5,
  BASE_PX_PER_SEC: 600,
  // Stage backdrop. Drawn once into #static; renderFrame does not redraw it.
  // "plain" = solid #ececee, no triangle pattern, no white panel, cool-grey floor shadow.
  BG_STYLE: "plain",
  CARD_GREY: "#ececee",
};

const GEOM = {
  face: { cx: 400, cy: 300, rx: 190, ry: 118 },   // 近白椭圆鼓面
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
    both: !!e.both, big: !!e.big,
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
      arr[i].prevGap = i > 0 ? arr[i].t - arr[i - 1].t : Infinity;
      arr[i].nextGap = i + 1 < arr.length ? arr[i + 1].t - arr[i].t : Infinity;
      // 高度/角色只按「同一手上一下」的间隔，不再取 min(prev, next)
      arr[i].gap = arr[i].prevGap;
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

/** 咔顶点封顶：让棒尖顶点停在谱面条下沿 y=108 再往下 10px 的高度（不伸进谱面条，且约齐咚 188 顶点）。 */
function kaMaxLiftPx(hand) {
  const ka = singleContactPose(hand, "ka");
  const minLocalY = sceneInvPt({ x: 0, y: 108 + 10 }).y;
  return Math.max(0, ka.tip.y - minLocalY);
}

/** 单击举起方向。咚、咔走同一张 gap→px 表，从待机位起抬；咔高度封顶至谱面条下沿留 10px。 */
function liftVec(hand, face, heightPx) {
  const H = GEOM.hands[hand];
  const refH = CONFIG.LIFT_PX_SPARSE || CONFIG.LIFT_PX_SLOW || 130;
  const h = isFinite(heightPx) ? heightPx : refH;
  if (face === "ka") {
    const hCap = Math.min(h, kaMaxLiftPx(hand));
    const outRef = CONFIG.KA_LIFT_OUT_PX || 9;
    const out = outRef * Math.min(hCap / (CONFIG.LIFT_PX_8TH || 85), 2);
    return { x: H.out * out, y: -hCap };
  }
  const out = (CONFIG.LIFT_OUT_PX || 12) * (refH > 1e-6 ? h / refH : 1);
  return { x: H.out * out, y: -h };
}

function sceneShiftY() { return CONFIG.DRUM_Y_SHIFT || 0; }

function sceneTransform(shake) {
  const F = GEOM.face, s = CONFIG.SCENE_SCALE;
  const dy0 = sceneShiftY();
  if (!shake || (Math.abs(shake.scale - 1) < 1e-5 && Math.abs(shake.dx) < 1e-3 && Math.abs(shake.dy) < 1e-3)) {
    return `translate(${F.cx},${F.cy + dy0}) scale(${s}) translate(${-F.cx},${-F.cy})`;
  }
  return `translate(${f1(F.cx + shake.dx)},${f1(F.cy + shake.dy + dy0)}) scale(${(s * shake.scale).toFixed(4)}) translate(${-F.cx},${-F.cy})`;
}

/** 屏幕坐标 → 场景缩放后的本地坐标（卡片裁剪要对齐未缩放的画框，上沿再放宽）。 */
function sceneInvPt(p) {
  const F = GEOM.face, s = CONFIG.SCENE_SCALE;
  const dy0 = sceneShiftY();
  return { x: (p.x - F.cx) / s + F.cx, y: (p.y - F.cy - dy0) / s + F.cy };
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
function singleIdlePose(hand, shiftOut, face) {
  const H = GEOM.hands[hand];
  const L = stickLen(hand);
  const hoverY = H.don.y - CONFIG.IDLE_HOVER_PX;
  // 下一击是咔时，在待机高度先横移到咔的 x，再按表往上抬，避免把换面挤进抬手窗。
  if (face === "ka") {
    const ka = singleContactPose(hand, "ka");
    const tip = { x: ka.tip.x, y: hoverY };
    const r = ka.deg * Math.PI / 180;
    const dir = { x: Math.cos(r), y: Math.sin(r) };
    const grip = V.sub(tip, V.mul(dir, L));
    return weldSnap(tip, grip, L);
  }
  const amt = isFinite(+shiftOut) ? clamp01(+shiftOut) : (shiftOut ? 1 : 0);
  const shift = amt * CONFIG.IDLE_KA_SHIFT_RX * GEOM.face.rx;
  const tip = { x: H.don.x + H.out * shift, y: hoverY };
  const deg = -90 - CONFIG.IDLE_V_DEG * H.out; // 棒尖往内、手下往外 = 倒V
  const r = deg * Math.PI / 180;
  const dir = { x: Math.cos(r), y: Math.sin(r) };
  const grip = V.sub(tip, V.mul(dir, L));
  return { tip, grip, deg };
}

/** 对面整串连续咔期间，闲手一直让在外侧；整串结束后再一次性慢慢回来。不以单颗咔往返。 */
const KA_SHIFT_STREAM_GAP = 0.35;
const REST_AFTER = 0.35;
const REST_BEFORE = 0.33;

function ownHitTimes(hand) {
  return (state.events || []).filter((e) => e.hand === hand).map((e) => e.t).sort((a, b) => a - b);
}

function neighborHits(hand, t) {
  const times = ownHitTimes(hand);
  let prv = -9, nxt = 99;
  for (const x of times) {
    if (x <= t + 1e-9) prv = x;
    if (x > t + 1e-9) { nxt = x; break; }
  }
  return { prv, nxt };
}

function kaShiftStreams(other) {
  const evs = (state.events || []).filter((e) => e.hand === other && e.face === "ka" && e.grip !== "roll");
  const streams = [];
  for (const e of evs) {
    if (!streams.length || e.t - streams[streams.length - 1].hi > KA_SHIFT_STREAM_GAP) {
      streams.push({ lo: e.t, hi: e.t });
    } else {
      streams[streams.length - 1].hi = e.t;
    }
  }
  return streams;
}

/** 目标让位：在咔串窗口内为 1，串外为 0，两端按 IDLE_SHIFT_FADE 淡入淡出一次。 */
function kaShiftDesired(hand, t) {
  const other = hand === "R" ? "L" : "R";
  const fade = CONFIG.IDLE_SHIFT_FADE || 0;
  const pre = 0.16;
  const post = 0.08;
  let amt = 0;
  for (const s of kaShiftStreams(other)) {
    const lo = s.lo - pre, hi = s.hi + post;
    if (t >= lo && t <= hi) { amt = 1; break; }
    if (fade > 0 && t >= lo - fade && t < lo) amt = Math.max(amt, clamp01((t - (lo - fade)) / fade));
    if (fade > 0 && t > hi && t <= hi + fade) amt = Math.max(amt, 1 - clamp01((t - hi) / fade));
  }
  return amt;
}

/** 休息窗起点的已立定值（0 或 1，不含淡入淡出中段），保证 REST 段位移为 0。 */
function kaShiftSettled(hand, t) {
  const other = hand === "R" ? "L" : "R";
  const pre = 0.16, post = 0.08;
  for (const s of kaShiftStreams(other)) {
    if (t >= s.lo - pre && t <= s.hi + post) return 1;
  }
  return 0;
}

/**
 * 长休止要停在鼓心倒V。对面咔串如果只是擦过休息起点、后面还有大段空档，
 * 不能把「起点那一帧还让着」冻成整段休息的姿势。
 * 只有对面咔串一直延续到自己下一击之前，才整段保持外让（中途不能再动，否则 REST）。
 */
function longRestShiftHold(hand, prv, nxt) {
  const other = hand === "R" ? "L" : "R";
  const restEnd = nxt - REST_BEFORE;
  const post = 0.08, pre = 0.16;
  for (const s of kaShiftStreams(other)) {
    const reachesNext = s.hi + post >= restEnd - 0.05;
    const overlapsRestStart = s.lo - pre <= prv + REST_AFTER;
    if (reachesNext && overlapsRestStart) return 1;
  }
  return 0;
}

function kaIdleShift(hand, t) {
  const { prv, nxt } = neighborHits(hand, t);
  const longGap = (nxt - prv) > REST_AFTER + REST_BEFORE;
  const settleBy = 0.22; // 比 REST 起点 0.35s 提前停住，避免最后一帧 1px 漏进 REST
  if (longGap && t >= prv) {
    const hold = longRestShiftHold(hand, prv, nxt);
    const inRest = (t - prv > REST_AFTER) && (nxt - t > REST_BEFORE);
    if (inRest || t - prv >= settleBy) return hold;
    const start = kaShiftSettled(hand, prv);
    const u = clamp01((t - prv) / settleBy);
    return start + (hold - start) * u;
  }
  return kaShiftDesired(hand, t);
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
/** 真正的两头慢中间快。注意 easeInOut 历史名其实是 ease-out，回弹不要再用它。 */
function easeInOutCubic(s) {
  const x = clamp01(s);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * 两落点之间的行进曲线：短距离/长时间用近线性，避免高点停住（HOLD）；
 * 长距离/短时间用 smooth 缓入，避免第一帧冲出去（JUMP）。
 * 后半接到线性，末端不把速度收到 0，好接下一段下砸。
 */
/** 把参数略往两端送，压低路径中段的瞬时速度（线性插值姿势在中段棒尖往往更快）。 */
function flattenMid(u, a) {
  const x = clamp01(u);
  const k = isFinite(a) ? a : 0.8;
  return clamp01(x + k * x * (1 - x) * (0.5 - x));
}

function travelEase(s, dist, dur) {
  const x = clamp01(s);
  const frames = Math.max(1, (dur || 0) * 60);
  const d = isFinite(dist) ? Math.max(0, dist) : 0;
  const maxStep = (CONFIG.REBOUND_MAX_STEP_PX || 30) - 1.2; // 留出 1px 余量，避免 30.1
  const avg = d / frames;
  if (avg * 1.02 >= maxStep * 0.70) return x;
  const firstSmooth = 3 * d / (frames * frames);
  if (d >= 24 && firstSmooth >= 2.0 && (1.5 * avg) <= maxStep) {
    if (x < 0.5) return smooth(x);
    const mid = smooth(0.5);
    return mid + (1 - mid) * (x - 0.5) / 0.5;
  }
  return 0.15 * x * x + 0.85 * x;
}

/** 下砸曲线：优先纯二次加速；大距离时切 C1 分段加速（前半 ≤28.7px、后 3 帧 ≤42px），保持 5–6 帧高速下砸。 */
function easeInDown(s, dist, dur) {
  const x = clamp01(s);
  const frames = Math.max(2, (isFinite(dur) && dur > 0 ? dur * 60 : 6));
  const d = isFinite(dist) ? Math.max(0, dist) : 0;
  const limEarly = (CONFIG.REBOUND_MAX_STEP_PX || 30) - 1.3;
  const limLate = 45 - 2.0;
  const evalBlend = (u, a) => a * u + (1 - a) * u * u;
  const evalSplit = (u) => {
    const m = 0.39, a1 = 0.90, a2 = m * (2 - a1) / (1 - m);
    if (u <= 0.5) { const t = 2 * u; return m * (a1 * t + (1 - a1) * t * t); }
    const t = 2 * u - 1;
    return m + (1 - m) * (a2 * t + (1 - a2) * t * t);
  };
  const okCurve = (fn) => {
    for (let rem = 1.02; rem < frames; rem += 0.15) {
      const s1 = (frames - rem) / frames;
      const s0 = Math.max(0, (frames - rem - 1) / frames);
      const step = d * (fn(s1) - fn(s0));
      const lim = rem <= 3.0 ? limLate : limEarly;
      if (step > lim) return false;
    }
    return true;
  };
  if (okCurve((u) => evalBlend(u, 0))) {
    let a = 0;
    const first = d * evalBlend(Math.min(1, 1 / frames), 0);
    if (first < 2.2 && d > 4) {
      const needA = clamp01((2.2 / Math.max(d, 1e-6) - Math.pow(1 / frames, 2)) / Math.max(1e-6, (1 / frames) - Math.pow(1 / frames, 2)));
      if (okCurve((u) => evalBlend(u, needA))) a = needA;
    }
    return evalBlend(x, a);
  }
  for (let a = 0.1; a <= 0.6; a += 0.1) {
    if (okCurve((u) => evalBlend(u, a))) return evalBlend(x, a);
  }
  return evalSplit(x);
}

function tipDistIdleToRaised(hand, face, heightPx) {
  const idle = singleIdlePose(hand, 0, face);
  const raised = composeSingleByFace(hand, face, 1, { x: 0, y: 0 }, heightPx);
  return V.len(V.sub(idle.tip, raised.tip));
}

function tipDistContactToRaised(hand, face, heightPx) {
  const c = composeSingleByFace(hand, face, 0, { x: 0, y: 0 }, heightPx);
  const r = composeSingleByFace(hand, face, 1, { x: 0, y: 0 }, heightPx);
  return V.len(V.sub(c.tip, r.tip));
}

function tipDistContactToIdle(hand, face, toIdleFace) {
  const a = singleContactPose(hand, face === "ka" ? "ka" : "don");
  const b = singleIdlePose(hand, 0, toIdleFace || "don");
  return V.len(V.sub(a.tip, b.tip));
}

function tipDistContacts(hand, faceA, faceB) {
  const a = singleContactPose(hand, faceA === "ka" ? "ka" : "don");
  const b = singleContactPose(hand, faceB === "ka" ? "ka" : "don");
  return V.len(V.sub(a.tip, b.tip));
}

/** 从 face 弹回预备位的最短时长：咔至少 5–6 帧，并按距离保证中间最快帧不超过 30px。 */
function reboundMinDur(hand, face, toIdleFace) {
  const minDur = (CONFIG.REBOUND_MIN_FRAMES || 6) / 60;
  const dist = tipDistContactToIdle(hand || "R", face, toIdleFace);
  const maxStep = CONFIG.REBOUND_MAX_STEP_PX || 30;
  const need = dist * 1.5 / (maxStep * 60);
  if (face === "ka") return Math.max(minDur, need, 1e-4);
  return Math.max(need, 1e-4);
}

function tipDistIdleToIdle(hand, fromFace, toFace) {
  const a = singleIdlePose(hand, 0, fromFace === "ka" ? "ka" : "don");
  const b = singleIdlePose(hand, 0, toFace === "ka" ? "ka" : "don");
  return V.len(V.sub(a.tip, b.tip));
}

/** 存在 REST 窗（上一击后 0.35s 到下一击前 0.33s）时，长休止中间必须停在鼓心倒V。 */
function longRestWindow(tPrev, tNext) {
  const t0 = (isFinite(tPrev) ? tPrev : -9) + REST_AFTER;
  const t1 = (isFinite(tNext) ? tNext : 99) - REST_BEFORE;
  return t1 > t0 + 1e-6 ? { t0, t1 } : null;
}

/**
 * 长休止一律收回鼓心倒V；若下一击是咔，休止窗结束后再在待机高度横移到咔预备位，然后按表抬手。
 * 短间隔（没有 REST 窗）仍在回弹阶段直接到下一击预备位，避免把换面挤进抬手窗。
 */
function restParkPlan(hand, tPrev, tHit, nextFace) {
  const approachFace = nextFace === "ka" ? "ka" : "don";
  const restW = longRestWindow(tPrev, tHit);
  if (!restW) {
    return { park: false, restFace: approachFace, approachFace, tSlideStart: Infinity, tSlideEnd: -Infinity, slideDist: 0, slideDur: 0, tReady: -Infinity };
  }
  if (approachFace === "don") {
    return { park: true, restFace: "don", approachFace, tSlideStart: Infinity, tSlideEnd: -Infinity, slideDist: 0, slideDur: 0, tReady: -Infinity };
  }
  const slideDist = tipDistIdleToIdle(hand, "don", "ka");
  const slideDur = travelDur(slideDist, 6 / 60, 5 / 60, 0.10);
  const tSlideStart = restW.t1;
  const tSlideEnd = tSlideStart + slideDur;
  return { park: true, restFace: "don", approachFace, tSlideStart, tSlideEnd, slideDist, slideDur, tReady: tSlideEnd };
}

function parkIdleState(plan, t) {
  if (!plan || !plan.park) {
    const face = (plan && plan.approachFace) || "don";
    return { idleFace: face, idleFaceFrom: face, idleBlend: 1 };
  }
  if (!(t >= plan.tSlideStart) || plan.slideDur < 1e-6) {
    return { idleFace: "don", idleFaceFrom: "don", idleBlend: 1 };
  }
  if (t >= plan.tSlideEnd) {
    return { idleFace: plan.approachFace, idleFaceFrom: plan.approachFace, idleBlend: 1 };
  }
  const s = (t - plan.tSlideStart) / plan.slideDur;
  const u = travelEase(s, plan.slideDist, plan.slideDur);
  return { idleFace: plan.approachFace, idleFaceFrom: "don", idleBlend: u };
}

function withParkIdle(ph, plan, t) {
  return Object.assign(ph, parkIdleState(plan, t));
}

/** 同一只手上一下的间隔（时值/节拍拟合用）。 */
function prevGapOf(contact) {
  if (contact && isFinite(contact.prevGap)) return contact.prevGap;
  if (contact && isFinite(contact.gap)) return contact.gap;
  return Infinity;
}

/** 谱面全局相邻音符的前间隔（高度查表用：1-1 交替 16 分按谱面 16 分算，不按同手 8 分）。 */
function chartPrevGapOf(contact) {
  const ev = eventOfContact(contact);
  const evs = (typeof state !== "undefined" && state.events) ? state.events : [];
  if (!ev || !evs.length) return prevGapOf(contact);
  let prevT = -Infinity;
  for (let i = 0; i < evs.length; i++) {
    const t = evs[i].t;
    if (t < ev.t - 1e-6 && t > prevT) prevT = t;
  }
  return isFinite(prevT) ? ev.t - prevT : Infinity;
}

/** 单击事件按时间排序（不含滚奏）。用来判定 8+16 复合。 */
function singleEventList() {
  return (state.events || []).filter((e) => e.grip !== "roll").slice().sort((a, b) => a.t - b.t);
}

function eventOfContact(contact) {
  return (contact && contact.ev) ? contact.ev : contact;
}

function eventIndex(evs, ev) {
  if (!ev) return -1;
  return evs.findIndex((e) => e === ev || (e.i != null && ev.i != null && e.i === ev.i) ||
    (e.t === ev.t && e.hand === ev.hand && e.face === ev.face));
}

/** 将单击事件按同时刻（处理双手大音符）分组。 */
function singleTimeGroups(evs) {
  const groups = [];
  for (const e of evs) {
    if (!groups.length || e.t - groups[groups.length - 1].t > 1e-5) {
      groups.push({ t: e.t, evs: [e] });
    } else {
      groups[groups.length - 1].evs.push(e);
    }
  }
  return groups;
}

/** 8+16 复合组：前面空隙 ≥8 分（>密串阈值），后面紧跟 1–2 个 16 分间隔（2–3 颗如 1120）；
 *  若紧跟 ≥3 个连续密间隔（整段 16 分滚串），则是段首，走普通查表（85/130），不标成复合。 */
function compoundLightRunAt(groups, k) {
  if (k < 0 || k + 1 >= groups.length) return 0;
  const dense = CONFIG.LIFT_DT_DENSE || 0.10;
  const g = (i) => groups[i + 1].t - groups[i].t;
  const prevG = k > 0 ? groups[k].t - groups[k - 1].t : Infinity;
  if (!(prevG > dense + 1e-6)) return 0;
  if (!(g(k) > 1e-6 && g(k) <= dense + 1e-6)) return 0;
  let denseRun = 1;
  while (k + denseRun + 1 < groups.length && g(k + denseRun) <= dense + 1e-6) {
    denseRun++;
    if (denseRun >= 3) return 0;
  }
  return denseRun;
}

/** 给每个单击标上复合角色。谱面载入后只算一次。 */
function compoundRoleMap() {
  const evs = singleEventList();
  const cache = typeof state !== "undefined" ? state : null;
  if (cache && cache._compoundRoles && cache._compoundRoles.n === evs.length) return cache._compoundRoles.map;
  const groups = singleTimeGroups(evs);
  const map = new Map();
  for (let k = 0; k < groups.length; k++) {
    const lightRun = compoundLightRunAt(groups, k);
    if (!lightRun) continue;
    const heavyEv = groups[k].evs[0];
    for (const e of groups[k].evs) map.set(e, { role: "heavy", heavy: heavyEv });
    for (let j = 1; j <= lightRun && k + j < groups.length; j++) {
      for (const e of groups[k + j].evs) map.set(e, { role: "light", heavy: heavyEv });
    }
  }
  if (cache) cache._compoundRoles = { n: evs.length, map };
  return map;
}

/** 复合段角色：heavy / light / null（走普通查表）。轻点只标同组那 1–2 颗 16 分。 */
function compoundRole(contact) {
  const ev = eventOfContact(contact);
  if (!ev || ev.grip === "roll") return null;
  const map = compoundRoleMap();
  if (map.has(ev)) return map.get(ev);
  const evs = singleEventList();
  const i = eventIndex(evs, ev);
  if (i >= 0 && map.has(evs[i])) return map.get(evs[i]);
  return null;
}

/** 按谱面相邻间隔查表（不含复合加重）。 */
function liftHeightFromGap(dt) {
  const anchors = [
    [0, CONFIG.LIFT_PX_DENSE],
    [CONFIG.LIFT_DT_DENSE || 0.10, CONFIG.LIFT_PX_DENSE],
    [0.12, CONFIG.LIFT_PX_8TH],
    [CONFIG.LIFT_DT_8TH || 0.20, CONFIG.LIFT_PX_8TH],
    [0.22, CONFIG.LIFT_PX_SPARSE],
    [CONFIG.LIFT_DT_SPARSE || 0.40, CONFIG.LIFT_PX_SPARSE],
    [0.45, CONFIG.LIFT_PX_LONG],
  ];
  if (!isFinite(dt) || dt >= anchors[anchors.length - 1][0]) return CONFIG.LIFT_PX_LONG;
  for (let i = 1; i < anchors.length; i++) {
    if (dt <= anchors[i][0]) {
      const t0 = anchors[i - 1][0], h0 = anchors[i - 1][1];
      const t1 = anchors[i][0], h1 = anchors[i][1];
      const u = t1 <= t0 ? 1 : (dt - t0) / (t1 - t0);
      return h0 + (h1 - h0) * u;
    }
  }
  return CONFIG.LIFT_PX_LONG;
}

function compoundHeavyHeight(heavyEv) {
  const dt = heavyEv ? chartPrevGapOf(heavyEv) : Infinity;
  return Math.max(liftHeightFromGap(dt), CONFIG.LIFT_PX_COMPOUND_HEAVY || 188);
}

/** 这下单击的抬手高度（棒尖比击中位置高出的像素）。按谱面相邻间隔判定，不再按同手间隔。 */
function liftHeightPx(contact) {
  const acc = compoundRole(contact);
  if (acc && acc.role === "heavy") return Math.max(liftHeightFromGap(chartPrevGapOf(contact)), CONFIG.LIFT_PX_COMPOUND_HEAVY || 188);
  if (acc && acc.role === "light") {
    const ratio = CONFIG.LIFT_COMPOUND_LIGHT_RATIO || 0.75;
    return compoundHeavyHeight(acc.heavy) * ratio;
  }
  return liftHeightFromGap(chartPrevGapOf(contact));
}

/** 固定起手窗口：抬到顶 0.08–0.12s（越密越短），顶点可停 0–0.1s，下砸 0.07–0.1s；总长 ≤0.33s。 */
function windupTimes(dt) {
  const dense = CONFIG.LIFT_DT_DENSE || 0.10;
  const sparse = CONFIG.LIFT_DT_SPARSE || 0.40;
  let u = 1;
  if (isFinite(dt) && dt < sparse) {
    u = dt <= dense ? 0 : clamp01((dt - dense) / (sparse - dense));
  }
  const upMin = CONFIG.WINDUP_UP_MIN || 0.08;
  const upMax = CONFIG.WINDUP_UP_MAX || 0.12;
  const dnMin = CONFIG.STRIKE_DOWN_MIN || 0.07;
  const dnMax = CONFIG.STRIKE_DOWN_MAX || 0.10;
  const up = upMin + (upMax - upMin) * u;
  const down = dnMin + (dnMax - dnMin) * u;
  const leadMax = (CONFIG.WINDUP_LEAD_MAX || 0.33) - 0.012; // 留约 1 帧给 EARLY 严格不等式
  const hold = Math.min(0.04 * u, CONFIG.WINDUP_HOLD_MAX || 0.10, Math.max(0, leadMax - up - down));
  return { up, hold, down, lead: up + hold + down, u };
}

/** 间隔 → 0（≤16 分）.. 1（≥8 分）。和 densityScale 同一条分界，连续。 */
function strikeSparseU(dt) {
  if (!isFinite(dt) || dt >= CONFIG.LIFT_DT_FULL) return 1;
  if (dt <= CONFIG.LIFT_DT_16) return 0;
  const u = (dt - CONFIG.LIFT_DT_16) / (CONFIG.LIFT_DT_FULL - CONFIG.LIFT_DT_16);
  return smooth(clamp01(u));
}

/** 稀疏/密集目标时值。上抬/下砸走固定起手窗，回弹仍按密度两端插值。 */
function strikeTimes(dt) {
  const wu = windupTimes(dt);
  return {
    upflick: wu.up,
    hold: wu.hold,
    down: wu.down,
    hit: CONFIG.STRIKE_HIT_DENSE + (CONFIG.STRIKE_HIT - CONFIG.STRIKE_HIT_DENSE) * wu.u,
    rebound: CONFIG.STRIKE_REBOUND_DENSE + (CONFIG.STRIKE_REBOUND - CONFIG.STRIKE_REBOUND_DENSE) * wu.u,
    u: wu.u,
  };
}

/**
 * 把目标时值塞进两击间隔：够宽就击中后回预备，在固定起手窗之前停稳，再抬再砸；
 * 不够就丢掉预备，直接两落点之间起落。不把上抬拉长去填满空隙（那会 EARLY / 蓄力太久）。
 */
function strikeFit(gap, opts) {
  const prev = (opts && isFinite(opts.prevGap)) ? opts.prevGap : gap;
  const tm = strikeTimes(prev);
  const face = opts && opts.fromFace;
  const toFace = ((opts && opts.toFace) || face) === "ka" ? "ka" : "don";
  const hand = (opts && opts.hand) || "R";
  const heightB = (opts && isFinite(opts.height)) ? opts.height : (CONFIG.LIFT_PX_LONG || 160);
  const needReb = reboundMinDur(hand, face, toFace);
  // 必须在 REST 窗（上一击后 0.35s）之前停稳
  const rebound = Math.min(0.25, Math.max(tm.rebound, needReb));
  const hold = tm.hold || 0;
  if (!isFinite(gap) || gap > 4) return Object.assign({}, tm, { rebound, hold, idleMid: true });
  const rest = gap - tm.hit;
  if (rest <= 1e-6) {
    const hit = Math.min(tm.hit, gap * 0.25);
    return { hit: hit, rebound: 0, upflick: 0, hold: 0, down: Math.max(1e-4, gap - hit), u: tm.u, idleMid: false };
  }
  const lead = tm.upflick + hold + tm.down;
  if (rest >= rebound + lead) {
    return { hit: tm.hit, rebound, upflick: tm.upflick, hold, down: tm.down, u: tm.u, idleMid: true };
  }
  // 时间不够走完整预备路径：不回预备，直接两落点之间起落。
  if (rest >= tm.down + tm.upflick) {
    return {
      hit: tm.hit, rebound: 0, upflick: tm.upflick,
      hold: Math.min(hold, rest - tm.down - tm.upflick),
      down: tm.down, u: tm.u, idleMid: false,
    };
  }
  if (rest >= tm.down) {
    return { hit: tm.hit, rebound: 0, upflick: Math.max(0, rest - tm.down), hold: 0, down: tm.down, u: tm.u, idleMid: false };
  }
  return { hit: tm.hit, rebound: 0, upflick: 0, hold: 0, down: Math.max(1e-4, rest), u: tm.u, idleMid: false };
}

/** 按棒尖路程把时长拉到单帧 ≤27px，但仍夹在 lo..hi 里。 */
function travelDur(dist, preferred, lo, hi) {
  const step = Math.max(1, ((CONFIG.REBOUND_MAX_STEP_PX || 30) - 2.8) * 60);
  const need = (isFinite(dist) ? Math.max(0, dist) : 0) * 1.15 / step;
  const pref = isFinite(preferred) ? preferred : lo;
  return Math.max(lo, Math.min(hi, Math.max(pref, need)));
}

/** 下砸用 5–6 帧高速砸下：最后 3 帧放宽到 45px 档、更早帧 ≤30px，不再把 188px 拉慢到 8–9 帧。 */
function downTravelDur(dist, preferred, lo, hi) {
  const d = isFinite(dist) ? Math.max(0, dist) : 0;
  // 6 帧内 C1 下砸曲线可稳定消化 ~210px（前半 ≤28.7px，后 3 帧 ≤42px）；仅超大跨面再放宽
  const need = d > 210 ? (3 / 60 + (d - 126) / (28 * 60)) : (d > 140 ? 6 / 60 : d / (40 * 60));
  const pref = isFinite(preferred) ? preferred : lo;
  return Math.max(lo, Math.min(hi, Math.max(pref, need)));
}

function windupLeadClamp(tb, down, hold, up, notBefore) {
  const leadMax = (CONFIG.WINDUP_LEAD_MAX || 0.33) - 0.012;
  const tDown = tb - down;
  let holdDur = Math.max(0, hold || 0);
  let upDur = Math.max(0, up || 0);
  let tUpStart = tDown - holdDur - upDur;
  const earliest = Math.max(notBefore || -Infinity, tb - leadMax);
  if (tUpStart < earliest) {
    const overflow = earliest - tUpStart;
    holdDur = Math.max(0, holdDur - overflow);
    tUpStart = tDown - holdDur - upDur;
    if (tUpStart < earliest) {
      holdDur = 0;
      upDur = Math.max(CONFIG.WINDUP_UP_MIN || 0.08, tDown - earliest);
      tUpStart = tDown - upDur;
      if (tUpStart < earliest) tUpStart = earliest;
    }
  }
  if (tUpStart < (notBefore || -Infinity)) tUpStart = notBefore;
  const tHoldStart = Math.max(tUpStart, tDown - holdDur);
  return { tDown, tHoldStart, tUpStart, upDur: Math.max(1e-6, tHoldStart - tUpStart), holdDur: Math.max(0, tDown - tHoldStart) };
}

/** 单击接近落点：长休止停鼓心倒V（下一击是咔则休止结束后横移到咔预备位）→ 固定窗口抬到顶（可短停）→ 加速下砸。 */
function singleApproach(t, b, hand) {
  const h = hand || "R";
  const face = b.face === "ka" ? "ka" : "don";
  const tm = strikeTimes(prevGapOf(b));
  const height = liftHeightPx(b);
  const plan = restParkPlan(h, -Infinity, b.t, face);
  const distUp = tipDistIdleToRaised(h, face, height);
  const distDown = tipDistContactToRaised(h, face, height);
  const up = travelDur(distUp, tm.upflick, CONFIG.WINDUP_UP_MIN || 0.10, 0.22);
  const down = downTravelDur(distDown, tm.down, CONFIG.STRIKE_DOWN_MIN || 5 / 60, 0.14);
  const w = windupLeadClamp(b.t, down, tm.hold || 0, up, plan.tReady);
  const idleHit = { idleFace: face, idleFaceFrom: face, idleBlend: 1 };
  if (t >= b.t) return Object.assign({ lift: 0, idle: 0 }, idleHit);
  if (t >= w.tDown) {
    const s = (t - w.tDown) / Math.max(1e-6, down);
    return Object.assign({ lift: 1 - easeInDown(s, distDown, down), idle: 0 }, idleHit);
  }
  if (t >= w.tHoldStart) return Object.assign({ lift: 1, idle: 0 }, idleHit);
  if (t >= w.tUpStart) {
    const s = (t - w.tUpStart) / w.upDur;
    return Object.assign({ lift: 1, idle: 1 - travelEase(s, distUp, w.upDur) }, idleHit);
  }
  return withParkIdle({ lift: 0, idle: 1 }, plan, t);
}

/** 单击打完：落点上留出发光的击中帧，立刻像皮球弹回预备高度（回弹≈下砸速度）。 */
function singleDepart(t, a, hand) {
  const h = hand || "R";
  const face = a.face === "ka" ? "ka" : "don";
  const tm = strikeTimes(prevGapOf(a));
  const reb = Math.min(0.25, Math.max(tm.rebound, reboundMinDur(h, face)));
  if (t - a.t < tm.hit) return { lift: 0, idle: 0 };
  const s = clamp01((t - a.t - tm.hit) / Math.max(1e-6, reb));
  const dist = tipDistContactToIdle(h, face);
  return { lift: 0, idle: travelEase(s, dist, reb) };
}

/** 两下单击之间：够宽就弹回倒V，在固定起手窗之前停稳再打下一击；更密就在两落点之间起落，不回预备。 */
function singleBetween(t, a, b, scale, hand) {
  const h = hand || "R";
  const gap = b.t - a.t;
  const faceA = a.face === "ka" ? "ka" : "don";
  const faceB = b.face === "ka" ? "ka" : "don";
  const heightB = isFinite(scale) ? scale : liftHeightPx(b);
  const tm0 = strikeFit(gap, { fromFace: a.face, toFace: b.face, hand: h, height: heightB, prevGap: prevGapOf(b) });
  const ta = a.t, tb = b.t;
  const zero = { x: 0, y: 0 };
  const plan = restParkPlan(h, ta, tb, faceB);
  let tm = tm0;
  if (tm.idleMid && plan.park) {
    const needReb = reboundMinDur(h, faceA, "don");
    tm = Object.assign({}, tm, { rebound: Math.min(0.25, Math.max(tm.rebound, needReb)) });
  }
  if (t < ta + tm.hit) return withParkIdle({ lift: 0, idle: 0, base: a.target, drift: zero }, plan, t);

  if (tm.idleMid) {
    const rebFace = plan.park ? "don" : faceB;
    const tRebEnd = ta + tm.hit + tm.rebound;
    const distUp = tipDistIdleToRaised(h, faceB, heightB);
    const distDown = tipDistContactToRaised(h, faceB, heightB);
    const up = travelDur(distUp, tm.upflick, CONFIG.WINDUP_UP_MIN || 0.10, 0.22);
    const down = downTravelDur(distDown, tm.down, CONFIG.STRIKE_DOWN_MIN || 5 / 60, 0.14);
    const w = windupLeadClamp(tb, down, tm.hold || 0, up, Math.max(tRebEnd, plan.tReady));
    const idleHit = { idleFace: faceB, idleFaceFrom: faceB, idleBlend: 1 };
    if (t < tRebEnd) {
      const dur = Math.max(1e-6, tm.rebound);
      const s = (t - ta - tm.hit) / dur;
      const dist = tipDistContactToIdle(h, faceA, rebFace);
      return withParkIdle({ lift: 0, idle: travelEase(s, dist, dur), base: a.target, drift: zero }, plan, t);
    }
    if (t < w.tUpStart) {
      return withParkIdle({ lift: 0, idle: 1, base: a.target, drift: zero }, plan, t);
    }
    if (t < w.tHoldStart) {
      const s = (t - w.tUpStart) / w.upDur;
      return Object.assign({ lift: 1, idle: 1 - travelEase(s, distUp, w.upDur), base: b.target, drift: zero }, idleHit);
    }
    if (t < w.tDown) {
      return Object.assign({ lift: 1, idle: 0, base: b.target, drift: zero }, idleHit);
    }
    const s = (t - w.tDown) / Math.max(1e-6, down);
    return Object.assign({ lift: 1 - easeInDown(s, distDown, down), idle: 0, base: b.target, drift: zero }, idleHit);
  }

  const mid = V.lerp(a.target, b.target, smooth(clamp01((t - ta) / gap)));
  const dist = tipDistContacts(h, faceA, faceB);
  const distRise = tipDistContactToRaised(h, faceB, heightB) + (faceA === faceB ? 0 : dist);
  const tHitEnd = ta + tm.hit;
  const up2 = travelDur(distRise, tm.upflick, CONFIG.WINDUP_UP_MIN || 0.10, 0.22);
  const down2 = downTravelDur(distRise, tm.down, CONFIG.STRIKE_DOWN_MIN || 5 / 60, 0.14);
  const w = windupLeadClamp(tb, down2, tm.hold || 0, up2, tHitEnd);
  if (t < w.tUpStart) {
    return { lift: 0, idle: 0, base: mid, drift: zero };
  }
  if (t < w.tHoldStart) {
    const dur = Math.max(1e-6, w.upDur);
    const s = clamp01((t - w.tUpStart) / dur);
    return { lift: travelEase(s, distRise, dur), idle: 0, base: mid, drift: zero };
  }
  if (t < w.tDown) {
    return { lift: 1, idle: 0, base: mid, drift: zero };
  }
  const s = (t - w.tDown) / Math.max(1e-6, down2);
  return { lift: 1 - easeInDown(s, tipDistContactToRaised(h, faceB, heightB) + (faceA === faceB ? 0 : dist * 0.15), down2), idle: 0, base: mid, drift: zero };
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


/** 按时长预算滚奏大抬回高度：上升帧 ≤27.5px、下砸前段 ≤27.5、最后 3 帧 ≤42，避免 JUMP。 */
function rollLiftBudget(riseDur, downDur) {
  const riseFrames = Math.max(0, (riseDur || 0) * 60);
  const downFrames = Math.max(0, (downDur || 0) * 60);
  const riseMax = riseFrames * 22.0;
  const downMax = downFrames <= 3 ? 40 * downFrames : 22.0 * (downFrames - 3) + 40 * 3;
  return Math.max(0, Math.min(CONFIG.ROLL_LIFT_PX, riseMax, downMax));
}

/** 由 rollPhase 返回值合成棒尖（不计残影/回顿），用来量真实路程。 */
function rollPhaseTip(hand, ph, bend) {
  if (!ph) return { x: 0, y: 0 };
  const rollState = ph.grip === "roll"
    ? { lift: ph.lift || 0, idle: ph.idle || 0, press: ph.press || 0, idleShift: ph.idleShift || 0, idleFace: ph.idleFace || "don" }
    : null;
  const face = ph.face || (ph.base ? targetFace(hand, ph.base) : "don");
  const singleState = ph.grip === "single"
    ? {
        idle: ph.idle || 0,
        face,
        faceFrom: ph.faceFrom || face,
        faceTo: ph.faceTo || face,
        faceU: isFinite(+ph.faceU) ? +ph.faceU : 1,
        scale: isFinite(+ph.scale) ? +ph.scale : 1,
        idleShift: ph.idleShift || 0,
        idleFace: ph.idleFace || "don",
      }
    : null;
  const pose = composePose(hand, ph.base, ph.lift || 0, bend || { x: 0, y: 0 }, 0, ph.grip, 1, rollState, singleState);
  return pose.tip;
}

function rollPhaseDist(hand, a, b, bendA, bendB) {
  return V.len(V.sub(rollPhaseTip(hand, a, bendA), rollPhaseTip(hand, b, bendB)));
}

function rollIdleShift(hand, t) {
  return kaIdleShift ? kaIdleShift(hand, t) : 0;
}

/** 从倒 V 预备抬到滚奏顶点再下砸。抬手紧挨击打，总提前量夹在 EARLY 阈值内。 */
function rollWindupPlan(hand, tHit, notBefore, target) {
  const idlePh = { lift: 0, idle: 1, press: 0, grip: "roll", base: target, idleFace: "don" };
  const peakPh = { lift: 1, idle: 0, press: 0, grip: "roll", base: target };
  const hitPh = { lift: 0, idle: 0, press: 0, grip: "roll", base: target };
  const distUp = rollPhaseDist(hand, idlePh, peakPh);
  const distDown = rollPhaseDist(hand, peakPh, hitPh);
  const up = travelDur(distUp, 0.10, CONFIG.WINDUP_UP_MIN || 0.08, 0.22);
  const down = downTravelDur(distDown, 6 / 60, CONFIG.STRIKE_DOWN_MIN || 5 / 60, 0.12);
  const w = windupLeadClamp(tHit, down, 0, up, notBefore);
  return { w, down, distUp, distDown };
}

function rollApproachFromIdle(hand, t, tHit, notBefore, target, idleShift, idleFace) {
  const plan = rollWindupPlan(hand, tHit, notBefore, target);
  const { w, down, distUp, distDown } = plan;
  const face = idleFace || "don";
  const shift = idleShift || 0;
  if (t >= tHit) return { lift: 0, idle: 0, press: 0, grip: "roll", base: target, buzz: null, idleShift: 0, idleFace: face };
  if (t >= w.tDown) {
    const s = (t - w.tDown) / Math.max(1e-6, down);
    return { lift: 1 - easeInDown(s, distDown, down), idle: 0, press: 0, grip: "roll", base: target, buzz: null, idleShift: 0, idleFace: face };
  }
  if (t >= w.tHoldStart) return { lift: 1, idle: 0, press: 0, grip: "roll", base: target, buzz: null, idleShift: 0, idleFace: face };
  if (t >= w.tUpStart) {
    const s = (t - w.tUpStart) / Math.max(1e-6, w.upDur);
    const u = travelEase(s, distUp, w.upDur);
    // lift 先到 1，再淡出 idle：姿势沿倒 V→顶点直线走，避免 lift 与 idle 对冲导致末端加速。
    return { lift: 1, idle: 1 - u, press: 0, grip: "roll", base: target, buzz: null, idleShift: shift, idleFace: face };
  }
  return { lift: 0, idle: 1, press: 0, grip: "roll", base: target, buzz: null, idleShift: shift, idleFace: face };
}

function rollSettleToIdle(hand, t, a, idleShift) {
  const press0 = a.idxInStroke === 1 ? 1 : 0;
  const startPh = { lift: 0, idle: 0, press: press0, grip: "roll", base: a.target };
  const idlePh = { lift: 0, idle: 1, press: 0, grip: "roll", base: a.target, idleShift: idleShift || 0, idleFace: "don" };
  const dist = rollPhaseDist(hand, startPh, idlePh);
  const reb = travelDur(dist, 0.12, 0.08, 0.25);
  const s = clamp01((t - a.t) / Math.max(1e-6, reb));
  const u = travelEase(s, dist, reb);
  return {
    lift: 0, idle: u, press: press0 * (1 - u), grip: "roll", base: a.target, buzz: null,
    idleShift: idleShift || 0, idleFace: "don", reb, dist,
  };
}

function pickDenseRollPeak(aT, bT, preferred) {
  const gap = Math.max(1e-6, bT - aT);
  const minUp = 3 / 60, minDown = 3 / 60;
  let peakT = bT - Math.min(CONFIG.ROLL_DOWN_MAX || 0.075, Math.max(5 / 60, gap * 0.45));
  peakT = Math.min(bT - minDown, Math.max(aT + minUp, peakT));
  if (isFinite(preferred) && preferred > aT + minUp && preferred < bT - minDown) {
    const hPref = rollLiftBudget(preferred - aT, bT - preferred);
    const hDef = rollLiftBudget(peakT - aT, bT - peakT);
    if (hPref >= hDef * 0.82) peakT = preferred;
  }
  const rise = Math.max(1e-6, peakT - aT);
  const down = Math.max(1e-6, bT - peakT);
  const height = rollLiftBudget(rise, down);
  return { peakT, peakLift: height / Math.max(1e-6, CONFIG.ROLL_LIFT_PX), rise, down, height };
}


/** 滚奏相位：一对内部「下→小弹→再下(补压)」，两对之间「大抬回→最高点→加速往下砸」。
 *  长间隔先回倒 V 停稳，抬手紧挨下一击（不提前半秒慢抬）；短间隔按路程限速，禁止相邻帧瞬移。 */
function rollPhase(hand, track, a, b, t) {
  const idleShift = rollIdleShift(hand, t);

  if (!a && isRollContact(b)) {
    return rollApproachFromIdle(hand, t, b.t, -Infinity, b.target, idleShift, "don");
  }

  if (a && !b && isRollContact(a)) {
    return rollSettleToIdle(hand, t, a, idleShift);
  }

  if (a.stroke === b.stroke && isRollContact(a) && isRollContact(b)) {
    // 成对内部 (RR)/(LL)：下(a) → 立刻小弹 → 加速再下(b, 补压)。弹起高度按帧预算封顶。
    const pairDt = Math.max(1e-6, b.t - a.t);
    const u = clamp01((t - a.t) / pairDt);
    const uPeak = CONFIG.ROLL_BOUNCE_PEAK_U;
    const upDur = Math.max(1e-6, pairDt * uPeak);
    const downDur = Math.max(1e-6, pairDt * (1 - uPeak));
    const bouncePx = Math.min(
      CONFIG.ROLL_BOUNCE_RATIO * CONFIG.ROLL_LIFT_PX,
      upDur * 60 * 18,
      downDur * 60 * 28
    );
    const bounceLift = bouncePx / Math.max(1e-6, CONFIG.ROLL_LIFT_PX);
    const landDist = V.len(V.sub(a.target, b.target));
    const frames = Math.max(1, pairDt * 60);
    // 最后约 1 帧是第二下击中（JUMP 豁免），把落点剩余路程留到那一帧，避免中间帧 don↔ka 一次甩出 50px+
    const moveFrames = Math.max(1, frames - 0.85);
    const maxLand = Math.min(landDist, 22 * moveFrames);
    const landScale = landDist < 1e-6 ? 1 : Math.min(1, maxLand / landDist);
    const snapAt = Math.max(0.15, 1 - 0.85 / frames);
    let landU;
    if (u < snapAt) landU = landScale * flattenMid(u / Math.max(1e-6, snapAt), 0.7);
    else landU = landScale + (1 - landScale) * clamp01((u - snapAt) / Math.max(1e-6, 1 - snapAt));
    const base = V.lerp(a.target, b.target, landU);
    let lift, press;
    if (u <= uPeak) {
      const s = clamp01(u / uPeak);
      lift = bounceLift * travelEase(s, bouncePx, upDur);
      press = 0;
    } else {
      const s = (u - uPeak) / (1 - uPeak);
      lift = bounceLift * (1 - easeInDown(s, bouncePx, downDur));
      press = easeInDown(s, bouncePx, downDur);
    }
    return { lift, idle: 0, press, grip: "roll", base, buzz: a };
  }

  if (isRollContact(a) && isRollContact(b)) {
    // 两对之间
    const gap = b.t - a.t;
    const press0 = a.idxInStroke === 1 ? 1 : 0;
    const startPh = { lift: 0, idle: 0, press: press0, grip: "roll", base: a.target };
    const idlePh = { lift: 0, idle: 1, press: 0, grip: "roll", base: a.target, idleShift, idleFace: "don" };
    const rebDist = rollPhaseDist(hand, startPh, idlePh);
    const reb = travelDur(rebDist, 0.12, 0.08, 0.25);
    const plan = rollWindupPlan(hand, b.t, a.t + reb, b.target);
    const tUp = plan.w.tUpStart;
    if (gap >= reb + (b.t - tUp) + 1e-4) {
      // 够宽：弹回倒 V，在起手窗之前停稳，再按正常节奏抬砸（修 EARLY / REST / HOVER）
      if (t < a.t + reb) {
        const s = clamp01((t - a.t) / Math.max(1e-6, reb));
        const u = travelEase(s, rebDist, reb);
        return { lift: 0, idle: u, press: press0 * (1 - u), grip: "roll", base: a.target, buzz: null, idleShift, idleFace: "don" };
      }
      return rollApproachFromIdle(hand, t, b.t, a.t + reb, b.target, idleShift, "don");
    }
    // 密段：连续大抬回，高度按路程预算；用 travelEase / easeInDown，不用会冲出去的 easeOutQuad
    const preferred = otherHandRollPeak(hand, a.t, b.t, Math.min(CONFIG.ROLL_DOWN_MAX, gap / 3));
    const pk = pickDenseRollPeak(a.t, b.t, preferred);
    const landDist2 = V.len(V.sub(a.target, b.target));
    const gapFrames = Math.max(1, gap * 60);
    const landScale2 = landDist2 < 1e-6 ? 1 : Math.min(1, (22 * Math.max(1, gapFrames - 0.85)) / landDist2);
    const snapAt2 = Math.max(0.15, 1 - 0.85 / gapFrames);
    const ug = clamp01((t - a.t) / Math.max(1e-6, gap));
    const landU2 = ug < snapAt2
      ? landScale2 * flattenMid(ug / Math.max(1e-6, snapAt2), 0.7)
      : landScale2 + (1 - landScale2) * clamp01((ug - snapAt2) / Math.max(1e-6, 1 - snapAt2));
    const base = V.lerp(a.target, b.target, landU2);
    const pressDur = Math.min(2 / 60, pk.rise * 0.35);
    const press = press0 * (1 - clamp01((t - a.t) / Math.max(1e-6, pressDur)));
    const peakPh = { lift: pk.peakLift, idle: 0, press: 0, grip: "roll", base: b.target };
    const hitA = { lift: 0, idle: 0, press: press0, grip: "roll", base: a.target };
    const hitB = { lift: 0, idle: 0, press: 0, grip: "roll", base: b.target };
    if (t <= pk.peakT) {
      const dist = Math.max(pk.height, rollPhaseDist(hand, hitA, peakPh));
      const s = clamp01((t - a.t) / pk.rise);
      const u = travelEase(s, dist, pk.rise);
      return { lift: pk.peakLift * u, idle: 0, press, grip: "roll", base, buzz: null };
    }
    const distDown = Math.max(pk.height, rollPhaseDist(hand, peakPh, hitB));
    const s = clamp01((t - pk.peakT) / pk.down);
    return { lift: pk.peakLift * (1 - easeInDown(s, distDown, pk.down)), idle: 0, press: 0, grip: "roll", base, buzz: null };
  }

  // 滚奏 ↔ 单击交接：必须从上一击的接触姿势出发（不能一帧跳到 lift=1），高度连续，长间隔停稳再抬。
  const gap = b.t - a.t;

  if (isRollContact(b) && !isRollContact(a)) {
    const faceA = a.face === "ka" ? "ka" : "don";
    const tm = strikeTimes(prevGapOf(a));
    const tHitEnd = a.t + (tm.hit || 0);
    const rebDist = tipDistContactToIdle(hand, faceA, "don");
    const reb = Math.max(travelDur(rebDist, Math.max(tm.rebound, reboundMinDur(hand, faceA)), 0.08, 0.25), 1e-6);
    const tIdle = tHitEnd + reb;
    const plan = rollWindupPlan(hand, b.t, tIdle, b.target);
    const startSingle = { lift: 0, idle: 0, press: 0, grip: "single", base: a.target, face: faceA, scale: 1, idleShift, idleFace: "don" };
    if (t < tHitEnd) {
      return { lift: 0, idle: 0, press: 0, grip: "single", base: a.target, face: faceA, scale: 1, buzz: null, idleShift, idleFace: "don" };
    }
    if (gap >= (tIdle - a.t) + (b.t - plan.w.tUpStart) + 1e-4) {
      if (t < tIdle) {
        const s = clamp01((t - tHitEnd) / reb);
        return { lift: 0, idle: travelEase(s, rebDist, reb), press: 0, grip: "single", base: a.target, face: faceA, scale: 1, idleFace: "don", idleShift, buzz: null };
      }
      const ph = rollApproachFromIdle(hand, t, b.t, tIdle, b.target, idleShift, "don");
      if (ph.idle >= 1 - 1e-6) {
        // 倒 V 上换握：single idle 与 roll idle 同姿势，不瞬切
        return { lift: 0, idle: 1, press: 0, grip: "single", base: a.target, face: faceA, scale: 1, idleFace: "don", idleShift, buzz: null };
      }
      return ph;
    }
    // 短间隔：从单击接触 morph 到滚奏顶点，再砸向滚奏落点
    const pk = pickDenseRollPeak(tHitEnd, b.t, b.t - Math.min(CONFIG.ROLL_DOWN_MAX, gap * 0.45));
    const peakPh = { lift: pk.peakLift, idle: 0, press: 0, grip: "roll", base: b.target };
    const hitPh = { lift: 0, idle: 0, press: 0, grip: "roll", base: b.target };
    const distUp = Math.max(pk.height, rollPhaseDist(hand, startSingle, peakPh));
    if (t <= pk.peakT) {
      const s = clamp01((t - tHitEnd) / pk.rise);
      const u = travelEase(s, distUp, pk.rise);
      return {
        lift: pk.peakLift, idle: 0, press: 0, grip: "roll", base: b.target, buzz: null,
        morphFrom: startSingle, morphU: u,
      };
    }
    const distDown = Math.max(pk.height, rollPhaseDist(hand, peakPh, hitPh));
    const s = clamp01((t - pk.peakT) / pk.down);
    return { lift: pk.peakLift * (1 - easeInDown(s, distDown, pk.down)), idle: 0, press: 0, grip: "roll", base: b.target, buzz: null };
  }

  if (isRollContact(a) && !isRollContact(b)) {
    const faceB = b.face === "ka" ? "ka" : "don";
    const height = liftHeightPx(b);
    const press0 = a.idxInStroke === 1 ? 1 : 0;
    const startRoll = { lift: 0, idle: 0, press: press0, grip: "roll", base: a.target };
    const settle = rollSettleToIdle(hand, t, a, idleShift);
    const tIdle = a.t + settle.reb;
    // 长休止先停鼓心倒V；下一击是咔时，休息窗结束后再横移到咔预备，不把换面提前到空档中间。
    const plan = restParkPlan(hand, a.t, b.t, faceB);
    const distUp = tipDistIdleToRaised(hand, faceB, height);
    const distDown = tipDistContactToRaised(hand, faceB, height);
    const tm = strikeTimes(prevGapOf(b));
    const up = travelDur(distUp, tm.upflick, CONFIG.WINDUP_UP_MIN || 0.08, 0.22);
    const down = downTravelDur(distDown, tm.down, CONFIG.STRIKE_DOWN_MIN || 5 / 60, 0.14);
    const notBefore = plan.park ? Math.max(tIdle, plan.tReady) : tIdle;
    const w = windupLeadClamp(b.t, down, tm.hold || 0, up, notBefore);
    if (gap >= (tIdle - a.t) + (b.t - w.tUpStart) + 1e-4) {
      if (t < tIdle) return settle;
      if (t < w.tUpStart) {
        if (plan.park) {
          const st = parkIdleState(plan, t);
          return {
            lift: 0, idle: 1, press: 0, grip: "single", base: b.target, face: st.idleFace,
            scale: height, idleFace: st.idleFace, idleFaceFrom: st.idleFaceFrom, idleBlend: st.idleBlend,
            idleShift, buzz: null,
          };
        }
        return { lift: 0, idle: 1, press: 0, grip: "single", base: b.target, face: faceB, scale: height, idleFace: faceB, idleShift, buzz: null };
      }
      if (t < w.tHoldStart) {
        const s = (t - w.tUpStart) / Math.max(1e-6, w.upDur);
        return { lift: travelEase(s, distUp, w.upDur), idle: 1 - travelEase(s, distUp, w.upDur), press: 0, grip: "single", base: b.target, face: faceB, scale: height, idleFace: faceB, idleShift, buzz: null };
      }
      if (t < w.tDown) {
        return { lift: 1, idle: 0, press: 0, grip: "single", base: b.target, face: faceB, scale: height, idleFace: faceB, buzz: null };
      }
      const s = (t - w.tDown) / Math.max(1e-6, down);
      return { lift: 1 - easeInDown(s, distDown, down), idle: 0, press: 0, grip: "single", base: b.target, face: faceB, scale: height, buzz: null };
    }
    // 短间隔：从滚奏接触 morph 到单击顶点，再砸向单击落点
    const tHitEnd = a.t;
    const pk = pickDenseRollPeak(tHitEnd, b.t, b.t - Math.min(CONFIG.STRIKE_DOWN_MAX || 0.10, gap * 0.45));
    const peakSingle = { lift: 1, idle: 0, press: 0, grip: "single", base: b.target, face: faceB, scale: height };
    const distRise = Math.max(height, rollPhaseDist(hand, startRoll, peakSingle));
    const rise = Math.max(1e-6, pk.rise);
    const down2 = Math.max(1e-6, pk.down);
    const peakT = b.t - down2;
    if (t <= peakT) {
      const s = clamp01((t - tHitEnd) / rise);
      const u = travelEase(s, distRise, rise);
      return {
        lift: 1, idle: 0, press: 0, grip: "single", base: b.target, face: faceB, scale: height, buzz: null,
        morphFrom: startRoll, morphU: u,
      };
    }
    const s = clamp01((t - peakT) / down2);
    return { lift: 1 - easeInDown(s, distRise, down2), idle: 0, press: 0, grip: "single", base: b.target, face: faceB, scale: height, buzz: null };
  }

  const down = Math.min(CONFIG.STRIKE_DOWN_MAX, gap * 0.45);
  const peakT = b.t - down;
  const base = V.lerp(a.target, b.target, flattenMid(clamp01((t - a.t) / Math.max(1e-6, gap)), 0.85));
  const height = densityScale(gap);
  const lift = t <= peakT
    ? travelEase(clamp01((t - a.t) / Math.max(1e-6, peakT - a.t)), CONFIG.ROLL_LIFT_PX, Math.max(1e-6, peakT - a.t))
    : 1 - easeInDown(clamp01((t - peakT) / Math.max(1e-6, down)), CONFIG.ROLL_LIFT_PX, down);
  const press = (isRollContact(a) && a.idxInStroke === 1) ? (1 - clamp01((t - a.t) / Math.max(1e-6, 2 / 60))) : 0;
  return { lift, idle: 0, press, grip: isRollContact(a) || isRollContact(b) ? "roll" : "single", base, scale: height, buzz: null };
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
  const shift0 = V.add(
    V.mul(dir, -CONFIG.HIT_KICK_BACK_PX * amp * k),
    { x: 0, y: -CONFIG.HIT_KICK_LIFT_PX * amp * k }
  );
  // 回顿叠在已经起步的回弹上时，限制位移，避免第一帧合计超过 30px。
  const cap = 3.2;
  const slen = V.len(shift0);
  const shift = slen > cap ? V.mul(shift0, cap / slen) : shift0;
  const snapped = weldSnap(V.add(pose.tip, shift), V.add(pose.grip, shift), L);
  return { tip: snapped.tip, grip: snapped.grip, gripType: pose.gripType, handDeg: snapped.deg, stickDeg: snapped.deg, lift: pose.lift };
}

function tmIdleFace(a, b, height, hand) {
  if (!a || !b) return "don";
  const faceB = b.face === "ka" ? "ka" : "don";
  const tm = strikeFit(b.t - a.t, { fromFace: a.face, toFace: b.face, hand, height, prevGap: prevGapOf(b) });
  return tm.idleMid ? faceB : "don";
}


/** 滚奏段安全阀：把相邻 1/60 秒的棒尖步长卡在 JUMP 限额内。击中帧不限制，保证落点焊死。 */
const poseStepCache = new Map();
function clearPoseStepCache() { poseStepCache.clear(); }
function poseStepKey(hand, t) { return hand + ":" + Math.round(t * 6000); }

function capTipToward(prev, pose, cap) {
  const d = V.len(V.sub(pose.tip, prev.tip));
  if (d <= cap || d < 1e-6) return pose;
  const mixed = lerpPose(prev, pose, cap / d);
  return Object.assign({}, pose, { tip: mixed.tip, grip: mixed.grip, handDeg: mixed.deg, stickDeg: mixed.deg });
}

/** 滚奏段安全阀：相对「已经限速过的」上一帧卡在 JUMP 限额内。击中帧不限制，保证落点焊死。 */
function limitRollTipStep(hand, track, t, pose, a, b) {
  const dt = 1 / 60;
  const hits = [];
  if (a) hits.push(a.t);
  if (b) hits.push(b.t);
  if (hits.some((ht) => Math.abs(t - ht) <= dt * 1.01)) return pose;
  const nxt = b ? b.t : 99;
  const down = (nxt - t) <= 3 * dt * 1.01;
  const cap = down ? 42.0 : 28.2;
  const prevT = t - dt;
  const prevKey = poseStepKey(hand, prevT);
  let prev;
  if (poseStepCache.has(prevKey)) {
    prev = poseStepCache.get(prevKey);
  } else {
    // 从上一击（或 0.25s 前）正向填缓存，避免按帧递归爆栈
    const seedT = a && isFinite(a.t) && a.t < t ? a.t : (t - 0.25);
    let u0 = seedT;
    let cur = poseAt(hand, track, u0, { noKick: true, noLimit: true, noWobble: true });
    poseStepCache.set(poseStepKey(hand, u0), cur);
    const steps = Math.max(1, Math.round((prevT - u0) / dt));
    for (let i = 1; i <= steps; i++) {
      const ut = u0 + i * dt;
      const uk = poseStepKey(hand, ut);
      if (poseStepCache.has(uk)) { cur = poseStepCache.get(uk); continue; }
      let nxtP = poseAt(hand, track, ut, { noKick: false, noLimit: true, noWobble: true });
      const hitNow = (a && Math.abs(ut - a.t) <= dt * 1.01) || (b && Math.abs(ut - b.t) <= dt * 1.01);
      if (!hitNow) {
        const downU = b && (b.t - ut) <= 3 * dt * 1.01;
        nxtP = capTipToward(cur, nxtP, downU ? 42.0 : 28.2);
      }
      poseStepCache.set(uk, nxtP);
      cur = nxtP;
    }
    prev = cur;
  }
  if (!prev || !prev.tip) return pose;
  return capTipToward(prev, pose, cap);
}


function poseAt(hand, track, t, opts = {}) {
  const H = GEOM.hands[hand];
  const { a, b } = findSegment(track, t);
  let lift, base, bend = { x: 0, y: 0 }, grip, wobble = 0, buzz = null;
  let follow = CONFIG.SINGLE_FOLLOW;
  let rollState = null;
  let singleState = null;
  let phMorph = null;
  if (!a && !b) {
    lift = 0; base = H.don; grip = "single";
    singleState = { idle: 1, face: "don", idleFace: "don", idleShift: kaIdleShift(hand, t) };
  } else if (isRollContact(a) || isRollContact(b)) {
    const ph = rollPhase(hand, track, a, b, t);
    lift = ph.lift; base = ph.base; grip = ph.grip; buzz = ph.buzz;
    phMorph = ph;
    if (grip === "roll") {
      rollState = { lift: ph.lift, idle: ph.idle, press: ph.press, idleShift: ph.idleShift, idleFace: ph.idleFace || "don" };
      // 一对内部：kd 内收 / dk 外甩走 routeBend；dd/kk 为 straight。短间隔按帧预算缩小弯曲，避免 1 帧甩出 50px。
      if (a && b && a.stroke === b.stroke && isRollContact(a) && isRollContact(b)) {
        const pairDt = Math.max(1e-6, b.t - a.t);
        const u = clamp01((t - a.t) / pairDt);
        const route = a.route || rollTypeRoute(a.rollType);
        const frames = Math.max(1, pairDt * 60);
        const maxBend = Math.min(CONFIG.BEND_PX, 18 * frames / Math.PI);
        const k = Math.sin(Math.PI * u) * (maxBend / Math.max(1e-6, CONFIG.BEND_PX));
        bend = routeBend(a.target, b.target, route, k);
      }
    } else {
      const face = ph.face || (b ? targetFace(hand, ph.base) : "don");
      singleState = {
        idle: ph.idle, face, faceFrom: ph.faceFrom, faceTo: ph.faceTo || face,
        faceU: ph.faceU, scale: ph.scale || 1,
        idleShift: isFinite(+ph.idleShift) ? +ph.idleShift : kaIdleShift(hand, t),
        idleFace: ph.idleFace || "don",
        idleFaceFrom: ph.idleFaceFrom,
        idleBlend: ph.idleBlend,
      };
    }
  } else if (!a) {
    const phase = singleApproach(t, b, hand);
    const height = liftHeightPx(b);
    lift = phase.lift; base = b.target; grip = "single"; follow = 1;
    singleState = { idle: phase.idle, face: targetFace(hand, b.target), idleFace: phase.idleFace || "don", idleFaceFrom: phase.idleFaceFrom, idleBlend: phase.idleBlend, scale: height, idleShift: kaIdleShift(hand, t) };
  } else if (!b) {
    const phase = singleDepart(t, a, hand);
    const height = liftHeightPx(a);
    lift = phase.lift; base = a.target; grip = "single"; follow = 1;
    singleState = { idle: phase.idle, face: targetFace(hand, a.target), idleFace: "don", scale: height, idleShift: kaIdleShift(hand, t) };
  } else {
    const u = clamp01((t - a.t) / (b.t - a.t));
    const height = liftHeightPx(b);
    const phase = singleBetween(t, a, b, height, hand);
    lift = phase.lift; base = phase.base; grip = "single"; follow = 1;
    const faceA = a.face || targetFace(hand, a.target);
    const faceB = b.face || targetFace(hand, b.target);
    let faceU = 1;
    // 咚↔咔：回弹段把上一击接触姿势平滑过渡到下一击预备姿势，禁止在某一帧整目标换掉。
    if (faceA !== faceB) {
      const tm = strikeFit(b.t - a.t, { fromFace: faceA, toFace: faceB, hand, height, prevGap: prevGapOf(b) });
      if (!tm.idleMid) {
        // 密段咚↔咔换脸摊到整段间隔（含下砸）：短间隔里 120px+ 挤在抬手窗会 JUMP。
        // 够宽走 idleMid 时从倒 V 起抬，咔仍用同一张查表高度。
        const dur = Math.max(1e-6, b.t - a.t - tm.hit);
        if (t <= a.t + tm.hit) faceU = 0;
        else {
          const su = travelEase(clamp01((t - (a.t + tm.hit)) / dur), tipDistContacts(hand, faceA, faceB), dur);
          faceU = dur <= 0.16 ? flattenMid(su, 0.85) : su;
        }
      } else {
        // 间隔 ≥ 8 分走 idleMid：回弹阶段在待机高度横移到下一击的预备位，再按表抬，不把换面挤进抬手窗。
        const tRebEnd = a.t + tm.hit + tm.rebound;
        faceU = t < tRebEnd ? 0 : 1;
      }
    }
    const idleFace = phase.idleFace || tmIdleFace(a, b, height, hand);
    singleState = { idle: phase.idle, face: faceB, faceFrom: faceA, faceTo: faceB, faceU, idleFace, idleFaceFrom: phase.idleFaceFrom, idleBlend: phase.idleBlend, scale: height, idleShift: kaIdleShift(hand, t), drift: phase.drift };
    if (!phase.idle) bend = routeBend(a.target, b.target, b.route, Math.sin(Math.PI * u) * lift);
  }
  let p = composePose(hand, base, lift, bend, opts.noWobble ? 0 : wobble, grip, follow, rollState, singleState);
  const drift = singleState && singleState.drift;
  if (drift && (Math.abs(drift.x) > 1e-6 || Math.abs(drift.y) > 1e-6)) {
    const L = V.len(V.sub(p.tip, p.grip));
    const snapped = weldSnap(V.add(p.tip, drift), V.add(p.grip, drift), L);
    p = Object.assign({}, p, { tip: snapped.tip, grip: snapped.grip, handDeg: snapped.deg, stickDeg: snapped.deg });
  }
  if (phMorph && phMorph.morphFrom && isFinite(+phMorph.morphU)) {
    const mu = clamp01(+phMorph.morphU);
    const mf = phMorph.morphFrom;
    const fromGrip = mf.grip || "single";
    const fromRoll = fromGrip === "roll"
      ? { lift: mf.lift || 0, idle: mf.idle || 0, press: mf.press || 0, idleShift: mf.idleShift || 0, idleFace: mf.idleFace || "don" }
      : null;
    const fromFace = mf.face || (mf.base ? targetFace(hand, mf.base) : "don");
    const fromSingle = fromGrip === "single"
      ? { idle: mf.idle || 0, face: fromFace, scale: isFinite(+mf.scale) ? +mf.scale : 1, idleShift: mf.idleShift || 0, idleFace: mf.idleFace || "don" }
      : null;
    const fromP = composePose(hand, mf.base, mf.lift || 0, { x: 0, y: 0 }, 0, fromGrip, 1, fromRoll, fromSingle);
    const mixed = lerpPose(fromP, p, mu);
    p = Object.assign({}, p, { tip: mixed.tip, grip: mixed.grip, handDeg: mixed.deg, stickDeg: mixed.deg });
  }
  if (!opts.noKick) p = applyHitKickback(p, hand, track, t);
  if (!opts.noLimit) {
    p = limitRollTipStep(hand, track, t, p, a, b);
  }
  p.buzz = buzz; p.wobble = opts.noWobble ? 0 : wobble;
  if (!opts.noLimit) poseStepCache.set(poseStepKey(hand, t), p);
  return p;
}

/** 单击某一面（咚或咔）的接触/举起姿势。咔仍是整只手连棒往斜上外侧送，不改打法。 */
function composeSingleByFace(hand, face, lift, bend, scale) {
  // scale：新代码传抬手像素（15–188）；旧的 0–1 密度系数仍按满幅散音折算。
  const slow = CONFIG.LIFT_PX_SPARSE || CONFIG.LIFT_PX_SLOW || CONFIG.LIFT_PX || 130;
  const heightPx = isFinite(scale) ? (scale <= 1.5 ? Math.max(0, scale) * slow : scale) : slow;
  const hit = singleContactPose(hand, face);
  const L = V.len(V.sub(hit.tip, hit.grip));
  const lv = liftVec(hand, face, heightPx);
  const bnm = bend || { x: 0, y: 0 };
  const raised = weldSnap(
    V.add(V.add(hit.tip, lv), bnm),
    V.add(V.add(hit.grip, lv), bnm),
    L
  );
  const contact = weldSnap(V.add(hit.tip, bnm), V.add(hit.grip, bnm), L);
  let pose = lerpPose(contact, raised, clamp01(lift), L);
  // 咚才加手腕后倒，让「打下」读成手腕一弹；咔不加，避免把整手外移读成翻腕。
  const tiltScale = clamp01(heightPx / slow);
  if (face !== "ka") pose = applyWristTilt(pose, clamp01(lift) * tiltScale);
  return pose;
}

function composePose(hand, base, lift, bend, wobble, grip, follow, rollState, singleState) {
  const H = GEOM.hands[hand];
  if (grip === "single") {
    // 单击：完全固定。follow=1，握点在棒上的位置和握点→棒尖夹角不变，handDeg===stickDeg。
    // 咚：从落点向上举起，绕手腕后倒（上下主要靠手腕轴；近竖直的棒要抬起棒尖，手会跟着焊死的棒走一点）。
    // 咔：整只手连棒明显往斜上外侧平移，再往下砸到 1 点钟鼓边；不靠手腕外翻，平移是主力。
    const faceTo = (singleState && (singleState.faceTo || singleState.face)) || targetFace(hand, base);
    const faceFrom = (singleState && singleState.faceFrom) || faceTo;
    const faceU = singleState && isFinite(+singleState.faceU) ? clamp01(+singleState.faceU) : 1;
    const scale = singleState && isFinite(+singleState.scale) ? +singleState.scale : 1;
    const idleAmt = singleState && isFinite(+singleState.idle) ? clamp01(+singleState.idle) : 0;
    let pose;
    if (faceFrom !== faceTo && faceU < 1 - 1e-6) {
      // 从上一颗接触姿势走到下一颗的当前抬手姿势（到击中时 lift=0，正好落在下一颗接触点）。
      const fromPose = composeSingleByFace(hand, faceFrom, 0, bend, scale);
      const toPose = composeSingleByFace(hand, faceTo, lift, bend, scale);
      pose = lerpPose(fromPose, toPose, faceU);
    } else {
      pose = composeSingleByFace(hand, faceTo, lift, bend, scale);
    }
    if (idleAmt > 0) {
      const idleFace = (singleState && singleState.idleFace) || "don";
      const shift = singleState && singleState.idleShift;
      let idlePose = singleIdlePose(hand, shift, idleFace);
      const idleFrom = singleState && singleState.idleFaceFrom;
      const idleBlend = singleState && isFinite(+singleState.idleBlend) ? clamp01(+singleState.idleBlend) : 1;
      if (idleFrom && idleFrom !== idleFace && idleBlend < 1 - 1e-6) {
        idlePose = lerpPose(singleIdlePose(hand, shift, idleFrom), idlePose, idleBlend);
      }
      pose = lerpPose(pose, idlePose, idleAmt);
    }
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
  if (idleAmt > 0) {
    const sh = rollState && isFinite(+rollState.idleShift) ? +rollState.idleShift : 0;
    const idleFace = (rollState && rollState.idleFace) || "don";
    pose = lerpPose(pose, singleIdlePose(hand, sh, idleFace), idleAmt, L);
  }
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
  // 圆角卡片：纯色 #ececee，无三角格纹、无鼓后白底板；阴影画在 sceneDrum 里跟鼓一起缩放
  s += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="30" fill="${CONFIG.CARD_GREY}" stroke="${COL.outline}" stroke-width="${OUT}"/>`;
  // ---- 鼓：全部平涂色块做立体感（汐月 v2.1 §1），鼓身往下收成圆底（溯溯） ----
  // 卡片本身不缩；鼓+手整组绕鼓心缩小，棒尖允许略画出框上沿。
  const bodyD = drumBodyD(0);
  const cc = sceneCardClipRect();
  s += `<defs>
          <clipPath id="cardClip"><rect x="${c.x + 1.5}" y="${c.y + 1.5}" width="${c.w - 3}" height="${c.h - 3}" rx="29"/></clipPath>
          <clipPath id="sceneCardClip"><rect x="${f1(cc.x)}" y="${f1(cc.y)}" width="${f1(cc.w)}" height="${f1(cc.h)}" rx="${f1(cc.rx)}"/></clipPath>
          <clipPath id="sceneFaceClip"><ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}"/></clipPath>
          <filter id="swipeArrowShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0.8" dy="1.8" stdDeviation="1.8" flood-color="#3E3228" flood-opacity="0.28"/>
          </filter>
        </defs>`;
  s += `<g id="sceneDrum" transform="${sceneTransform()}">`;
  // 鼓下淡淡冷灰接触阴影（#2A2A30 / 0.11），跟鼓一起走 scene 缩放
  s += `<ellipse cx="${GEOM.face.cx}" cy="${GEOM.bodyBottom + 8}" rx="168" ry="30" fill="#2A2A30" opacity=".11" filter="url(#drumFloorShadow)"/>`;
  s += `<defs><clipPath id="bodyClip"><path d="${bodyD}"/></clipPath></defs>`;
  s += `<path d="${bodyD}" fill="${COL.bodyDark}"/>`;                       // 底部深橘暗带（整块先铺深橘）
  s += `<path d="${drumBodyD(-24)}" fill="${COL.body}" clip-path="url(#bodyClip)"/>`; // 上面盖鼓身亮橘，露出底下一条
  // 钉带：贴着鼓面下缘的一圈暖黄带 + 一排红褐鼓钉。带缘用鼓的纯黑，宽度仍是原来的细边，不是 10px 轮廓。
  const band = ellipseArcD(4, 176, 0, 40);
  s += `<g clip-path="url(#bodyClip)" transform="translate(0,24)">
          <path d="${band}" fill="none" stroke="${DRUM_OUTLINE}" stroke-width="32"/>
          <path d="${band}" fill="none" stroke="${COL.studBand}" stroke-width="25"/></g>`;
  for (let a = 18; a <= 162; a += 12) {
    const p = ellipsePt(a, 0);
    if (p.y + 24 < F.cy + 8) continue;
    s += `<circle cx="${f1(p.x)}" cy="${f1(p.y + 24)}" r="4.2" fill="${COL.stud}"/>`;
  }
  s += `<path d="${bodyD}" fill="none" stroke="${DRUM_OUTLINE}" stroke-width="${DRUM_OUT}" stroke-linejoin="round"/>`;
  // 近白鼓面 + 左上白色椭圆高光（α0.55）
  s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="${COL.face}" stroke="${DRUM_OUTLINE}" stroke-width="${DRUM_OUT}"/>`;
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
    if (e.big) {
      const BR = CONFIG.BIG_RING;
      s += `<circle cx="${f1(x)}" cy="${L.y}" r="${f1(r + BR.haloOffset)}" fill="none" stroke="#FFFFFF" stroke-width="${BR.haloWidth}" opacity="${f1(BR.haloOp * op)}" filter="url(#softGlow)"/>`;
      s += `<circle cx="${f1(x)}" cy="${L.y}" r="${f1(r + BR.offset)}" fill="none" stroke="${COL.outline}" stroke-width="${BR.width}" opacity="${op}"/>`;
    }
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
function handImgLayer(handSide, pose, gripType, opacity) {
  const I = CONFIG.HAND_IMG[handSide][gripType];
  const alignDeg = pose.stickDeg; // 无论单击还是滚奏，手棒全程焊死：handDeg === stickDeg
  const rot = alignDeg - I.axisDeg;
  const T = `translate(${f1(pose.grip.x)},${f1(pose.grip.y)}) rotate(${f1(rot)}) scale(${I.scale}) translate(${-I.pinch[0]},${-I.pinch[1]})`;
  const op = opacity < 1 - 1e-6 ? ` opacity="${f1(opacity)}"` : "";
  return `<g transform="${T}"${op}><image href="${I.href}" x="0" y="0" width="${I.w}" height="${I.h}" preserveAspectRatio="none"/></g>`;
}
function handImg(handSide, pose) {
  // 单击：手图和棒共用 stickDeg（handDeg === stickDeg），棒在手里永远是 0°。
  // 旋转中心是捏点（棒轴上的握点）；手腕在图里、捏点下方，跟着整只手一起转、一起抬。
  const blend = pose.gripBlend;
  if (blend && blend.from && blend.to && blend.from !== blend.to) {
    const u = clamp01(+blend.u);
    return handImgLayer(handSide, pose, blend.from, 1 - u) + handImgLayer(handSide, pose, blend.to, u);
  }
  return handImgLayer(handSide, pose, pose.gripType, 1);
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


/* ---------- 内外刷方向箭头（替换原 kd/dk 细白方向弧；A 版手色 + 白描边） ---------- */
const SWIPE_ARROW = {
  a0Deg: -84.1,             // 右手内刷箭尾（atan2、y 向下、0° 朝右）
  a1Deg: -174.1,            // 右手内刷箭头
  cxOff: 0.653,             // 辅圆圆心相对 F.cx 的 rx 倍数（右手 +，左手 −）
  cyOff: 0.102,             // 辅圆圆心相对 F.cy 的 ry 倍数（向上）
  rFac: 0.544,              // 正圆半径（只用 F.rx，不按鼓面椭圆压扁）
  tipExtend: 0.04,          // 外刷箭头沿切线再往外送（× F.rx）
  strokeFac: 0.0662,        // 杆宽
  outlineFac: 0.0132,       // 外描边宽
  headLenFac: 3.05,         // 头长 × strokeWidth
  headWidFac: 2.45,         // 头宽 × strokeWidth
  shaftBack: 0.64,          // 杆终点沿弧从尖往回，盖住圆头
  opacity: 0.90,
  // 辅圆朝鼓心内收，并同量缩小半径。箭头墨线因此落在 10px 鼓描边内侧，不压进黑边。
  // 只用于箭头；滚奏点仍用原来的辅圆，再按 DRUM_OUT 自己夹到鼓沿。
  rimInset: 30,
  minVisible: 0.09,         // 最短可见 90ms（BPM 高时一对只有几十毫秒）
  drawK: 0.45,              // 0 → 0.45T 起笔
  holdK: 0.55,              // 0.45T → 0.55T 停在满箭头
  headHideErase: 0.92,      // 擦到 e≈0.92 时箭头头跟最后一截一起消失
};
const _swipeLenCache = new Map();
let _swipeLenProbe = null;

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function swipePathLength(d, fallback) {
  if (_swipeLenCache.has(d)) return _swipeLenCache.get(d);
  let L = fallback;
  try {
    if (typeof document !== "undefined") {
      if (!_swipeLenProbe)
        _swipeLenProbe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      _swipeLenProbe.setAttribute("d", d);
      const got = _swipeLenProbe.getTotalLength();
      if (isFinite(got) && got > 0) L = got;
    }
  } catch (err) { /* 无 DOM / 脱离文档的 path 时退回弧长公式 */ }
  _swipeLenCache.set(d, L);
  return L;
}

/**
 * 一只手、一种刷（kd 内刷 / dk 外刷）的正圆弧几何。
 * 左手：圆心镜像到竖中线左侧，角度改成 180°−a，扫向取反。
 */
function swipeArrowGeom(hand, type) {
  const F = GEOM.face, S = SWIPE_ARROW;
  const left = hand === "L";
  const inner = type === "kd";
  const inset = S.rimInset || 0;
  const C0 = { x: F.cx + (left ? -S.cxOff : S.cxOff) * F.rx, y: F.cy - S.cyOff * F.ry };
  const inward = V.norm({ x: F.cx - C0.x, y: F.cy - C0.y });
  const C = { x: C0.x + inward.x * inset, y: C0.y + inward.y * inset };
  const r = S.rFac * F.rx - inset;
  const ang = (deg) => {
    const a = deg * Math.PI / 180;
    return left ? Math.PI - a : a;
  };
  const a0 = ang(S.a0Deg), a1 = ang(S.a1Deg);
  // 右手内刷 a0→a1 逆时针 sweep=0；外刷反过来 sweep=1。左手扫向取反。
  const sweep = inner ? (left ? 1 : 0) : (left ? 0 : 1);
  const aTail = inner ? a0 : a1;
  const aHead = inner ? a1 : a0;
  const pt = (a) => ({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) });
  // 沿行进方向的单位切线：sweep=1 随角度增大（顺时针），sweep=0 随角度减小。
  const tangAt = (a) => {
    const s = sweep === 1 ? 1 : -1;
    return { x: s * -Math.sin(a), y: s * Math.cos(a) };
  };
  const strokeWidth = S.strokeFac * F.rx;
  const outlineWidth = S.outlineFac * F.rx;
  const headLength = S.headLenFac * strokeWidth;
  const headWidth = S.headWidFac * strokeWidth;
  const back = S.shaftBack * headLength;
  const tail = pt(aTail);
  const headOnArc = pt(aHead);
  const tHead = tangAt(aHead);
  let tip, shaftEnd;
  if (inner) {
    tip = headOnArc;
    const dAng = back / r;
    shaftEnd = pt(aHead + (sweep === 1 ? -dAng : dAng));
  } else {
    const ext = S.tipExtend * F.rx;
    tip = { x: headOnArc.x + tHead.x * ext, y: headOnArc.y + tHead.y * ext };
    if (back <= ext) {
      shaftEnd = { x: tip.x - tHead.x * back, y: tip.y - tHead.y * back };
    } else {
      const dAng = (back - ext) / r;
      shaftEnd = pt(aHead + (sweep === 1 ? -dAng : dAng));
    }
  }
  const f2 = (n) => (+n).toFixed(2);
  const d = `M${f2(tail.x)},${f2(tail.y)} A${f2(r)},${f2(r)} 0 0 ${sweep} ${f2(shaftEnd.x)},${f2(shaftEnd.y)}`;
  // 杆弧长：圆心角（短弧）× r。外刷杆端仍在原圆上（回退大于外送）。
  const aEnd = Math.atan2(shaftEnd.y - C.y, shaftEnd.x - C.x);
  let dAng = aEnd - aTail;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  const fallbackLen = Math.abs(dAng) * r;
  const dir = V.norm({ x: tip.x - shaftEnd.x, y: tip.y - shaftEnd.y });
  const n = { x: -dir.y, y: dir.x };
  const headBack = V.sub(tip, V.mul(dir, headLength));
  const indent = V.add(headBack, V.mul(dir, headLength * 0.10));
  const leftPt = V.add(headBack, V.mul(n, headWidth / 2));
  const rightPt = V.add(headBack, V.mul(n, -headWidth / 2));
  const headD = `M${f2(tip.x)},${f2(tip.y)} L${f2(rightPt.x)},${f2(rightPt.y)} L${f2(indent.x)},${f2(indent.y)} L${f2(leftPt.x)},${f2(leftPt.y)} Z`;
  return {
    d, headD, sweep, r, strokeWidth, outlineWidth,
    length: swipePathLength(d, fallbackLen),
    fill: left ? COL.L : COL.R,
    outline: "#FFFFFF",
  };
}

/** 每一对 (RR)/(LL) 一支：第一下开始画，第二下（不足 90ms 则补足）擦完。 */
function activeSwipeArrows(tracks, now) {
  const out = [];
  for (const hand of ["R", "L"]) {
    const tr = tracks[hand];
    for (let k = 0; k + 1 < tr.length; k++) {
      const a = tr[k], b = tr[k + 1];
      if (a.stroke !== b.stroke) continue;
      const type = a.rollType;
      if (type !== "kd" && type !== "dk") continue;
      const T = Math.max(b.t - a.t, SWIPE_ARROW.minVisible);
      if (now < a.t || now > a.t + T) continue;
      out.push({ hand, type, tRel: now - a.t, T });
    }
  }
  return out;
}

function swipeDashState(tRel, T) {
  const S = SWIPE_ARROW;
  const drawEnd = S.drawK * T, holdEnd = S.holdK * T;
  if (tRel <= drawEnd) {
    const u = drawEnd > 0 ? clamp01(tRel / drawEnd) : 1;
    return { u, e: 0, showHead: false, phase: "draw" };
  }
  if (tRel <= holdEnd) return { u: 1, e: 0, showHead: true, phase: "hold" };
  const e = clamp01((tRel - holdEnd) / (S.drawK * T)); // (tRel - 0.55T) / 0.45T
  return { u: 1, e, showHead: e < S.headHideErase, phase: "erase" };
}

/* ---------- 滚奏实心圆（仅 dd 滚红 / kk 滚蓝；与内外刷箭头共位、同时序） ---------- */
const ROLL_DOT = {
  midDeg: (SWIPE_ARROW.a0Deg + SWIPE_ARROW.a1Deg) / 2, // -129.1，箭头弧中点（汐月 A 方案）
  rimPad: 6,            // 白边外沿离鼓沿描边外沿的最小间距（px）
  rimSamples: 720,      // 鼓沿椭圆采样点数（用来算圆心到沿的最短距离）
  rFacDon: 0.13,        // 红点（dd / don）半径 = 鼓面 rx × rFac；was 0.11
  rFacKa: 0.125,        // 青点（kk / ka）
  stroke: 2.5,          // 白描边（外圈）
  opacity: 0.90,
  popK: 0.30,           // 第一下 0→0.3T：scale 0.6→1
  popFrom: 0.6,
  bounceScale: 1.15,    // 第二下跳到 1.15
  bounceDur: 0.07,      // 跳跃回落到 1 的时长
  fadeK: 0.5,           // 第二下之后 0.5T 内淡出
};

function rollDotKind(type) {
  return (type === "ka" || type === "kk") ? "ka" : "don";
}
function rollDotRFac(type) {
  return rollDotKind(type) === "ka" ? ROLL_DOT.rFacKa : ROLL_DOT.rFacDon;
}

/** 未缓存：沿参数角采 rimSamples 个点，取点到椭圆中心线的最短距离。 */
function ellipseMinDistUncached(cx, cy, rx, ry, x, y, samples) {
  const n = samples || ROLL_DOT.rimSamples;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = Math.hypot(cx + rx * Math.cos(a) - x, cy + ry * Math.sin(a) - y);
    if (d < min) min = d;
  }
  return min;
}

const _rimSampleCache = { key: "", xs: null, ys: null };

function getRimSamples(cx, cy, rx, ry, n) {
  const key = cx + "	" + cy + "	" + rx + "	" + ry + "	" + n;
  if (_rimSampleCache.key === key) return _rimSampleCache;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    xs[i] = cx + rx * Math.cos(a);
    ys[i] = cy + ry * Math.sin(a);
  }
  _rimSampleCache.key = key;
  _rimSampleCache.xs = xs;
  _rimSampleCache.ys = ys;
  return _rimSampleCache;
}

/** 点到鼓面椭圆（中心线）的最短距离。720 点采样按椭圆几何参数缓存，不每帧重算 cos/sin。 */
function ellipseMinDist(cx, cy, rx, ry, x, y, samples) {
  const n = samples || ROLL_DOT.rimSamples;
  const rim = getRimSamples(cx, cy, rx, ry, n);
  const xs = rim.xs, ys = rim.ys;
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(xs[i] - x, ys[i] - y);
    if (d < min) min = d;
  }
  return min;
}

function rollDotGeomKey(hand, type) {
  const F = GEOM.face, S = SWIPE_ARROW, D = ROLL_DOT;
  const rFac = rollDotRFac(type);
  return [
    hand, F.cx, F.cy, F.rx, F.ry,
    S.cxOff, S.cyOff, S.rFac,
    D.midDeg, D.rimPad, D.rimSamples, rFac, D.stroke, D.bounceScale, DRUM_OUT,
  ].join("	");
}

/**
 * 用给定的最短距离函数计算滚奏点圆心（与历史逐帧算法相同）。
 * 圆的圆心：SWIPE_ARROW 辅圆弧中点，左手镜像。
 * 夹紧按「放到 bounceScale 最大」+「圆心到鼓沿椭圆的最短距离」：
 * 白边外沿离鼓沿描边内沿（椭圆中心线再扣鼓描边半宽 DRUM_OUT/2）至少 rimPad。
 * 不是击打落点。箭头的 rimInset 不参与，点仍贴着鼓沿。
 */
function rollDotPosFromDist(hand, distFn, type) {
  const F = GEOM.face, S = SWIPE_ARROW, D = ROLL_DOT;
  const left = hand === "L";
  const C = { x: F.cx + (left ? -S.cxOff : S.cxOff) * F.rx, y: F.cy - S.cyOff * F.ry };
  let ang = D.midDeg * Math.PI / 180;
  if (left) ang = Math.PI - ang;
  const R = S.rFac * F.rx;
  const x = C.x + R * Math.cos(ang);
  let y = C.y + R * Math.sin(ang);
  const rMax = rollDotRFac(type) * F.rx * D.bounceScale;
  // 放到 1.15× 时白边外沿半径，再留 6px，并扣掉鼓沿描边半宽（描边内沿朝鼓面的那一侧）
  const need = rMax + D.stroke + D.rimPad + DRUM_OUT / 2;
  const dist = (yy) => distFn(F.cx, F.cy, F.rx, F.ry, x, yy, D.rimSamples);
  if (dist(y) < need) {
    let lo = y, hi = F.cy;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (dist(mid) < need) lo = mid;
      else hi = mid;
    }
    y = hi;
  }
  // 画出时用 f1（一位小数）；向下收（y 增大）到 0.1px，避免四舍后间距略小于 6
  y = Math.ceil(y * 10 - 1e-9) / 10;
  return { x, y };
}

function rollDotPosUncached(hand, type) {
  return rollDotPosFromDist(hand, ellipseMinDistUncached, type);
}

const _rollDotPosCache = new Map();

function clearRollGeomCache() {
  _rollDotPosCache.clear();
  _rimSampleCache.key = "";
  _rimSampleCache.xs = null;
  _rimSampleCache.ys = null;
}

function rollDotPos(hand, type) {
  const key = rollDotGeomKey(hand, type);
  const hit = _rollDotPosCache.get(key);
  if (hit) return { x: hit.x, y: hit.y };
  const pos = rollDotPosFromDist(hand, ellipseMinDist, type);
  _rollDotPosCache.set(key, pos);
  return pos;
}

/**
 * 一对 (RR)/(LL) 同色滚奏出一个圆：第一下弹出，第二下再跳一下，随后淡出。
 * 只认 grip===roll 且 rollType 为 dd/kk；single 和 kd/dk 不画。最短可见跟箭头一样 90ms。
 */
function renderRollDots(tracks, now) {
  const F = GEOM.face, S = SWIPE_ARROW, D = ROLL_DOT;
  let s = "";
  for (const hand of ["R", "L"]) {
    const tr = tracks[hand];
    for (let k = 0; k + 1 < tr.length; k++) {
      const a = tr[k], b = tr[k + 1];
      if (a.stroke !== b.stroke) continue;
      if (a.grip !== "roll" || b.grip !== "roll") continue;
      const type = a.rollType;
      if (type !== "dd" && type !== "kk") continue;
      const T = Math.max(b.t - a.t, S.minVisible);
      const fade = D.fadeK * T;
      const end = a.t + T + fade;
      if (now < a.t || now > end) continue;
      const tRel = now - a.t;
      const { x, y } = rollDotPos(hand, type);
      let sc = D.popFrom + (1 - D.popFrom) * clamp01(tRel / (D.popK * T));
      const dt2 = now - (a.t + T);
      if (dt2 >= 0 && dt2 < D.bounceDur)
        sc *= 1 + (D.bounceScale - 1) * (1 - dt2 / D.bounceDur);
      let op = D.opacity;
      if (tRel > T) op *= 1 - clamp01((tRel - T) / fade);
      if (op <= 0.01) continue;
      const r = rollDotRFac(type) * F.rx * sc;
      const fill = type === "dd" ? COL.noteDon : COL.noteKa;
      s += `<g class="roll-dot" data-hand="${hand}" data-type="${type}" opacity="${f1(op)}" filter="url(#swipeArrowShadow)">`;
      s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + D.stroke)}" fill="#FFFFFF"/>`;
      s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}"/>`;
      s += `</g>`;
    }
  }
  return s;
}

function renderSwipeArrows(tracks, now) {
  const items = activeSwipeArrows(tracks, now);
  if (!items.length) return "";
  const reduced = prefersReducedMotion();
  let s = "";
  for (const it of items) {
    const g = swipeArrowGeom(it.hand, it.type);
    const L = g.length;
    const ow = g.strokeWidth + 2 * g.outlineWidth;
    let opacity = SWIPE_ARROW.opacity;
    let dash = "";
    let showHead = true;
    if (reduced) {
      // 不做 dash：组的时段内直接显满箭头，组末淡出
      const fadeStart = 0.80 * it.T;
      if (it.tRel > fadeStart)
        opacity *= 1 - clamp01((it.tRel - fadeStart) / (it.T - fadeStart));
    } else {
      const st = swipeDashState(it.tRel, it.T);
      showHead = st.showHead;
      if (st.phase === "draw")
        dash = ` stroke-dasharray="${f1(st.u * L)} ${f1(2 * L)}" stroke-dashoffset="0"`;
      else if (st.phase === "erase")
        dash = ` stroke-dasharray="${f1((1 - st.e) * L)} ${f1(2 * L)}" stroke-dashoffset="${f1(-st.e * L)}"`;
    }
    if (opacity <= 0.01) continue;
    s += `<g class="swipe-arrow" data-hand="${it.hand}" data-type="${it.type}" opacity="${f1(opacity)}" filter="url(#swipeArrowShadow)">`;
    s += `<path d="${g.d}" fill="none" stroke="${g.outline}" stroke-width="${f1(ow)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    s += `<path d="${g.d}" fill="none" stroke="${g.fill}" stroke-width="${f1(g.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    if (showHead) {
      s += `<path d="${g.headD}" fill="${g.outline}" stroke="${g.outline}" stroke-width="${f1(g.outlineWidth * 2.2)}" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<path d="${g.headD}" fill="${g.fill}" stroke="${g.fill}" stroke-width="${f1(g.outlineWidth * 0.4)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    s += `</g>`;
  }
  return s;
}

function renderTrail(hand, track, now) {
  const col = CONFIG.TRAIL_COLOR || "#FFFFFF";
  const p0 = poseAt(hand, track, now);
  const rolling = p0.gripType === "roll";
  const count = rolling ? CONFIG.ROLL_TRAIL_COUNT : CONFIG.TRAIL_ALPHA.length;
  const alphas = rolling ? CONFIG.ROLL_TRAIL_ALPHA : CONFIG.TRAIL_ALPHA;
  const seg = findSegment(track, now);
  const hit = seg.a || seg.b;
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
  return s;
}

/* ---------- 打击效果 ---------- */
function renderFaceGlow(_events, _second, _now) {
  const F = GEOM.face;
  // 去掉旧的半边橙红/粉色染色残留（不再整半边鼓染色），只保留鼓面高光和外圈描边；击中光集中在落点侧。
  let s = `<ellipse cx="${F.cx - 70}" cy="${F.cy - 62}" rx="72" ry="21" fill="#fff" opacity=".55" transform="rotate(-10 ${F.cx - 70} ${F.cy - 62})"/>`;
  s += `<ellipse cx="${F.cx}" cy="${F.cy}" rx="${F.rx}" ry="${F.ry}" fill="none" stroke="${DRUM_OUTLINE}" stroke-width="${DRUM_OUT}"/>`;
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
      // 落点侧局部击中光晕（仅在接触帧亮，不染半边鼓）。哚缩小变淡，哔保持原值。
      const G = CONFIG.HIT_GLOW;
      const glow = isRoll
        ? (e.face === "ka" ? G.rollKa : G.rollDon)
        : (e.face === "ka" ? G.ka : G.don);
      const maxR = glow.maxR;
      const r = 10 + maxR * easeOutQuad(u);
      const ry = e.face === "ka" ? r * 0.85 : r * 0.62;
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1(glow.rx)}" ry="${f1(glow.ry)}" fill="${col}" opacity="${f1(glow.op * fade)}" filter="url(#softGlow)"/>`;
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1(r)}" ry="${f1(ry)}" fill="none" stroke="${col}" stroke-width="${f1(glow.stroke * (1 - 0.4 * u))}" opacity="${f1(glow.ringOp * fade)}"/>`;
      s += `<ellipse cx="${f1(pt.x)}" cy="${f1(pt.y)}" rx="${f1(glow.coreRx * (1 - 0.2 * u))}" ry="${f1(glow.coreRy * (1 - 0.2 * u))}" fill="#fff" stroke="${col}" stroke-width="${f1(glow.coreStroke)}" opacity="${f1(glow.coreOp * fade)}"/>`;
      // 4条短放射冲击线（咚沿着鼓面散开，咔朝鼓边外侧放射）
      const baseAng = e.face === "ka" ? ellipseParamDeg(pt) : -90;
      const offsets = e.face === "ka" ? [-55, -18, 18, 55] : [-145, -35, 35, 145];
      const r0 = 7 + maxR * 0.45 * easeOutQuad(u);
      const r1 = r0 + glow.rayLen * (1 - 0.3 * u);
      for (const da of offsets) {
        const rad = (baseAng + da) * Math.PI / 180;
        const x0 = pt.x + Math.cos(rad) * r0, y0 = pt.y + Math.sin(rad) * r0 * (e.face === "ka" ? 0.9 : 0.65);
        const x1 = pt.x + Math.cos(rad) * r1, y1 = pt.y + Math.sin(rad) * r1 * (e.face === "ka" ? 0.9 : 0.65);
        s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${col}" stroke-width="${f1(glow.rayStroke)}" stroke-linecap="round" opacity="${f1(glow.rayOp * fade)}"/>`;
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
  // start/end stay the full song so the progress bar can still reach both edges.
  // fullStart/fullEnd are that same song window. The caps (loopStart/loopEnd)
  // select the clip; chartStart / playback read it from there.
  fullStart: 0, fullEnd: 1,
  loopStart: 0, loopEnd: 1,
  measures: [], bpmTimeline: [],
  playing: false,   // app.js starts playback when ?autoplay=1, after the chart is loaded
  autoplay: params.get("autoplay") === "1",
  loop: params.get("autoplay") === "1" ? false : params.get("loop") !== "0",
  hands: ["none", "vector"].includes(params.get("hands")) ? params.get("hands") : "img",   // img=画师手图（默认）；vector=代码画的手；none=不画手
  rate: pickNum(params.get("rate"), 1, 0.05, 4),
  scroll: pickNum(params.get("scroll"), 1, 0.5, 8),
  route: ["inner", "outer", "straight"].includes(params.get("route")) ? params.get("route") : "data",
  labels: params.get("labels") === "1",                 // R/L 调试标签：?labels=1 打开
  technique: params.get("technique") || "全换",          // 标题栏：全换 / 半换 A / 半换 B / 炒菜；有 JSON 且未指定时可为空
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

/** 单击握拳↔滚奏捏棒换图时，2–3 帧交叉淡入淡出，缓和锚点约 15px 的跳变。 */
function applyGripCrossfade(hand, track, now, pose) {
  const fade = CONFIG.GRIP_CROSSFADE;
  if (!fade || !pose) return pose;
  const step = 1 / 60;
  let from = pose.gripType, firstOld = 0;
  const n = Math.max(1, Math.round(fade / step));
  for (let k = 1; k <= n; k++) {
    const prev = poseAt(hand, track, now - k * step, { noKick: true, noWobble: true });
    if (prev && prev.gripType && prev.gripType !== pose.gripType) {
      from = prev.gripType;
      firstOld = k;
      break;
    }
  }
  if (firstOld) pose.gripBlend = { from, to: pose.gripType, u: firstOld / (n + 1) };
  return pose;
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
  s += renderSwipeArrows(tracks, now);
  s += renderRollDots(tracks, now);
  for (const hand of ["L", "R"]) {
    const pose = poseAt(hand, tracks[hand], now);
    applyGripCrossfade(hand, tracks[hand], now, pose);
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
  const clockEl = $("clock");
  if (clockEl) clockEl.textContent = `t = ${Math.max(0, now).toFixed(3)} s`;
  const clockEnd = $("clockEnd");
  if (clockEnd) clockEnd.textContent = `${Math.max(0, currentClip().end).toFixed(2)} s`;
  const srcEl = $("src");
  if (srcEl) srcEl.textContent = cur ? `上一个音：#${cur.i + 1} ${cur.src} ${cur.both ? "双手" : cur.hand} ${cur.face === "don" ? (cur.big ? "大咚" : "咚") : (cur.big ? "大咔" : "咔")} ${cur.grip === "roll" ? "滚奏(捏)" : "单击(握)"}${cur.inserted ? " ★插音" : ""}` : "";
  $("scrub").value = String((now - state.start) / (state.end - state.start));
  syncLoopUi(false);
}

function tick(ts) {
  if (state.lastTs !== null && state.playing) {
    const realDt = Math.min(0.1, (ts - state.lastTs) / 1000);
    // 唯一的时钟累加（实时播放）。进度条选段是预览窗口；循环跳回左帽，不再垫 0.7 秒。
    const clip = currentClip();
    const step = LoopRange.advancePlayback(state.now, realDt, {
      rate: state.rate,
      loop: state.loop,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      songStart: state.fullStart,
      songEnd: state.fullEnd,
      clipStart: clip.start,
      clipEnd: clip.end,
    });
    state.now = step.now;
    if (!step.playing) {
      setPlaying(false);
      if (step.done) signalBachiDone({ ok: true });
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
  const clip = currentClip();
  const payload = Object.assign({
    ok: true,
    t: state.now,
    start: clip.start,
    end: clip.end,
    duration: clip.end,
  }, detail || {});
  document.dispatchEvent(new CustomEvent("bachimotion:done", { detail: payload }));
}

function signalBachiReady() {
  window.__BACHI_READY__ = true;
  const clip = currentClip();
  document.dispatchEvent(new CustomEvent("bachimotion:ready", {
    detail: { start: clip.start, end: clip.end, duration: clip.end, events: state.events.length },
  }));
}

window.__BACHI_DONE__ = false;
window.__BACHI_READY__ = false;
window.renderAt = renderAt;
Object.defineProperty(window, "chartDuration", { get() { return currentClip().end; }, configurable: true });
Object.defineProperty(window, "chartStart", { get() { return currentClip().start; }, configurable: true });

function setPlaying(p) {
  state.playing = p;
  const btn = $("btnPlay");
  if (!btn) return;
  btn.setAttribute("aria-label", p ? "暂停" : "播放");
  btn.classList.toggle("playing", p);
  const iconPlay = btn.querySelector(".icon-play");
  const iconPause = btn.querySelector(".icon-pause");
  if (iconPlay && iconPause) {
    iconPlay.toggleAttribute("hidden", p);
    iconPause.toggleAttribute("hidden", !p);
  } else if (!btn.querySelector("svg")) {
    btn.textContent = p ? "⏸ 暂停" : "▶ 播放";
  }
}
function setRate(r) {
  state.rate = r;
  document.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", +b.dataset.rate === r));
  if (typeof window.updateTitleBar === "function") window.updateTitleBar();
}
function setTechnique(name) {
  let v = name == null ? "" : name;
  if (window.TaikoParser && typeof TaikoParser.displayTechnique === "function") {
    v = TaikoParser.displayTechnique(v);
  } else {
    const s = String(v).trim();
    const compact = s.replace(/\s+/g, "");
    if (!s) v = "";
    else if (compact === "半换A" || compact === "半换a") v = "半换 A";
    else if (compact === "半换B" || compact === "半换b") v = "半换 B";
    else v = s;
  }
  state.technique = v;
  if (typeof window.updateTitleBar === "function") window.updateTitleBar();
}
function seek(t) { state.now = Math.max(state.start, Math.min(state.end, t)); renderFrame(state.now); }
/** 换数据（调试/验收用）：传原始 JSON 对象 */
function setData(data) {
  state.events = normalizeEvents(data);
  state._compoundRoles = null;
  clearPoseStepCache(); state.tracks = buildHandTracks(state.events, state.route);
  const first = state.events.length ? state.events[0].t : 0;
  const last = state.events.length ? state.events[state.events.length - 1].t : 0;
  // Optional rangeStart / rangeEnd (seconds, same units as event.t) let the CLI
  // crop to a measure range, including leading/trailing rests in those bars.
  const rangeStart = data && isFinite(+data.rangeStart) ? +data.rangeStart : first;
  const rangeEnd = data && isFinite(+data.rangeEnd) ? +data.rangeEnd : last;
  const win = LoopRange.mediaWindow(Object.assign({}, data, {
    events: state.events,
    rangeStart: rangeStart,
    rangeEnd: rangeEnd,
  }), CONFIG.LEAD_IN, CONFIG.TAIL_TIME);
  // The bar keeps the whole song. A section only moves the caps and the clip.
  state.fullStart = win.songStart;
  state.fullEnd = win.songEnd;
  state.start = win.songStart;
  state.end = win.songEnd;
  state.measures = data && Array.isArray(data.measures) ? data.measures : [];
  state.bpmTimeline = data && Array.isArray(data.bpmTimeline) ? data.bpmTimeline : [];
  state.loopStart = win.loopStart;
  state.loopEnd = win.loopEnd;
  syncLoopUi(true);
}

function currentClip() {
  const songStart = isFinite(state.fullStart) ? state.fullStart : state.start;
  const songEnd = isFinite(state.fullEnd) ? state.fullEnd : state.end;
  return LoopRange.sectionClip({
    events: state.events,
    songStart: songStart,
    songEnd: songEnd,
    selStart: state.loopStart,
    selEnd: state.loopEnd,
    leadIn: CONFIG.LEAD_IN,
  });
}

function previewClip() {
  const clip = currentClip();
  return {
    start: clip.start,
    end: clip.end,
    loopStart: clip.loopStart,
    loopEnd: clip.loopEnd,
    trimmed: clip.trimmed,
    firstNote: clip.firstNote,
  };
}

/** Handles to send with “把当前谱面加入队列”. Null when the range is still the whole song. */
function exportSection() {
  const clip = currentClip();
  if (!clip.trimmed) return null;
  return { sectionStart: clip.loopStart, sectionEnd: clip.loopEnd };
}

function loopGrid() {
  return LoopRange.buildSnapGrid({
    measures: state.measures,
    bpmTimeline: state.bpmTimeline,
  }, state.start, state.end);
}

function syncLoopUi(rebuildTicks) {
  const span = $("loopSpan");
  const capA = $("loopCapStart");
  const capB = $("loopCapEnd");
  if (!span || !capA || !capB) return;
  const songSpan = state.end - state.start;
  const pct = (t) => songSpan > 0 ? ((t - state.start) / songSpan) * 100 : 0;
  const p0 = pct(state.loopStart);
  const p1 = pct(state.loopEnd);
  span.style.left = p0 + "%";
  span.style.width = Math.max(0, p1 - p0) + "%";
  capA.style.left = p0 + "%";
  capB.style.left = p1 + "%";
  const sec = (t) => (Math.round(t * 1000) / 1000).toFixed(3);
  capA.setAttribute("aria-valuemin", String(state.start));
  capA.setAttribute("aria-valuemax", String(state.loopEnd));
  capA.setAttribute("aria-valuenow", String(state.loopStart));
  capA.setAttribute("aria-valuetext", sec(state.loopStart) + " s");
  capB.setAttribute("aria-valuemin", String(state.loopStart));
  capB.setAttribute("aria-valuemax", String(state.end));
  capB.setAttribute("aria-valuenow", String(state.loopEnd));
  capB.setAttribute("aria-valuetext", sec(state.loopEnd) + " s");
  const head = $("scrubPlayhead");
  if (head) {
    const u = songSpan > 0 ? (state.now - state.start) / songSpan : 0;
    head.style.left = (Math.max(0, Math.min(1, u)) * 100) + "%";
  }
  if (!rebuildTicks) return;
  const host = $("scrubTicks");
  if (!host) return;
  host.replaceChildren();
  const grid = loopGrid();
  for (const t of grid.measureTimes) {
    if (t < state.start - 1e-6 || t > state.end + 1e-6) continue;
    const tick = document.createElement("span");
    tick.className = "scrub-tick";
    tick.style.left = pct(t) + "%";
    host.appendChild(tick);
  }
}

function applyLoopDrag(which, time) {
  const next = LoopRange.dragLoopHandle(
    { start: state.loopStart, end: state.loopEnd },
    which,
    time,
    loopGrid()
  );
  state.loopStart = next.start;
  state.loopEnd = next.end;
  const clip = currentClip();
  seek(which === "start" ? clip.start : clip.end);
}

function bindLoopCap(el, which) {
  if (!el) return;
  el.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const at = (ev) => {
      const bar = $("scrubBar");
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const time = LoopRange.timeFromClientX(ev.clientX, rect.left, rect.width, state.start, state.end);
      applyLoopDrag(which, time);
    };
    const up = () => {
      el.removeEventListener("pointermove", at);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", at);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const grid = loopGrid();
    const cur = which === "start" ? state.loopStart : state.loopEnd;
    const beat = LoopRange.localBeatDur(cur, grid.pieces, 0.5);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    applyLoopDrag(which, cur + dir * beat);
  });
}

function bindScrubSeek() {
  const bar = $("scrubBar");
  if (!bar) return;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest && e.target.closest(".loop-cap")) return;
    e.preventDefault();
    const at = (ev) => {
      const rect = bar.getBoundingClientRect();
      seek(LoopRange.timeFromClientX(ev.clientX, rect.left, rect.width, state.start, state.end));
    };
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const up = () => {
      bar.removeEventListener("pointermove", at);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
    bar.addEventListener("pointermove", at);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    at(e);
  });
}

function bindControls() {
  $("btnPlay").onclick = () => setPlaying(!state.playing);
  $("btnRestart").onclick = () => {
    const clip = currentClip();
    seek(LoopRange.restartTime({
      loop: state.loop,
      songStart: state.fullStart,
      loopStart: state.loopStart,
      clipStart: clip.start,
    }));
    setPlaying(true);
  };
  $("btnLoop").onclick = () => {
    state.loop = !state.loop;
    const loopBtn = $("btnLoop");
    loopBtn.classList.toggle("on", state.loop);
    loopBtn.setAttribute("aria-pressed", String(state.loop));
    loopBtn.setAttribute("aria-label", state.loop ? "循环（开）" : "循环（关）");
    if (state.loop) {
      const clip = currentClip();
      if (state.now > state.loopEnd + 1e-9) seek(state.loopStart);
      else if (state.now < clip.start - 1e-9) seek(clip.start);
    }
  };
  document.querySelectorAll("[data-rate]").forEach((b) => b.onclick = () => setRate(LoopRange.rateFromSpeedButton(b.dataset.rate, state.rate)));
  bindLoopCap($("loopCapStart"), "start");
  bindLoopCap($("loopCapEnd"), "end");
  bindScrubSeek();
  $("scroll").oninput = (e) => { state.scroll = +e.target.value; $("scrollVal").textContent = state.scroll + "×"; };
  $("route").onchange = (e) => { state.route = e.target.value; clearPoseStepCache(); state.tracks = buildHandTracks(state.events, state.route); };
  $("scrub").oninput = (e) => seek(state.start + (+e.target.value) * (state.end - state.start));
  setRate(state.rate); setPlaying(state.playing);
  $("btnLoop").classList.toggle("on", state.loop);
  $("btnLoop").setAttribute("aria-pressed", String(state.loop));
  $("btnLoop").setAttribute("aria-label", state.loop ? "循环（开）" : "循环（关）");
  $("scroll").value = state.scroll; $("scrollVal").textContent = state.scroll + "×";
  $("route").value = state.route;
  $("labels").checked = state.labels;
  $("labels").onchange = (e) => { state.labels = e.target.checked; };
}

let engineStarted = false;
function startEngine(data, meta) {
  window.__BACHI_DONE__ = false;
  window.__BACHI_READY__ = false;
  clearPoseStepCache();
  setData(data || { events: [] });
  const opened = currentClip();
  state.now = params.has("t") ? pickNum(params.get("t"), opened.start, state.start, state.end) : opened.start;
  syncLoopUi(false);
  if (els.stat && !els.stat.innerHTML) els.stat.innerHTML = renderStatic();
  if (!engineStarted) {
    bindControls();
    requestAnimationFrame(tick);
    engineStarted = true;
  } else {
    renderFrame(state.now);
  }
  const info = meta || data || {};
  if (data && Object.prototype.hasOwnProperty.call(data, "technique")) setTechnique(data.technique);
  if (typeof window.updateTitleBar === "function") window.updateTitleBar(data);
  window.taikoAnim = {
    state, seek, setPlaying, setRate, setTechnique, setData, startEngine,
    renderAt, signalBachiDone, poseAt, buildHandTracks, stickGeom, checkSingleWeld,
    previewClip, exportSection,
    singleContactPose, singleIdlePose, rollPairType, rollLanding, rollTypeRoute, CONFIG, GEOM,
    rollDotPos, rollDotPosUncached, ellipseMinDist, ellipseMinDistUncached, clearRollGeomCache,
    ROLL_DOT, SWIPE_ARROW,
    raw: data, meta: info,
  };
  window.renderAt = renderAt;
  signalBachiReady();
  return state;
}
