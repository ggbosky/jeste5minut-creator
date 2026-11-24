import { route } from "@/lib/api";
import { writeMarkdowns } from "@/lib/videoActions";

// Vygeneruje (a uloží) oba .md soubory — ElevenLabs a Střih
export const GET = route<{ id: string }>(async (_req, { params }) => writeMarkdowns(Number(params.id)));
