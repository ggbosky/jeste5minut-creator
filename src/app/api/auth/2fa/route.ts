import { publicRoute, secondFactor } from "@/lib/authflow";

export const POST = publicRoute(async (req) => secondFactor(await req.json()));
