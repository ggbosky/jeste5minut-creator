import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { keyStatus } from "@/lib/keys";
import { TopicsClient } from "./TopicsClient";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  await requireUser();
  return (
    <TopicsClient
      chapters={all("SELECT n, title FROM chapters ORDER BY n")}
      hasKey={!!keyStatus().find((k) => k.provider === "anthropic")?.configured}
    />
  );
}
