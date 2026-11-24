import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { keyStatus } from "@/lib/keys";
import { previewConfig, specSettings } from "@/lib/clientConfig";
import { Workspace } from "./Workspace";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const v = one<{ id: number }>("SELECT id FROM videos WHERE id = ?", Number(id));
  if (!v) notFound();
  const keys = keyStatus();
  return (
    <Workspace
      id={v.id}
      role={user.role}
      cfg={previewConfig()}
      specCfg={specSettings()}
      rules={getSettings("content")}
      brand={getSettings("brand")}
      profiles={all("SELECT * FROM voice_profiles ORDER BY is_default DESC, id")}
      chapters={all("SELECT n, title, idea FROM chapters ORDER BY n")}
      keys={{ anthropic: !!keys.find((k) => k.provider === "anthropic")?.configured, elevenlabs: !!keys.find((k) => k.provider === "elevenlabs")?.configured }}
    />
  );
}
