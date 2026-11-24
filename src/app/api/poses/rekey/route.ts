import { route } from "@/lib/api";
import { rekeyAll } from "@/lib/poses";
import { run } from "@/lib/db";

// Znovu předklíčovat všechny pózy (po změně prahů chroma key)
export const POST = route(async () => {
  await rekeyAll();
  run("UPDATE poses SET updated_at = datetime('now') WHERE processed_file IS NOT NULL");
  return { ok: true };
});
