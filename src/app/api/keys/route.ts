import { route, body, HttpError, logActivity } from "@/lib/api";
import { addKey, listKeys, keyStatus } from "@/lib/keys";
import { PROVIDERS, type Provider } from "@/lib/constants";

export const GET = route(async () => ({ keys: listKeys(), status: keyStatus() }));

export const POST = route(async (req, { user }) => {
  const b = await body<{ provider: Provider; label: string; secret: string; activate?: boolean }>(req);
  if (!PROVIDERS.some((p) => p.key === b.provider)) throw new HttpError(400, "Neznámý poskytovatel");
  const id = addKey(b.provider, b.label, b.secret, !!b.activate);
  logActivity(user.id, "key.add", "api_key", id, `${b.provider}: ${b.label}`);
  return { id };
}, { role: "admin" });
