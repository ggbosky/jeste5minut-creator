import { route, body, HttpError } from "@/lib/api";
import { callClaude, systemPrompt } from "@/lib/llm";

// Laboratoř: libovolný prompt s volbou modelu a effortu; volitelně se systémovým promptem aplikace
export const POST = route(async (req) => {
  const b = await body<{ prompt: string; system?: string; use_app_system?: boolean; model?: string; effort?: string; max_tokens?: number }>(req);
  if (!b.prompt?.trim()) throw new HttpError(400, "Zadej prompt");
  const system = b.use_app_system ? systemPrompt() + (b.system ? `\n\n${b.system}` : "") : b.system || "Jsi užitečný asistent. Odpovídej česky.";
  const r = await callClaude({ task: "playground", system, content: [{ type: "text", text: b.prompt }], override: { model: b.model, effort: b.effort, max_tokens: b.max_tokens } });
  return { text: r.text, model: r.model, usage: r.usage, ms: r.ms };
});
