// Kreslicí pomůcky — fungují s CanvasRenderingContext2D v prohlížeči i s @napi-rs/canvas.
export type C2D = CanvasRenderingContext2D;

export type Brand = { bg: string; accent: string; card: string; cardText: string; muted: string; font: string };

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  const x = clamp(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** Průběh animace od času t0 s délkou d (0..1). */
export const prog = (t: number, t0: number | undefined, d: number) => (t0 === undefined ? 0 : clamp((t - t0) / d));

export function font(px: number, weight: 800 | 700 | 600 | 500 | 400 = 700, family = "Inter") {
  return `${weight} ${Math.round(px)}px ${family}`;
}

export function roundRect(ctx: C2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function card(ctx: C2D, x: number, y: number, w: number, h: number, b: Brand, opts: { r?: number; fill?: string; shadow?: boolean; stroke?: string; lw?: number } = {}) {
  ctx.save();
  if (opts.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
  }
  roundRect(ctx, x, y, w, h, opts.r ?? 36);
  ctx.fillStyle = opts.fill ?? b.card;
  ctx.fill();
  ctx.restore();
  if (opts.stroke) {
    ctx.save();
    roundRect(ctx, x, y, w, h, opts.r ?? 36);
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lw ?? 6;
    ctx.stroke();
    ctx.restore();
  }
}

/** Text vycentrovaný v bodě, zmenší se, aby se vešel do maxW. */
export function text(ctx: C2D, s: string, x: number, y: number, o: { size: number; weight?: 800 | 700 | 600 | 500 | 400; color: string; maxW?: number; align?: CanvasTextAlign; family?: string; baseline?: CanvasTextBaseline }) {
  let size = o.size;
  ctx.font = font(size, o.weight ?? 700, o.family);
  if (o.maxW) {
    while (ctx.measureText(s).width > o.maxW && size > 12) {
      size -= 2;
      ctx.font = font(size, o.weight ?? 700, o.family);
    }
  }
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = o.baseline ?? "middle";
  ctx.fillText(s, x, y);
  return size;
}

export function withAlpha(ctx: C2D, a: number, fn: () => void) {
  if (a <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  fn();
  ctx.restore();
}

export function scaleAt(ctx: C2D, cx: number, cy: number, s: number, fn: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

export function check(ctx: C2D, cx: number, cy: number, size: number, color: string, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts: [number, number][] = [
    [cx - size * 0.42, cy + size * 0.02],
    [cx - size * 0.12, cy + size * 0.32],
    [cx + size * 0.45, cy - size * 0.3],
  ];
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const L = (l1 + l2) * clamp(p);
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  if (L <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], L / l1), lerp(pts[0][1], pts[1][1], L / l1));
  else {
    ctx.lineTo(...pts[1]);
    const k = (L - l1) / l2;
    ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k));
  }
  ctx.stroke();
  ctx.restore();
}

export function arrow(ctx: C2D, x1: number, y1: number, x2: number, y2: number, color: string, lw: number, p = 1) {
  if (p <= 0) return;
  const x = lerp(x1, x2, p), y = lerp(y1, y2, p);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x - Math.cos(a) * lw, y - Math.sin(a) * lw);
  ctx.stroke();
  const h = lw * 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - h * Math.cos(a - 0.5), y - h * Math.sin(a - 0.5));
  ctx.lineTo(x - h * Math.cos(a + 0.5), y - h * Math.sin(a + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function splitList(v: string | undefined, fallback: string[]): string[] {
  const l = (v ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  return l.length ? l : fallback;
}
