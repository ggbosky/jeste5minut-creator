import { one, run } from "./db";
import { DEFAULT_SETTINGS, type Settings, type SettingsGroup } from "./settings-defaults";

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function getSettings<K extends SettingsGroup>(group: K): Settings[K] {
  const row = one<{ value: string }>("SELECT value FROM settings WHERE key = ?", group);
  const stored = row ? JSON.parse(row.value) : {};
  return deepMerge(DEFAULT_SETTINGS[group], stored);
}

export function getAllSettings(): Settings {
  const out = {} as Settings;
  for (const k of Object.keys(DEFAULT_SETTINGS) as SettingsGroup[]) {
    (out as Record<string, unknown>)[k] = getSettings(k);
  }
  return out;
}

export function saveSettings<K extends SettingsGroup>(group: K, value: Partial<Settings[K]>) {
  const merged = deepMerge(getSettings(group), value);
  run(
    "INSERT INTO settings(key, value, updated_at) VALUES(?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    group,
    JSON.stringify(merged),
  );
  return merged;
}

export function resetSettings(group: SettingsGroup) {
  run("DELETE FROM settings WHERE key = ?", group);
}
