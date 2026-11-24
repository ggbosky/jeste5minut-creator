import { route, HttpError } from "@/lib/api";
import { one } from "@/lib/db";
import { keySecret, recordTest } from "@/lib/keys";
import { testAnthropicKey } from "@/lib/llm";
import { subscription } from "@/lib/elevenlabs";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const id = Number(params.id);
  const k = one<{ provider: string }>("SELECT provider FROM api_keys WHERE id = ?", id);
  if (!k) throw new HttpError(404, "Klíč nenalezen");
  const secret = keySecret(id);
  try {
    let message = "";
    if (k.provider === "anthropic") {
      const models = await testAnthropicKey(secret);
      message = `OK · ${models.length} modelů dostupných (${models.slice(0, 3).join(", ")}…)`;
    } else {
      const s = await subscription(secret);
      message = `OK · ${s.tier} · ${s.character_count.toLocaleString("cs-CZ")}/${s.character_limit.toLocaleString("cs-CZ")} znaků`;
    }
    recordTest(id, true, message);
    return { ok: true, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    recordTest(id, false, message);
    return { ok: false, message };
  }
}, { role: "admin" });
