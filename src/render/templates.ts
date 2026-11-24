// Knihovna grafických šablon. Každá šablona = funkce (ctx, box, params, čas, události).
// Pevné pořadí vrstev uvnitř šablony: pozadí → obsah → popisky (poučení „kreslení přes nadpisy“).
import {
  type C2D, type Brand, clamp, lerp, easeOut, easeOutBack, easeInOut, prog, font, roundRect, card, text,
  withAlpha, scaleAt, check, arrow, splitList,
} from "./draw";

export type Box = { x: number; y: number; w: number; h: number };
export type TplArgs = {
  ctx: C2D;
  box: Box;
  p: Record<string, string>;
  /** čas od začátku grafiky (s) */
  lt: number;
  /** absolutní čas */
  t: number;
  /** čas začátku grafiky (absolutní) */
  t0: number;
  /** časy událostí podle akce (absolutní, seřazené) */
  ev: Record<string, number[]>;
  b: Brand;
  images: { cover?: CanvasImageSource | null };
};

const first = (a: TplArgs, k: string) => a.ev[k]?.[0];
/** Kolik položek už je odhalených: podle n událostí, jinak postupně od startu. */
function revealTimes(a: TplArgs, action: string, n: number, stagger = 0.35, startDelay = 0.2): number[] {
  const ev = a.ev[action] ?? [];
  if (ev.length >= n) return ev.slice(0, n);
  if (ev.length === 1) return Array.from({ length: n }, (_, i) => ev[0] + i * stagger);
  const out = [...ev];
  const base = ev.length ? ev[ev.length - 1] + stagger : a.t0 + startDelay;
  for (let i = out.length; i < n; i++) out.push(base + (i - ev.length) * stagger);
  return out;
}

function calendarIcon(ctx: C2D, x: number, y: number, w: number, h: number, b: Brand, header: string, big: string, unit: string) {
  card(ctx, x, y, w, h, b, { r: 40 });
  ctx.save();
  roundRect(ctx, x, y, w, h * 0.24, 40);
  ctx.clip();
  ctx.fillStyle = b.accent;
  ctx.fillRect(x, y, w, h * 0.24);
  ctx.restore();
  ctx.fillStyle = b.accent;
  ctx.fillRect(x, y + h * 0.12, w, h * 0.12);
  text(ctx, header, x + w / 2, y + h * 0.12, { size: h * 0.1, weight: 800, color: "#fff", maxW: w - 40 });
  // kroužky
  for (const k of [0.28, 0.72]) {
    ctx.fillStyle = b.bg;
    ctx.beginPath();
    ctx.arc(x + w * k, y + 6, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, big, x + w / 2, y + h * 0.56, { size: h * 0.46, weight: 800, color: b.accent, maxW: w - 40 });
  text(ctx, unit, x + w / 2, y + h * 0.86, { size: h * 0.11, weight: 700, color: b.cardText, maxW: w - 40 });
}

function phone(ctx: C2D, cx: number, cy: number, h: number, b: Brand, notif?: string, np = 0) {
  const w = h * 0.52;
  card(ctx, cx - w / 2, cy - h / 2, w, h, b, { r: h * 0.09, fill: "#0B1222" });
  roundRect(ctx, cx - w / 2 + 12, cy - h / 2 + 12, w - 24, h - 24, h * 0.07);
  ctx.fillStyle = "#24365C";
  ctx.fill();
  ctx.fillStyle = "#0B1222";
  roundRect(ctx, cx - w * 0.18, cy - h / 2 + 22, w * 0.36, 18, 9);
  ctx.fill();
  if (notif && np > 0) {
    const ny = lerp(cy - h / 2 - 30, cy - h * 0.25, easeOutBack(np));
    withAlpha(ctx, np, () => {
      card(ctx, cx - w * 0.62, ny, w * 1.24, h * 0.17, b, { r: 22 });
      ctx.fillStyle = b.accent;
      ctx.beginPath();
      ctx.arc(cx - w * 0.45, ny + h * 0.085, h * 0.03, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, notif, cx + w * 0.06, ny + h * 0.085, { size: h * 0.06, weight: 700, color: b.cardText, maxW: w * 0.95 });
    });
  }
}

function book(ctx: C2D, cx: number, cy: number, h: number, b: Brand, title: string, sub: string, cover?: CanvasImageSource | null) {
  const w = h * 0.72;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  if (cover) {
    ctx.drawImage(cover, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  roundRect(ctx, -w / 2, -h / 2, w, h, 18);
  ctx.fillStyle = b.accent;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(-w / 2, -h / 2, 22, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2 + 50, -h / 2 + 60, w - 100, 6);
  text(ctx, title.split(" ").slice(0, 2).join(" "), 10, -h * 0.14, { size: h * 0.14, weight: 800, color: "#fff", maxW: w - 80 });
  text(ctx, title.split(" ").slice(2).join(" ") || "", 10, h * 0.02, { size: h * 0.14, weight: 800, color: b.bg, maxW: w - 80 });
  text(ctx, sub, 10, h * 0.3, { size: h * 0.05, weight: 600, color: "#fff", maxW: w - 90 });
  ctx.restore();
}

export const TEMPLATE_DRAW: Record<string, (a: TplArgs) => void> = {
  strike_word(a) {
    const { ctx, box, b, t } = a;
    const word = a.p.word || "LÍNÝ";
    const cx = box.x + box.w / 2, cy = box.y + box.h * 0.45;
    const ps = prog(t, first(a, "strike") ?? a.t0 + 1.2, 0.35);
    card(ctx, box.x + 40, box.y + 60, box.w - 80, box.h - 160, b);
    const size = text(ctx, word, cx, cy, { size: 190, weight: 800, color: ps > 0 ? lerpColor(b.cardText, "#9AA3B5", ps) : b.cardText, maxW: box.w - 160 });
    ctx.font = font(size, 800);
    const tw = ctx.measureText(word).width;
    if (ps > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.07);
      ctx.strokeStyle = b.accent;
      ctx.lineWidth = 22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-tw / 2 - 30, 0);
      ctx.lineTo(-tw / 2 - 30 + (tw + 60) * easeOut(ps), 0);
      ctx.stroke();
      ctx.restore();
    }
    if (a.p.subtitle) withAlpha(ctx, ps, () => text(ctx, a.p.subtitle, cx, box.y + box.h - 150, { size: 54, weight: 700, color: b.accent, maxW: box.w - 160 }));
  },

  card_swap(a) {
    const { ctx, box, b, t } = a;
    const ts = first(a, "swap") ?? a.t0 + 1.0;
    const ps = prog(t, ts, 0.5);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const flip = Math.cos(Math.PI * ps); // 1 → -1
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(0.02, Math.abs(flip)), 1);
    ctx.translate(-cx, -cy);
    if (flip > 0) {
      card(ctx, cx - 230, cy - 270, 460, 540, b);
      // skripta
      ctx.fillStyle = "#E7EAF0";
      roundRect(ctx, cx - 150, cy - 190, 300, 280, 16);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "#B8C0CF";
        ctx.fillRect(cx - 120, cy - 160 + i * 40, i % 2 ? 200 : 240, 12);
      }
      text(ctx, a.p.from_label || "Skripta", cx, cy + 180, { size: 60, weight: 800, color: b.cardText, maxW: 400 });
    } else {
      phone(ctx, cx, cy + 10, 520, b, a.p.notification || "3 nové zprávy", prog(t, ts + 0.45, 0.4));
    }
    ctx.restore();
    if (flip <= 0 && a.p.to_label) text(ctx, a.p.to_label, cx, box.y + box.h - 10, { size: 52, weight: 800, color: "#fff", maxW: box.w - 80 });
  },

  loop_cycle(a) {
    const { ctx, box, b, t } = a;
    const nodes = splitList(a.p.nodes, ["úkol", "pocit", "útěk", "úleva", "výčitky"]);
    const n = nodes.length;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2 + 10;
    const R = Math.min(box.w, box.h) * 0.36;
    const shown = revealTimes(a, "add_node", n, 0.3);
    const pb = prog(t, first(a, "break_open"), 0.5);
    const po = first(a, "orbit");
    const pc = prog(t, first(a, "show_check"), 0.45);
    const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    // oblouky (vrstva pod body)
    for (let i = 0; i < n; i++) {
      const pi = prog(t, shown[(i + 1) % n], 0.35) * prog(t, shown[i], 0.01);
      if (pi <= 0) continue;
      const isBreak = i === n - 1;
      const a1 = ang(i) + 0.32, a2 = ang(i + 1) - 0.32;
      ctx.save();
      ctx.strokeStyle = isBreak && pb > 0 ? `rgba(199,204,214,${1 - pb})` : b.muted;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.setLineDash([2, 18]);
      ctx.beginPath();
      ctx.arc(cx, cy, R + (isBreak ? pb * 40 : 0), a1, lerp(a1, a2, pi));
      ctx.stroke();
      ctx.restore();
    }
    if (po !== undefined && t >= po && pb < 1) {
      const k = ((t - po) / 2.2) % 1;
      const aa = -Math.PI / 2 + k * 2 * Math.PI;
      ctx.fillStyle = b.accent;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(aa) * R, cy + Math.sin(aa) * R, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    nodes.forEach((label, i) => {
      const pn = prog(t, shown[i], 0.35);
      if (pn <= 0) return;
      const push = i === 0 || i === n - 1 ? pb * 30 : 0;
      const x = cx + Math.cos(ang(i)) * (R + push), y = cy + Math.sin(ang(i)) * (R + push);
      scaleAt(ctx, x, y, easeOutBack(pn), () => {
        ctx.font = font(44, 800);
        const w = Math.max(150, ctx.measureText(label).width + 56);
        card(ctx, x - w / 2, y - 42, w, 84, b, { r: 42, fill: i === 0 ? b.accent : b.card });
        text(ctx, label, x, y + 2, { size: 44, weight: 800, color: i === 0 ? "#fff" : b.cardText, maxW: w - 30 });
      });
    });
    if (pc > 0) scaleAt(ctx, cx, cy, easeOutBack(pc), () => {
      ctx.fillStyle = b.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();
      check(ctx, cx, cy, 110, "#fff", pc);
    });
  },

  fog_to_step(a) {
    const { ctx, box, b, t } = a;
    const pl = prog(t, first(a, "show_left") ?? a.t0 + 0.1, 0.4);
    const pa = prog(t, first(a, "show_arrow_right") ?? a.t0 + 1.4, 0.45);
    const pr = prog(t, (first(a, "show_arrow_right") ?? a.t0 + 1.4) + 0.3, 0.4);
    const cw = box.w * 0.4, ch = box.h * 0.78, y = box.y + (box.h - ch) / 2;
    withAlpha(ctx, pl, () => {
      const x = box.x + 10;
      card(ctx, x, y, cw, ch, b, { fill: "#DDE2EA" });
      // mlha
      for (let i = 0; i < 7; i++) {
        const fx = x + cw * (0.2 + 0.12 * i) + Math.sin(t * 1.3 + i) * 10;
        const fy = y + ch * (0.3 + 0.08 * (i % 3));
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(fx, fy, 50 + (i % 3) * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      text(ctx, a.p.left || "Mlha", x + cw / 2, y + ch * 0.32, { size: 70, weight: 800, color: "#8892A6", maxW: cw - 40 });
      wrapText(ctx, a.p.left_text || "", x + cw / 2, y + ch * 0.7, cw - 50, 40, "#6B7488");
    });
    arrow(ctx, box.x + cw + 30, box.y + box.h / 2, box.x + box.w - cw - 30, box.y + box.h / 2, b.accent, 14, easeOut(pa));
    if (pr > 0) {
      const x = box.x + box.w - cw - 10;
      scaleAt(ctx, x + cw / 2, y + ch / 2, easeOutBack(pr), () => {
        card(ctx, x, y, cw, ch, b, { stroke: b.accent, lw: 10 });
        text(ctx, a.p.right || "Krok", x + cw / 2, y + ch * 0.32, { size: 70, weight: 800, color: b.accent, maxW: cw - 40 });
        wrapText(ctx, a.p.right_text || "", x + cw / 2, y + ch * 0.7, cw - 50, 40, b.cardText);
      });
    }
  },

  phone_door(a) {
    const { ctx, box, b, t } = a;
    const pm = prog(t, first(a, "move_in") ?? a.t0 + 0.5, 0.7);
    const pd = prog(t, first(a, "close_door") ?? a.t0 + 1.5, 0.45);
    const dx = box.x + box.w * 0.55, dw = box.w * 0.36, dy = box.y + 40, dh = box.h - 80;
    // dveřní otvor
    ctx.fillStyle = "#0B1222";
    roundRect(ctx, dx, dy, dw, dh, 12);
    ctx.fill();
    // mobil putuje do otvoru (pod dveřmi)
    const px = lerp(box.x + box.w * 0.22, dx + dw / 2, easeInOut(pm));
    const ps = lerp(1, 0.6, easeInOut(pm));
    withAlpha(ctx, 1 - pd * 0.9, () => scaleAt(ctx, px, box.y + box.h / 2, ps, () => phone(ctx, px, box.y + box.h / 2, 380, b)));
    // křídlo dveří (zavírá se zleva doprava)
    const open = 1 - easeOut(pd);
    const leafW = dw * lerp(1, 0.18, open);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#C98B5A";
    ctx.fillRect(dx + dw - leafW, dy, leafW, dh);
    ctx.restore();
    ctx.fillStyle = "#A86F45";
    ctx.fillRect(dx + dw - leafW + leafW * 0.12, dy + dh * 0.08, leafW * 0.76, dh * 0.36);
    ctx.fillRect(dx + dw - leafW + leafW * 0.12, dy + dh * 0.52, leafW * 0.76, dh * 0.38);
    ctx.fillStyle = b.accent;
    ctx.beginPath();
    ctx.arc(dx + dw - leafW + leafW * 0.14, dy + dh * 0.5, 12, 0, Math.PI * 2);
    ctx.fill();
    // rám
    ctx.strokeStyle = "#E9EDF3";
    ctx.lineWidth = 16;
    roundRect(ctx, dx - 8, dy - 8, dw + 16, dh + 16, 14);
    ctx.stroke();
    if (a.p.label) withAlpha(ctx, pd, () => text(ctx, a.p.label, box.x + box.w * 0.25, box.y + box.h - 60, { size: 46, weight: 800, color: "#fff", maxW: box.w * 0.45 }));
  },

  numbered_circles(a) {
    const { ctx, box, b, t } = a;
    const items = splitList(a.p.items, ["", ""]);
    const n = items.length;
    const times = revealTimes(a, "pop_n", n, 0.45);
    const r = Math.min(120, (box.w / n) * 0.32);
    items.forEach((label, i) => {
      const p = prog(t, times[i], 0.35);
      if (p <= 0) return;
      const x = box.x + (box.w * (i + 0.5)) / n, y = box.y + box.h * 0.42;
      scaleAt(ctx, x, y, easeOutBack(p), () => {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 24;
        ctx.fillStyle = i === n - 1 ? b.accent : b.card;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        text(ctx, String(i + 1), x, y + 4, { size: r * 1.1, weight: 800, color: i === n - 1 ? "#fff" : b.cardText });
      });
      if (label) withAlpha(ctx, p, () => text(ctx, label, x, y + r + 60, { size: 48, weight: 800, color: "#fff", maxW: box.w / n - 20 }));
    });
  },

  calendar_countdown(a) {
    const { ctx, box, b, t } = a;
    const tsh = first(a, "shake");
    const sh = tsh !== undefined && t >= tsh && t < tsh + 0.6 ? Math.sin((t - tsh) * 40) * (1 - (t - tsh) / 0.6) * 0.08 : 0;
    const pl = prog(t, first(a, "show_empty_list"), 0.4);
    const cw = 420, ch = 480;
    const cx = lerp(box.x + box.w / 2, box.x + box.w * 0.3, easeOut(pl));
    const cy = box.y + box.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sh);
    ctx.translate(-cx, -cy);
    calendarIcon(ctx, cx - cw / 2, cy - ch / 2, cw, ch, b, a.p.header || "ZKOUŠKA ZA", a.p.number || "3", a.p.unit || "dny");
    ctx.restore();
    if (pl > 0) {
      const x = box.x + box.w * 0.58, w = box.w * 0.38;
      withAlpha(ctx, pl, () => {
        card(ctx, x, cy - ch / 2 + (1 - easeOut(pl)) * 60, w, ch, b);
        text(ctx, "Umím:", x + 40, cy - ch / 2 + 70, { size: 44, weight: 800, color: b.cardText, align: "left" });
        for (let i = 0; i < 4; i++) {
          const y = cy - ch / 2 + 150 + i * 80;
          ctx.strokeStyle = "#C7CCD6";
          ctx.lineWidth = 5;
          roundRect(ctx, x + 40, y - 20, 40, 40, 8);
          ctx.stroke();
          ctx.setLineDash([12, 12]);
          ctx.beginPath();
          ctx.moveTo(x + 100, y);
          ctx.lineTo(x + w - 40, y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }
  },

  calendar_to_plan(a) {
    const { ctx, box, b, t } = a;
    const pm = prog(t, first(a, "morph_to_plan") ?? a.t0 + 0.8, 0.55);
    const days = splitList(a.p.days, ["Den 1", "Den 2", "Den 3"]);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const w = lerp(420, box.w - 60, easeInOut(pm)), h = lerp(480, box.h - 30, easeInOut(pm));
    if (pm < 0.5) {
      withAlpha(ctx, 1 - pm * 2, () => calendarIcon(ctx, cx - w / 2, cy - h / 2, w, h, b, "ZKOUŠKA ZA", "3", "dny"));
    }
    if (pm > 0.3) {
      const q = clamp((pm - 0.3) / 0.7);
      withAlpha(ctx, q, () => {
        card(ctx, cx - w / 2, cy - h / 2, w, h, b);
        text(ctx, a.p.title || "Plán", cx, cy - h / 2 + 80, { size: 66, weight: 800, color: b.cardText, maxW: w - 60 });
        days.forEach((d, i) => {
          const pi = prog(t, (first(a, "morph_to_plan") ?? a.t0 + 0.8) + 0.4 + i * 0.22, 0.3);
          const y = cy - h / 2 + 190 + i * ((h - 230) / days.length);
          withAlpha(ctx, pi, () => {
            ctx.fillStyle = i === 0 ? b.accent : "#EEF1F6";
            roundRect(ctx, cx - w / 2 + 50 + (1 - easeOut(pi)) * 40, y - 45, w - 100, 90, 24);
            ctx.fill();
            text(ctx, d, cx - w / 2 + 90, y, { size: 46, weight: 800, color: i === 0 ? "#fff" : b.cardText, align: "left", maxW: w - 160 });
          });
        });
      });
    }
  },

  sort_columns(a) {
    const { ctx, box, b, t } = a;
    const cols = splitList(a.p.columns, ["Umím", "Trochu", "Neumím"]);
    const cards = splitList(a.p.cards, ["Téma 1", "Téma 2", "Téma 3", "Téma 4", "Téma 5", "Téma 6"]);
    const hi = clamp(parseInt(a.p.highlight || String(cols.length), 10) - 1, 0, cols.length - 1);
    const nc = cols.length;
    const gap = 20, cw = (box.w - gap * (nc - 1)) / nc, top = box.y + 10, headH = 90;
    const drops = revealTimes(a, "drop_cards", cards.length, 0.15);
    const pHi = prog(t, first(a, "highlight_column"), 0.35);
    const pTag = prog(t, first(a, "tag_cards"), 0.35);
    const pRaise = prog(t, first(a, "raise_tagged_cards"), 0.45);
    const pGrey = prog(t, first(a, "grey_column"), 0.4);
    const pFloat = prog(t, first(a, "float_away_column"), 0.8);
    const pCheck = prog(t, first(a, "show_check"), 0.45);
    const greyCol = hi === 0 ? nc - 1 : 0;
    const colX = (i: number) => box.x + i * (cw + gap);
    const colAlpha = (i: number) => (i === greyCol ? 1 - pFloat : 1);
    const colDy = (i: number) => (i === greyCol ? -easeInOut(pFloat) * 160 : 0);
    // 1) pozadí sloupců
    for (let i = 0; i < nc; i++) {
      withAlpha(ctx, colAlpha(i), () => {
        const isHi = i === hi && pHi > 0;
        roundRect(ctx, colX(i), top + colDy(i), cw, box.h - 20, 28);
        ctx.fillStyle = i === greyCol && pGrey > 0 ? `rgba(120,128,145,${0.25 + 0.35 * pGrey})` : "rgba(255,255,255,0.08)";
        ctx.fill();
        if (isHi) {
          ctx.strokeStyle = b.accent;
          ctx.lineWidth = 8 * pHi;
          ctx.stroke();
        }
      });
    }
    // 2) kartičky
    const perCol: number[] = Array(nc).fill(0);
    cards.forEach((label, k) => {
      const col = k % nc;
      const slot = perCol[col]++;
      const p = prog(t, drops[k], 0.45);
      if (p <= 0) return;
      const tagged = col === hi;
      const lift = tagged ? easeOut(pRaise) * -24 : 0;
      const ty = top + headH + 24 + slot * 104 + colDy(col) + lift;
      const y = lerp(box.y - 260, ty, easeOutBack(p));
      withAlpha(ctx, colAlpha(col) * clamp(p * 3), () => {
        const sc = tagged ? 1 + 0.06 * easeOut(pRaise) : 1;
        scaleAt(ctx, colX(col) + cw / 2, y + 44, sc, () => {
          card(ctx, colX(col) + 16, y, cw - 32, 88, b, { r: 18, fill: col === greyCol && pGrey > 0 ? lerpColor(b.card, "#AEB5C2", pGrey) : b.card });
          text(ctx, label, colX(col) + cw / 2 + (tagged && pTag > 0 ? 14 : 0), y + 46, { size: 36, weight: 700, color: b.cardText, maxW: cw - 90 });
          if (tagged && pTag > 0) {
            ctx.fillStyle = b.accent;
            ctx.beginPath();
            ctx.arc(colX(col) + 44, y + 44, 13 * easeOutBack(pTag), 0, Math.PI * 2);
            ctx.fill();
          }
        });
      });
    });
    // 3) hlavičky (vždy navrchu)
    for (let i = 0; i < nc; i++) {
      withAlpha(ctx, colAlpha(i), () => {
        const isHi = i === hi && pHi > 0;
        roundRect(ctx, colX(i), top + colDy(i), cw, headH, 28);
        ctx.fillStyle = isHi ? lerpColor(b.card, b.accent, pHi) : b.card;
        ctx.fill();
        text(ctx, cols[i], colX(i) + cw / 2, top + headH / 2 + colDy(i), { size: 42, weight: 800, color: isHi && pHi > 0.5 ? "#fff" : b.cardText, maxW: cw - 30 });
      });
    }
    if (pCheck > 0) {
      const x = colX(hi) + cw / 2, y = box.y + box.h - 90;
      scaleAt(ctx, x, y, easeOutBack(pCheck), () => {
        ctx.fillStyle = b.accent;
        ctx.beginPath();
        ctx.arc(x, y, 62, 0, Math.PI * 2);
        ctx.fill();
        check(ctx, x, y, 76, "#fff", pCheck);
      });
    }
  },

  sleep_card(a) {
    const { ctx, box, b, t } = a;
    const ps = prog(t, first(a, "strike_label") ?? a.t0 + 1.0, 0.4);
    const cx = box.x + box.w / 2;
    card(ctx, box.x + 80, box.y + 30, box.w - 160, box.h - 60, b);
    // měsíc
    ctx.fillStyle = b.accent;
    ctx.beginPath();
    ctx.arc(cx, box.y + 190, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.card;
    ctx.beginPath();
    ctx.arc(cx + 45, box.y + 160, 80, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const z = (t * 0.7 + i * 0.33) % 1;
      withAlpha(ctx, 1 - z, () => text(ctx, "z", cx + 120 + z * 60, box.y + 160 - z * 90 - i * 6, { size: 40 + i * 8, weight: 800, color: b.muted }));
    }
    text(ctx, a.p.label || "Spánek", cx, box.y + 370, { size: 66, weight: 800, color: b.cardText, maxW: box.w - 220 });
    const s2 = a.p.strike_label || "Noc před zkouškou";
    const size = text(ctx, s2, cx, box.y + 470, { size: 46, weight: 700, color: lerpColor(b.cardText, "#9AA3B5", ps), maxW: box.w - 240 });
    if (ps > 0) {
      ctx.font = font(size, 700);
      const w = ctx.measureText(s2).width;
      ctx.strokeStyle = b.accent;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 - 14, box.y + 470);
      ctx.lineTo(cx - w / 2 - 14 + (w + 28) * easeOut(ps), box.y + 470);
      ctx.stroke();
    }
  },

  calendar_expand(a) {
    const { ctx, box, b, t } = a;
    const pe = prog(t, first(a, "expand") ?? a.t0 + 0.8, 0.7);
    const from = parseInt(a.p.from || "3", 10) || 3;
    const to = parseInt(a.p.to || "14", 10) || 14;
    const n = Math.round(lerp(from, to, easeInOut(pe)));
    const cols = 7;
    const rows = Math.ceil(Math.max(n, 1) / cols);
    const cell = Math.min(110, (box.w - 80) / cols - 12);
    const gw = cols * (cell + 12) - 12;
    const gx = box.x + (box.w - gw) / 2, gy = box.y + 150;
    card(ctx, box.x + 30, box.y + 20, box.w - 60, box.h - 40, b);
    text(ctx, pe < 0.5 ? a.p.from || "3 dny" : a.p.to || "14 dní", box.x + box.w / 2, box.y + 90, { size: 60, weight: 800, color: b.cardText });
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const appear = i < from ? 1 : clamp((pe * to - i) * 1.5);
      withAlpha(ctx, appear, () => {
        roundRect(ctx, gx + c * (cell + 12), gy + r * (cell + 12), cell, cell, 16);
        ctx.fillStyle = i >= n - 1 ? b.accent : i < from ? "#FFD9C4" : "#EEF1F6";
        ctx.fill();
        text(ctx, String(i + 1), gx + c * (cell + 12) + cell / 2, gy + r * (cell + 12) + cell / 2, { size: cell * 0.42, weight: 800, color: i >= n - 1 ? "#fff" : b.cardText });
      });
    }
    void rows;
  },

  ebook_cta(a) {
    const { ctx, box, b, t } = a;
    const pin = prog(t, a.t0, 0.5);
    const cx = box.x + box.w / 2;
    withAlpha(ctx, pin, () => {
      scaleAt(ctx, cx, box.y + box.h * 0.4, lerp(0.85, 1, easeOutBack(pin)), () =>
        book(ctx, cx, box.y + box.h * 0.4, 430, b, a.p.title || "Ještě 5 minut", a.p.subtitle || "", a.images.cover),
      );
      const pulse = 1 + 0.06 * Math.sin(t * 6);
      const py = box.y + box.h - 60;
      scaleAt(ctx, cx, py, pulse, () => {
        ctx.font = font(54, 800);
        const w = ctx.measureText(a.p.cta || "Odkaz v bio").width + 90;
        card(ctx, cx - w / 2, py - 46, w, 92, b, { r: 46, fill: b.accent });
        text(ctx, a.p.cta || "Odkaz v bio", cx, py + 2, { size: 54, weight: 800, color: "#fff" });
      });
      // pulzující šipka dolů (k avatarovi / bio)
      const ay = py + 70 + Math.abs(Math.sin(t * 4)) * 18;
      arrow(ctx, cx, ay, cx, ay + 50, b.accent, 12, 1);
    });
  },

  text_card(a) {
    const { ctx, box, b, t } = a;
    const lines = splitList(a.p.lines, []);
    const times = revealTimes(a, "reveal", lines.length, 0.45, 0.4);
    const pin = prog(t, a.t0, 0.35);
    withAlpha(ctx, pin, () => {
      card(ctx, box.x + 40, box.y + 30, box.w - 80, box.h - 60, b);
      text(ctx, a.p.title || "", box.x + box.w / 2, box.y + (lines.length ? 130 : box.h / 2), { size: 68, weight: 800, color: b.cardText, maxW: box.w - 160 });
      lines.forEach((l, i) => {
        const p = prog(t, times[i], 0.35);
        withAlpha(ctx, p, () => {
          const y = box.y + 250 + i * 95 + (1 - easeOut(p)) * 20;
          ctx.fillStyle = b.accent;
          ctx.beginPath();
          ctx.arc(box.x + 130, y, 12, 0, Math.PI * 2);
          ctx.fill();
          text(ctx, l, box.x + 165, y, { size: 46, weight: 700, color: b.cardText, align: "left", maxW: box.w - 270 });
        });
      });
    });
  },

  big_number(a) {
    const { ctx, box, b, t } = a;
    const p = prog(t, a.t0 + 0.05, 0.45);
    const tp = first(a, "pop");
    const bump = tp !== undefined && t >= tp ? 0.18 * Math.sin(Math.PI * clamp((t - tp) / 0.35)) : 0;
    const cx = box.x + box.w / 2;
    scaleAt(ctx, cx, box.y + box.h * 0.42, easeOutBack(p) + bump, () =>
      text(ctx, a.p.number || "5", cx, box.y + box.h * 0.42, { size: 330, weight: 800, color: b.accent, maxW: box.w - 60 }),
    );
    withAlpha(ctx, p, () => text(ctx, a.p.label || "", cx, box.y + box.h * 0.82, { size: 62, weight: 800, color: "#fff", maxW: box.w - 80 }));
  },

  checklist(a) {
    const { ctx, box, b, t } = a;
    const items = splitList(a.p.items, ["Krok 1", "Krok 2", "Krok 3"]);
    const times = revealTimes(a, "check_n", items.length, 0.5, 0.5);
    card(ctx, box.x + 40, box.y + 20, box.w - 80, box.h - 40, b);
    const rowH = Math.min(130, (box.h - 100) / items.length);
    items.forEach((it, i) => {
      const y = box.y + 70 + rowH * (i + 0.5);
      const p = prog(t, times[i], 0.35);
      ctx.strokeStyle = p > 0 ? b.accent : "#C7CCD6";
      ctx.lineWidth = 6;
      roundRect(ctx, box.x + 100, y - 32, 64, 64, 14);
      if (p > 0) {
        ctx.fillStyle = b.accent;
        ctx.fill();
      }
      ctx.stroke();
      check(ctx, box.x + 132, y, 52, "#fff", p);
      text(ctx, it, box.x + 200, y, { size: 50, weight: 700, color: p > 0 ? b.cardText : "#6B7488", align: "left", maxW: box.w - 300 });
    });
  },
};

export function lerpColor(c1: string, c2: string, t: number) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  const k = clamp(t);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(",")})`;
}

function wrapText(ctx: C2D, s: string, cx: number, cy: number, maxW: number, size: number, color: string) {
  if (!s) return;
  ctx.font = font(size, 600);
  const ws = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of ws) {
    const nx = cur ? cur + " " + w : w;
    if (ctx.measureText(nx).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = nx;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => text(ctx, l, cx, cy + (i - (lines.length - 1) / 2) * size * 1.25, { size, weight: 600, color }));
}
