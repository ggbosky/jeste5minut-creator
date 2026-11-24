import { route, body, HttpError } from "@/lib/api";
import { regenerateScene } from "@/lib/llm";
import { getVideo, videoScript } from "@/lib/videos";
import type { Script } from "@/lib/script";

// Přegeneruje jednu scénu (vrací ji, uloží až editor)
export const POST = route<{ id: string }>(async (req, { params }) => {
  const b = await body<{ n: number; instruction?: string; script?: Script }>(req);
  const v = getVideo(Number(params.id));
  if (v.script_locked) throw new HttpError(409, "Scénář je schválený.");
  const s = b.script ?? videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  const scene = await regenerateScene(s, b.n, b.instruction ?? "");
  return { scene: { ...scene, n: b.n } };
});
