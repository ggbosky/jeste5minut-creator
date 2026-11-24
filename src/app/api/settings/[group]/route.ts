import { route, body, HttpError, logActivity } from "@/lib/api";
import { getSettings, saveSettings, resetSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, type SettingsGroup } from "@/lib/settings-defaults";

const groups = Object.keys(DEFAULT_SETTINGS) as SettingsGroup[];
const check = (g: string) => {
  if (!groups.includes(g as SettingsGroup)) throw new HttpError(404, "Neznámá skupina nastavení");
  return g as SettingsGroup;
};

export const GET = route<{ group: string }>(async (_req, { params }) => ({ value: getSettings(check(params.group)), defaults: DEFAULT_SETTINGS[check(params.group)] }));

export const PUT = route<{ group: string }>(async (req, { params, user }) => {
  const g = check(params.group);
  if (g === "security" && user.role !== "admin") throw new HttpError(403, "Jen správce");
  const b = await body<{ value: Record<string, unknown> }>(req);
  const v = saveSettings(g, b.value as never);
  logActivity(user.id, "settings.save", "settings", null, g);
  return { value: v };
});

export const DELETE = route<{ group: string }>(async (_req, { params, user }) => {
  const g = check(params.group);
  resetSettings(g);
  logActivity(user.id, "settings.save", "settings", null, `${g} → výchozí`);
  return { value: getSettings(g) };
}, { role: "admin" });
