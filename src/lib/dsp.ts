// Čisté zpracování zvuku (bez node) — sdílené mezi serverem a statickou verzí v prohlížeči.
export const SR = 48000;

/** Úseky řeči podle prahu (náhrada za ffmpeg silencedetect, počítáno přímo z PCM). */
export function speechSegments(pcm: Float32Array, rate: number, thresholdDb: number, minSilenceS: number) {
  const win = Math.round(rate * 0.01);
  const thr = Math.pow(10, thresholdDb / 20);
  const voiced: boolean[] = [];
  for (let i = 0; i < pcm.length; i += win) {
    let s = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) s += pcm[j] * pcm[j];
    voiced.push(Math.sqrt(s / Math.max(1, end - i)) > thr);
  }
  const segs: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  const minGap = Math.round(minSilenceS / 0.01);
  let silence = 0;
  voiced.forEach((v, k) => {
    const t = k * 0.01;
    if (v) {
      if (!cur) cur = { start: t, end: t + 0.01 };
      else cur.end = t + 0.01;
      silence = 0;
    } else if (cur) {
      silence++;
      if (silence >= minGap) {
        segs.push(cur);
        cur = null;
      }
    }
  });
  if (cur) segs.push(cur);
  return segs;
}

export function lastSpeechEnd(pcm: Float32Array, rate: number, thresholdDb: number) {
  const segs = speechSegments(pcm, rate, thresholdDb, 0.12);
  return segs.length ? segs[segs.length - 1].end : 0;
}

/** RMS v dB pro každý snímek videa (pro animaci pusy). */
export function rmsPerFrame(pcm: Float32Array, rate: number, fps: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  const spf = rate / fps;
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * spf), b = Math.min(pcm.length, Math.floor((f + 1) * spf));
    let s = 0;
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    const rms = b > a ? Math.sqrt(s / (b - a)) : 0;
    out[f] = rms > 0 ? 20 * Math.log10(rms) : -120;
  }
  return out;
}

// ---------------- zvukové efekty generované v kódu (bez licencí) ----------------
function synth(kind: string, rate = SR): Float32Array {
  const dur = kind === "swoosh" ? 0.38 : kind === "pop" ? 0.14 : 0.035;
  const n = Math.round(dur * rate);
  const out = new Float32Array(n);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let lp = 0, phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    if (kind === "pop") {
      const f = 900 * Math.exp(-t * 28) + 180;
      phase += (2 * Math.PI * f) / rate;
      out[i] = Math.sin(phase) * Math.exp(-t * 30) * 0.9;
    } else if (kind === "tick") {
      phase += (2 * Math.PI * 2400) / rate;
      out[i] = (Math.sin(phase) * 0.7 + rnd() * 0.3) * Math.exp(-t * 160) * 0.8;
    } else {
      const p = t / dur;
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * p);
      lp += cutoff * (rnd() - lp);
      out[i] = lp * Math.sin(Math.PI * p) ** 2 * 2.2;
    }
  }
  return out;
}

const sfxCache = new Map<string, Float32Array>();
export function sfxPcm(kind: string) {
  if (!sfxCache.has(kind)) sfxCache.set(kind, synth(kind));
  return sfxCache.get(kind)!;
}

/** Mix hlasu a efektů bez normalizace + měkký limiter. */
export function mix(voice: Float32Array, sfx: { type: string; t: number }[], rate = SR, sfxGainDb = -10): Float32Array {
  const out = new Float32Array(voice);
  const g = Math.pow(10, sfxGainDb / 20);
  for (const s of sfx) {
    const p = sfxPcm(s.type);
    const off = Math.round(s.t * rate);
    for (let i = 0; i < p.length && off + i < out.length; i++) if (off + i >= 0) out[off + i] += p[i] * g;
  }
  // limiter: strop -1 dBFS s měkkým kolenem
  const ceil = Math.pow(10, -1 / 20);
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    const ax = Math.abs(x);
    if (ax > ceil * 0.9) {
      const over = ax - ceil * 0.9;
      out[i] = Math.sign(x) * (ceil * 0.9 + (ceil * 0.1) * Math.tanh(over / (ceil * 0.1)));
    }
  }
  return out;
}

/** Ořez ticha na krajích podle špičky (práh dB) s okrajem před/za řečí. */
export function trimSilence(pcm: Float32Array, rate: number, thresholdDb: number, beforeS: number, afterS: number): Float32Array {
  const thr = Math.pow(10, thresholdDb / 20);
  let a = 0, b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < thr) a++;
  while (b > a && Math.abs(pcm[b]) < thr) b--;
  if (a >= b) return pcm;
  const s = Math.max(0, a - Math.round(beforeS * rate));
  const e = Math.min(pcm.length, b + 1 + Math.round(afterS * rate));
  return pcm.slice(s, e);
}

/** Integrovaná hlasitost podle ITU-R BS.1770 (K-weighting + gating), mono. */
export function integratedLufs(pcm: Float32Array, rate: number): number {
  // K-weighting: high-shelf + high-pass (koeficienty pro libovolný vzorkovací kmitočet)
  const biquad = (x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number) => {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  // stage 1 (shelf)
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad(pcm, (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  // stage 2 (high-pass)
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const s2 = biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  const block = Math.round(0.4 * rate), hop = Math.round(0.1 * rate);
  const powers: number[] = [];
  for (let i = 0; i + block <= s2.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + block; j++) sum += s2[j] * s2[j];
    powers.push(sum / block);
  }
  if (!powers.length) return -70;
  const lk = (p: number) => -0.691 + 10 * Math.log10(p || 1e-12);
  const abs = powers.filter((p) => lk(p) > -70);
  if (!abs.length) return -70;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => lk(p) > rel);
  return lk(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
}

/** Normalizace na cílovou hlasitost (lineární zisk) + strop špičky. */
export function normalizeLoudness(pcm: Float32Array, rate: number, targetLufs: number): { pcm: Float32Array; measured: number } {
  const measured = integratedLufs(pcm, rate);
  const g = Math.pow(10, (targetLufs - measured) / 20);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * g;
  return { pcm: limit(out), measured };
}

export function limit(out: Float32Array, ceilDb = -1): Float32Array {
  const ceil = Math.pow(10, ceilDb / 20);
  for (let i = 0; i < out.length; i++) {
    const x = out[i], ax = Math.abs(x);
    if (ax > ceil * 0.9) out[i] = Math.sign(x) * (ceil * 0.9 + ceil * 0.1 * Math.tanh((ax - ceil * 0.9) / (ceil * 0.1)));
  }
  return out;
}

/** 16bit PCM WAV (pro STT upload z prohlížeče). */
export function encodeWav16(pcm: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Uint8Array(buf);
}
