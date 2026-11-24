import { Badge } from "./ui";

export function RenderBadge({ status }: { status: string }) {
  const m: Record<string, [string, string]> = {
    queued: ["ve frontě", "#7C8AA5"],
    running: ["běží", "#FB6720"],
    done: ["OK", "#10B981"],
    qa_failed: ["kontrola ✗", "#DC2626"],
    error: ["chyba", "#DC2626"],
  };
  const [l, c] = m[status] ?? [status, "#7C8AA5"];
  return <Badge color={c}>{l}</Badge>;
}

export function actionLabel(a: string) {
  const m: Record<string, string> = {
    "auth.login": "se přihlásil(a)",
    "auth.logout": "se odhlásil(a)",
    "auth.failed": "neúspěšné přihlášení",
    "auth.setup": "nastavil(a) aplikaci",
    "video.create": "vytvořil(a) video",
    "video.script": "vygeneroval(a) scénář",
    "video.save": "upravil(a) scénář",
    "video.approve": "schválil(a) scénář",
    "video.unlock": "odemkl(a) scénář",
    "video.audio": "nahrál(a) audio",
    "video.tts": "vygeneroval(a) hlas",
    "video.publish": "publikoval(a) video",
    "video.revise": "zapracoval(a) připomínky",
    "video.delete": "smazal(a) video",
    "render.start": "spustil(a) render",
    "render.done": "render dokončen",
    "render.qa_failed": "render neprošel kontrolou",
    "render.error": "render selhal",
    "topics.generate": "vygeneroval(a) témata",
    "settings.save": "změnil(a) nastavení",
    "key.add": "přidal(a) API klíč",
    "key.delete": "smazal(a) API klíč",
    "user.create": "vytvořil(a) uživatele",
  };
  return m[a] ?? a;
}
