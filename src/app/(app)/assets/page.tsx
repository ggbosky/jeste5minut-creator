import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { previewConfig, specSettings } from "@/lib/clientConfig";
import { AssetsClient } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  await requireUser();
  const poses = all<{ key: string; file_name: string; usage: string; kind: string; in_script: number; processed: number; source: number; updated_at: string | null }>(
    "SELECT key, file_name, usage, kind, in_script, processed_file IS NOT NULL processed, source_file IS NOT NULL source, updated_at FROM poses ORDER BY CASE kind WHEN 'pose' THEN 0 WHEN 'mouth' THEN 1 WHEN 'blink' THEN 2 ELSE 3 END, rowid",
  );
  const cover = one<{ updated_at: string }>("SELECT updated_at FROM assets WHERE key = 'cover'");
  const logo = one<{ updated_at: string }>("SELECT updated_at FROM assets WHERE key = 'logo'");
  return <AssetsClient poses={poses} cover={cover?.updated_at ?? null} logo={logo?.updated_at ?? null} cfg={previewConfig()} specCfg={specSettings()} />;
}
