import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_POSES } from "./constants";

const CHAPTERS: [number, string, string][] = [
  [1, "Proč odkládáme", "Smyčka: úkol → pocit → útěk → úleva → výčitky"],
  [2, "Pravidlo pěti minut", "5 minut, pak smíš přestat; Mlha vs. krok"],
  [3, "Mobil", "Vyhrává vzdálenost, ne vůle; pravidla když–pak"],
  [4, "Zkouškové", "Plán na 14 dní; když zbývají 3 dny: třiď, začni častým, pusť zbytek, spi"],
  [5, "Bakalářská práce", "Osnova, ošklivý draft, 25 minut denně"],
  [6, "Perfekcionismus", "„Hotové se dá vylepšit. Nezačaté ne.“"],
  [7, "Když to nevyjde", "Nedoháněj, zmenši, vrať se"],
  [8, "Tvůj plán", "Bloky 25 + 5 minut, nedělní revize"],
];

export function seedDatabase(db: DatabaseSync) {
  const has = (sql: string) => !!db.prepare(sql).get();

  if (!has("SELECT 1 FROM chapters LIMIT 1")) {
    const ins = db.prepare("INSERT INTO chapters(n, title, idea) VALUES(?, ?, ?)");
    for (const c of CHAPTERS) ins.run(...c);
  }

  if (!has("SELECT 1 FROM poses LIMIT 1")) {
    const ins = db.prepare("INSERT INTO poses(key, file_name, usage, kind, in_script) VALUES(?, ?, ?, ?, ?)");
    for (const p of DEFAULT_POSES) ins.run(p.key, p.file, p.usage, p.kind, p.inScript ? 1 : 0);
  }

  if (!has("SELECT 1 FROM voice_profiles LIMIT 1")) {
    const ins = db.prepare(
      `INSERT INTO voice_profiles(name, voice_name, model_id, use_tags, stability, similarity, style, speed, notes, is_default)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run(
      "Josef — Multilingual v2",
      "Josef",
      "eleven_multilingual_v2",
      0,
      0.4,
      0.75,
      0.2,
      1.05,
      "Použito u obou hotových videí. Bez audio tagů. Doplň voice_id v Nastavení → Hlasy.",
      1,
    );
    ins.run(
      "Cílový — Eleven v3 s tagy",
      "",
      "eleven_v3",
      1,
      0.5,
      0.75,
      0,
      1,
      "Cílový setup: tagy [confident], [sighs], [softly, warm]. Stability 45 % emoce · 50 % běžný text · 55 % tipy.",
      0,
    );
  }

  // Dvě už hotová videa z reálné výroby — jen metadata (scénáře nejsou v aplikaci)
  if (!has("SELECT 1 FROM videos LIMIT 1")) {
    const ins = db.prepare(
      `INSERT INTO videos(number, title, slug, chapter, hook_type, status, angle, publish_info) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run(
      "01",
      "Nejsi líný",
      "Nejsi_liny",
      1,
      "myth",
      "done",
      "Smyčka odkládání: nejsi líný, utíkáš od pocitu.",
      JSON.stringify({ legacy: true, file: "Jeste5minut_nejsi-liny_v2.mp4", duration_s: 34.6, scenes: 7, version: 2, note: "v2 (opraven uříznutý konec zvuku)" }),
    );
    ins.run(
      "02",
      "3 dny do zkoušky",
      "3_Dny_do_zkousky",
      4,
      "scene",
      "done",
      "Když zbývají 3 dny: třiď, začni častým, pusť zbytek, spi.",
      JSON.stringify({ legacy: true, file: "Scenar_02_3_Dny_do_zkousky_J5M_26_v1.mp4", duration_s: 34.4, scenes: 8, version: 1 }),
    );
  }
}
