import { route } from "@/lib/api";
import { generateForVideo } from "@/lib/videoActions";

export const POST = route<{ id: string }>(async (_req, { params, user }) => generateForVideo(Number(params.id), user));
