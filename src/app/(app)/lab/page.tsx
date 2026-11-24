import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { keyStatus } from "@/lib/keys";
import { getSettings } from "@/lib/settings";
import { LabClient } from "./LabClient";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  await requireUser();
  const k = keyStatus();
  return (
    <LabClient
      profiles={all("SELECT * FROM voice_profiles ORDER BY is_default DESC, id")}
      keys={{ anthropic: !!k.find((x) => x.provider === "anthropic")?.configured, elevenlabs: !!k.find((x) => x.provider === "elevenlabs")?.configured }}
      llm={getSettings("llm")}
      rules={getSettings("content")}
    />
  );
}
