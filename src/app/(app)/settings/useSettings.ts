"use client";
import { useCallback, useEffect, useState } from "react";
import { api, useToast } from "@/components/ui";
import type { Settings, SettingsGroup } from "@/lib/settings-defaults";

export function useSettings<K extends SettingsGroup>(group: K) {
  const toast = useToast();
  const [value, setValue] = useState<Settings[K] | null>(null);
  const [defaults, setDefaults] = useState<Settings[K] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<{ value: Settings[K]; defaults: Settings[K] }>(`/api/settings/${group}`).then((r) => {
      setValue(r.value);
      setDefaults(r.defaults);
    });
  }, [group]);
  const set = useCallback((patch: Partial<Settings[K]>) => {
    setValue((v) => (v ? { ...v, ...patch } : v));
    setDirty(true);
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ value: Settings[K] }>(`/api/settings/${group}`, { method: "PUT", body: { value } });
      setValue(r.value);
      setDirty(false);
      toast("ok", "Uloženo");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!confirm("Vrátit tuto sekci na výchozí hodnoty?")) return;
    try {
      const r = await api<{ value: Settings[K] }>(`/api/settings/${group}`, { method: "DELETE" });
      setValue(r.value);
      setDirty(false);
      toast("ok", "Obnoveno na výchozí");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return { value, defaults, set, save, reset, dirty, saving };
}
