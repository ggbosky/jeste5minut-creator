import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { keyStatus } from "@/lib/keys";
import { NewVideo } from "./NewVideo";

export const dynamic = "force-dynamic";

export default async function NewVideoPage() {
  await requireUser();
  const chapters = all<{ n: number; title: string; idea: string; used: number }>("SELECT c.n, c.title, c.idea, (SELECT COUNT(*) FROM videos v WHERE v.chapter = c.n) used FROM chapters c ORDER BY n");
  const backlog = all<{ id: number; chapter: number; hook_type: string; title: string; angle: string; hook_line: string }>("SELECT * FROM topics WHERE status = 'backlog' ORDER BY id DESC LIMIT 12");
  const hasKey = !!keyStatus().find((k) => k.provider === "anthropic")?.configured;
  return <NewVideo chapters={chapters} backlog={backlog} hasKey={hasKey} />;
}
