import { route } from "@/lib/api";
import { listVoices } from "@/lib/elevenlabs";

export const GET = route(async () => ({ voices: await listVoices() }));
