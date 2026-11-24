// frame(t): pozadí → počítadlo → grafika → titulek → postava.
import type { VideoSpec } from "../lib/outputs";
import type { Timeline } from "./timeline";
import { type C2D, type Brand, clamp, lerp, easeOut, easeOutBack, prog, font, roundRect, card, text, withAlpha, scaleAt } from "./draw";
import { TEMPLATE_DRAW } from "./templates";

export type Layout = {
  width: number;
  height: number;
  zone_counter: [number, number];
  zone_graphic: [number, number];
  caption_y: number;
  caption_size: number;
  zone_avatar: [number, number];
  avatar_height: number;
  breathing: boolean;
  blink_min_s: number;
  blink_max_s: number;
};

export type Assets = {
  poses: Record<string, CanvasImageSource | null | undefined>;
  cover?: CanvasImageSource | null;
};

/** Stav postavy pro každý snímek: póza + pusa + mrkání. */
export type AvatarFrame = { pose: string; mouth: 0 | 1 | 2 | 3; blink: boolean; popT: number };

const MOUTH_KEYS = ["", "Mouth_ee", "Mouth_oh", "Mouth_ah"] as const;

function poseAt(tl: Timeline, t: number) {
  let cur = tl.poses[0]?.pose ?? "Original";
  let since = 0;
  for (const p of tl.poses) {
    if (p.t <= t) {
      if (p.pose !== cur) since = p.t;
      cur = p.pose;
    } else break;
  }
  return { pose: cur, since };
}

/**
 * Předpočítaná stopa postavy. rmsDb = hlasitost na snímek (server z audia);
 * bez audia (náhled) se pusa odvozuje z časů slov.
 */
export function avatarTrack(tl: Timeline, fps: number, rmsDb: Float32Array | null, lay: Pick<Layout, "blink_min_s" | "blink_max_s">, silenceDb = -38): AvatarFrame[] {
  const frames = Math.ceil(tl.duration_s * fps);
  const out: AvatarFrame[] = [];
  // percentily hlasitých snímků (35 / 70)
  let p35 = -30, p70 = -22;
  if (rmsDb) {
    const voiced = Array.from(rmsDb).filter((x) => x > silenceDb).sort((a, b) => a - b);
    if (voiced.length > 10) {
      p35 = voiced[Math.floor(voiced.length * 0.35)];
      p70 = voiced[Math.floor(voiced.length * 0.7)];
    }
  }
  // mrkání: deterministicky pseudo-náhodně každé 3–5 s, 4 snímky
  const blinks = new Set<number>();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let tb = 1.5; tb < tl.duration_s; tb += lerp(lay.blink_min_s, lay.blink_max_s, rnd())) {
    const f0 = Math.round(tb * fps);
    for (let k = 0; k < 4; k++) blinks.add(f0 + k);
  }
  let mouth: 0 | 1 | 2 | 3 = 0;
  let hold = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    const { pose, since } = poseAt(tl, t);
    let want: 0 | 1 | 2 | 3 = 0;
    if (rmsDb) {
      const db = rmsDb[f] ?? -120;
      want = db < silenceDb ? 0 : db < p35 ? 1 : db < p70 ? 2 : 3;
    } else {
      const w = tl.words.find((x) => t >= x.start_s && t < x.end_s);
      if (w) want = ([1, 3, 2, 3, 1] as const)[Math.floor((t - w.start_s) * 11) % 5];
    }
    // min. 2 snímky na tvar pusy
    if (want !== mouth && hold >= 2) {
      mouth = want;
      hold = 0;
    }
    hold++;
    out.push({ pose, mouth: pose === "Original" ? mouth : 0, blink: pose === "Original" && mouth === 0 && blinks.has(f), popT: since });
  }
  return out;
}

export type DrawOpts = { brand: Brand; layout: Layout; scale?: number; debugZones?: boolean };

export function drawFrame(ctx: C2D, t: number, spec: VideoSpec, tl: Timeline, assets: Assets, av: AvatarFrame | null, o: DrawOpts) {
  const { brand: b, layout: L } = o;
  const W = L.width, H = L.height;
  ctx.save();
  if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);

  // 1) pozadí
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, b.bg);
  g.addColorStop(1, shade(b.bg, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, L.zone_graphic[0] + 250, 50, W / 2, L.zone_graphic[0] + 250, 760);
  rg.addColorStop(0, "rgba(255,255,255,0.07)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const sceneIdx = Math.max(0, tl.scenes.findIndex((s) => t >= s.start_s && t < s.end_s));
  const scene = tl.scenes[sceneIdx] ?? tl.scenes[tl.scenes.length - 1];
  const ss = spec.scenes.find((s) => s.n === scene?.n);

  // 2) počítadlo
  drawCounter(ctx, t, tl, b, L);

  // 3) grafika scény
  if (ss && scene) {
    // řetěz continue_from_scene → začátek grafiky je u první scény řetězu
    let startScene = sceneIdx;
    while (startScene > 0 && spec.scenes[startScene]?.graphic.continue_from_scene && spec.scenes[startScene - 1]?.graphic.template === ss.graphic.template) startScene--;
    const gStart = tl.scenes[startScene].start_s;
    // celý řetěz včetně budoucích navazujících scén (budoucí události prostě ještě nenastaly)
    let endScene = sceneIdx;
    while (endScene + 1 < spec.scenes.length && spec.scenes[endScene + 1].graphic.continue_from_scene && spec.scenes[endScene + 1].graphic.template === ss.graphic.template) endScene++;
    const chain = tl.scenes.slice(startScene, endScene + 1).map((s) => s.n);
    const ev: Record<string, number[]> = {};
    for (const e of tl.events) if (chain.includes(e.scene)) (ev[e.action] ??= []).push(e.t);
    const box = { x: 80, y: L.zone_graphic[0], w: W - 160, h: L.zone_graphic[1] - L.zone_graphic[0] };
    const pin = prog(t, gStart, 0.3);
    const draw = TEMPLATE_DRAW[ss.graphic.template] ?? TEMPLATE_DRAW.text_card;
    withAlpha(ctx, pin, () => {
      ctx.save();
      ctx.translate(0, (1 - easeOut(pin)) * 50);
      draw({ ctx, box, p: ss.graphic.params, lt: t - gStart, t, t0: gStart, ev, b, images: { cover: assets.cover } });
      ctx.restore();
    });
  }

  // 4) titulek (kinetický)
  const cap = tl.captions.find((c) => c.scene === scene?.n);
  if (cap) drawCaption(ctx, t, cap.words, b, L);

  // 5) postava
  drawAvatar(ctx, t, assets, av, b, L);

  if (o.debugZones) drawZones(ctx, L);
  ctx.restore();
}

function drawCounter(ctx: C2D, t: number, tl: Timeline, b: Brand, L: Layout) {
  const cur = [...tl.counter].reverse().find((c) => c.t <= t);
  if (!cur) return;
  const sceneOfT = tl.scenes.find((s) => t >= s.start_s && t < s.end_s)?.n;
  if (!tl.counter.some((c) => c.scene === sceneOfT)) return;
  const [y0, y1] = L.zone_counter;
  const cy = (y0 + y1) / 2 - 10;
  const p = prog(t, cur.t, 0.3);
  const label = `${cur.label} ${cur.value}/${cur.total}`;
  scaleAt(ctx, L.width / 2, cy, lerp(1.18, 1, easeOutBack(p)), () => {
    ctx.font = font(52, 800);
    const w = ctx.measureText(label).width + 80;
    card(ctx, L.width / 2 - w / 2, cy - 40, w, 80, b, { r: 40, fill: b.accent, shadow: false });
    text(ctx, label, L.width / 2, cy + 2, { size: 52, weight: 800, color: "#fff" });
  });
  // progress bar
  const bw = 520, bx = L.width / 2 - bw / 2, by = y1 - 30;
  roundRect(ctx, bx, by, bw, 14, 7);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
  const prev = (cur.value - 1) / cur.total;
  const fill = lerp(prev, cur.value / cur.total, easeOut(p));
  roundRect(ctx, bx, by, bw * fill, 14, 7);
  ctx.fillStyle = b.accent;
  ctx.fill();
}

function drawCaption(ctx: C2D, t: number, ws: { text: string; accent: boolean; t: number }[], b: Brand, L: Layout) {
  const size = L.caption_size;
  ctx.font = font(size, 800);
  const space = ctx.measureText(" ").width;
  const widths = ws.map((w) => ctx.measureText(w.text).width);
  const maxW = L.width - 120;
  // zalomení do max. 2 řádků
  const lines: number[][] = [[]];
  let lw = 0;
  ws.forEach((_, i) => {
    const add = (lines[lines.length - 1].length ? space : 0) + widths[i];
    if (lw + add > maxW && lines[lines.length - 1].length) {
      lines.push([i]);
      lw = widths[i];
    } else {
      lines[lines.length - 1].push(i);
      lw += add;
    }
  });
  const lh = size * 1.12;
  const y0 = L.caption_y - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, li) => {
    const total = line.reduce((a, i, k) => a + widths[i] + (k ? space : 0), 0);
    let x = L.width / 2 - total / 2;
    const y = y0 + li * lh;
    for (const i of line) {
      const w = ws[i];
      const p = prog(t, w.t, 0.12);
      if (p > 0) {
        const cx = x + widths[i] / 2;
        scaleAt(ctx, cx, y, lerp(0.7, 1, easeOutBack(p)), () => {
          ctx.save();
          ctx.globalAlpha *= clamp(p * 2);
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 6;
          ctx.font = font(size, 800);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = w.accent ? b.accent : "#FFFFFF";
          ctx.fillText(w.text, x, y);
          ctx.restore();
        });
      }
      x += widths[i] + space;
    }
  });
}

function drawAvatar(ctx: C2D, t: number, assets: Assets, av: AvatarFrame | null, b: Brand, L: Layout) {
  const pose = av?.pose ?? "Original";
  const breath = L.breathing ? 1 + 0.005 * (1 - Math.cos((2 * Math.PI * t) / 3)) : 1;
  // „pop“ při změně pózy: 6 snímků
  const pop = av ? 1 + 0.035 * (1 - clamp((t - av.popT) / 0.2)) * (t - av.popT < 0.2 && av.popT > 0 ? 1 : 0) : 1;
  const bottom = L.zone_avatar[1];
  const H = L.avatar_height;
  let key = pose;
  if (pose === "Original" && av) {
    if (av.blink && assets.poses.Blink) key = "Blink";
    else if (av.mouth && assets.poses[MOUTH_KEYS[av.mouth]]) key = MOUTH_KEYS[av.mouth];
  }
  const img = assets.poses[key] ?? assets.poses[pose] ?? assets.poses.Original;
  ctx.save();
  ctx.translate(L.width / 2, bottom);
  ctx.scale(breath * pop, breath * pop);
  if (img) {
    const iw = (img as { width: number }).width, ih = (img as { height: number }).height;
    const w = (H * iw) / ih;
    ctx.drawImage(img, -w / 2, -H, w, H);
  } else {
    vectorAvatar(ctx, pose, av, t, b, H);
  }
  ctx.restore();
}

/** Zástupná vektorová postavička, dokud nejsou nahrané pózy. Kreslí od spodního středu (0,0) nahoru. */
function vectorAvatar(ctx: C2D, pose: string, av: AvatarFrame | null, t: number, b: Brand, H: number) {
  const s = H / 800;
  ctx.scale(s, s);
  const skin = "#F2C3A0", hoodie = "#2E4A7D", hair = "#3A2A20";
  // tělo / mikina
  ctx.fillStyle = hoodie;
  ctx.beginPath();
  ctx.moveTo(-260, 0);
  ctx.bezierCurveTo(-260, -260, -200, -330, 0, -340);
  ctx.bezierCurveTo(200, -330, 260, -260, 260, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = b.accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-40, -330);
  ctx.lineTo(-30, -220);
  ctx.moveTo(40, -330);
  ctx.lineTo(30, -220);
  ctx.stroke();
  // krk + hlava
  ctx.fillStyle = skin;
  ctx.fillRect(-45, -400, 90, 80);
  ctx.beginPath();
  ctx.ellipse(0, -520, 135, 160, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(0, -610, 145, 90, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-80, -600, 70, 50, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // oči
  ctx.fillStyle = "#1B2333";
  if (av?.blink) {
    ctx.fillRect(-70, -535, 46, 7);
    ctx.fillRect(24, -535, 46, 7);
  } else {
    ctx.beginPath();
    ctx.ellipse(-47, -532, 15, 19, 0, 0, Math.PI * 2);
    ctx.ellipse(47, -532, 15, 19, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // obočí podle pózy
  ctx.strokeStyle = hair;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const brow = pose === "Shrug" || pose === "Thinking" ? -12 : pose === "Arms_crossed" ? 6 : 0;
  ctx.beginPath();
  ctx.moveTo(-75, -575 + brow);
  ctx.lineTo(-22, -580 - brow);
  ctx.moveTo(22, -580 - brow);
  ctx.lineTo(75, -575 + brow);
  ctx.stroke();
  // pusa
  ctx.fillStyle = "#7A2E2E";
  const m = av?.mouth ?? 0;
  ctx.beginPath();
  if (m === 0) {
    ctx.strokeStyle = "#7A2E2E";
    ctx.lineWidth = 7;
    ctx.arc(0, -470, 32, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  } else if (m === 1) ctx.ellipse(0, -458, 34, 10, 0, 0, Math.PI * 2);
  else if (m === 2) ctx.ellipse(0, -458, 20, 22, 0, 0, Math.PI * 2);
  else ctx.ellipse(0, -456, 30, 30, 0, 0, Math.PI * 2);
  if (m) ctx.fill();
  // ruce podle pózy
  ctx.strokeStyle = hoodie;
  ctx.lineWidth = 70;
  ctx.lineCap = "round";
  const hand = (x: number, y: number) => {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, 38, 0, Math.PI * 2);
    ctx.fill();
  };
  const arm = (pts: number[][]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  };
  const wig = Math.sin(t * 3) * 4;
  switch (pose) {
    case "Point_up":
      arm([[200, -280], [280, -420], [270, -600 + wig]]);
      hand(270, -630 + wig);
      ctx.fillStyle = skin;
      ctx.fillRect(258, -720 + wig, 24, 80);
      break;
    case "Shrug":
      arm([[-200, -280], [-330, -250], [-380, -380]]);
      arm([[200, -280], [330, -250], [380, -380]]);
      hand(-385, -410);
      hand(385, -410);
      break;
    case "Arms_crossed":
      arm([[-200, -260], [-120, -170], [150, -200]]);
      arm([[200, -260], [120, -150], [-150, -180]]);
      hand(160, -205);
      hand(-160, -185);
      break;
    case "Thinking":
      arm([[200, -280], [230, -200], [90, -390]]);
      hand(70, -410);
      break;
    case "Point_down":
      arm([[-200, -280], [-240, -140], [-170, -40 + wig]]);
      arm([[200, -280], [240, -140], [170, -40 + wig]]);
      hand(-160, -25 + wig);
      hand(160, -25 + wig);
      break;
    default:
      break;
  }
}

function drawZones(ctx: C2D, L: Layout) {
  const z: [string, number, number, string][] = [
    ["UI nahoře", 0, 220, "rgba(255,0,0,0.12)"],
    ["Počítadlo", L.zone_counter[0], L.zone_counter[1], "rgba(255,200,0,0.12)"],
    ["Grafika", L.zone_graphic[0], L.zone_graphic[1], "rgba(0,200,255,0.10)"],
    ["Titulek", L.caption_y - 60, L.caption_y + 60, "rgba(0,255,100,0.12)"],
    ["Postava", L.zone_avatar[0], L.zone_avatar[1], "rgba(180,0,255,0.10)"],
    ["UI dole", 1540, 1920, "rgba(255,0,0,0.10)"],
  ];
  for (const [label, a, bb, c] of z) {
    ctx.fillStyle = c;
    ctx.fillRect(0, a, L.width, bb - a);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = font(26, 600);
    ctx.textAlign = "left";
    ctx.fillText(`${label} ${a}–${bb}`, 12, a + 28);
  }
}

function shade(hex: string, amt: number) {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${n.map((v) => Math.round(clamp(v + v * amt, 0, 255))).join(",")})`;
}
