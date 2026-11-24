import { route } from "@/lib/api";
import { listModels } from "@/lib/elevenlabs";

export const GET = route(async () => ({ models: await listModels() }));
