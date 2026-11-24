import { route, body } from "@/lib/api";
import { saveEditedScript } from "@/lib/videoActions";
import { normalizeScript } from "@/lib/script";
import { sampleScript } from "@/lib/sample";
import { getVideo } from "@/lib/videos";

export const PUT = route<{ id: string }>(async (req, { params, user }) => {
  const b = await body<{ script: unknown }>(req);
  return saveEditedScript(Number(params.id), b.script, user);
});

// Vložení ukázkového scénáře (bez API klíče)
export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  const v = getVideo(Number(params.id));
  return saveEditedScript(v.id, normalizeScript(sampleScript(v.number)), user, "sample");
});
