// Časování slov: ElevenLabs Scribe (STT) se zarovnáním na text scénáře, jinak náhradně podle slabik v úsecích řeči.
import type { TimelineWord } from "../render/timeline";
import { normWord, syllables } from "./script";
import { speechSegments } from "./audio";
import type { SttWord } from "./elevenlabs";

type W = { w: string; scene: number; part: number };

/** Slabikový odhad uvnitř detekovaných úseků řeči jedné části. */
export function syllableTiming(partWords: W[], pcm: Float32Array, rate: number, offset: number, silenceDb: number, minSil: number): TimelineWord[] {
  const segs = speechSegments(pcm, rate, silenceDb, minSil);
  if (!segs.length) segs.push({ start: 0, end: pcm.length / rate });
  const speechTotal = segs.reduce((a, s) => a + (s.end - s.start), 0);
  const weights = partWords.map((w) => syllables(w.w) + (/[.!?…,]$/.test(w.w) ? 0.4 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  // mapování „kumulovaný čas řeči“ → reálný čas
  const toReal = (x: number) => {
    let acc = 0;
    for (const s of segs) {
      const d = s.end - s.start;
      if (x <= acc + d) return s.start + (x - acc);
      acc += d;
    }
    return segs[segs.length - 1].end;
  };
  let cum = 0;
  return partWords.map((w, i) => {
    const a = (cum / total) * speechTotal;
    cum += weights[i];
    const b = (cum / total) * speechTotal;
    return { w: w.w, start_s: offset + toReal(a), end_s: offset + toReal(Math.max(a, b - 0.02)), part: w.part, scene: w.scene };
  });
}

/** Zarovnání slov ze STT na slova scénáře (Levenshtein přes tokeny), chybějící se interpolují. */
export function alignStt(script: W[], stt: SttWord[], duration: number): TimelineWord[] {
  const A = script.map((w) => normWord(w.w));
  const B = stt.map((w) => normWord(w.text));
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  const sim = (a: string, b: string) => (a === b ? 0 : a.slice(0, 4) === b.slice(0, 4) && a.length > 3 ? 0.4 : 1);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + sim(A[i - 1], B[j - 1]));
  const match: (number | null)[] = new Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (dp[i][j] === dp[i - 1][j - 1] + sim(A[i - 1], B[j - 1])) {
      if (sim(A[i - 1], B[j - 1]) < 1) match[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }
  const out: TimelineWord[] = script.map((w, k) => {
    const mj = match[k];
    return { w: w.w, start_s: mj !== null ? stt[mj].start : NaN, end_s: mj !== null ? stt[mj].end : NaN, part: w.part, scene: w.scene };
  });
  // interpolace nezarovnaných
  for (let k = 0; k < out.length; k++) {
    if (!isNaN(out[k].start_s)) continue;
    let a = k - 1;
    while (a >= 0 && isNaN(out[a].start_s)) a--;
    let b = k + 1;
    while (b < out.length && isNaN(out[b].start_s)) b++;
    const t0 = a >= 0 ? out[a].end_s : 0;
    const t1 = b < out.length ? out[b].start_s : duration;
    const span = b - a - 1;
    const pos = k - a;
    const step = (t1 - t0) / (span + 1);
    out[k].start_s = t0 + step * (pos - 0.5);
    out[k].end_s = t0 + step * (pos + 0.4);
  }
  return out;
}
