import { publicRoute, setup } from "@/lib/authflow";

export const POST = publicRoute(async (req) => setup(await req.json()));
