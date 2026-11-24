import { route } from "@/lib/api";
import { listAnthropicModels } from "@/lib/llm";

export const GET = route(async () => ({ models: await listAnthropicModels() }));
