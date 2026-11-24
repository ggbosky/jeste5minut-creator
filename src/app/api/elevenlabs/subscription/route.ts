import { route } from "@/lib/api";
import { subscription } from "@/lib/elevenlabs";

export const GET = route(async () => subscription());
