import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/ui";

/** Načte data stránky ze service workeru; znovu po router.refresh(). */
export function usePageData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<T>(url).then(setData).catch((e) => setError(e.message));
  }, [url]);
  useEffect(() => {
    load();
    window.addEventListener("j5m-refresh", load);
    return () => window.removeEventListener("j5m-refresh", load);
  }, [load]);
  return { data, error, reload: load };
}
