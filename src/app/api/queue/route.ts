import { route } from "@/lib/api";
import { queueState } from "@/lib/pipeline";

export const GET = route(async () => queueState());
