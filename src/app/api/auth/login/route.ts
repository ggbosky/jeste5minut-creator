import { publicRoute, login } from "@/lib/authflow";

export const POST = publicRoute(async (req) => login(await req.json()));
