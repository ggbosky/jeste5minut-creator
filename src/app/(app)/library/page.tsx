import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { LibraryClient } from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireUser();
  const chapters = all<{ n: number; title: string; idea: string; body: string }>("SELECT * FROM chapters ORDER BY n");
  const usage = all<{ chapter: number; number: string; title: string; id: number }>("SELECT chapter, number, title, id FROM videos ORDER BY number");
  const ebook = one<{ original_name: string; size: number; updated_at: string }>("SELECT original_name, size, updated_at FROM assets WHERE key = 'ebook_pdf'") ?? null;
  return <LibraryClient chapters={chapters} usage={usage} ebook={ebook} />;
}
