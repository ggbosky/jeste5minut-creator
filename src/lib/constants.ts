// Sdílené konstanty (klient i server). Žádné importy z node.

export const VIDEO_STATUSES = [
  { key: "idea", label: "Nápad", color: "#7C8AA5" },
  { key: "script", label: "Scénář", color: "#5B8DEF" },
  { key: "approved", label: "Schváleno", color: "#8B5CF6" },
  { key: "awaiting_audio", label: "Čeká na audio", color: "#F59E0B" },
  { key: "render", label: "Render", color: "#FB6720" },
  { key: "done", label: "Hotovo", color: "#10B981" },
  { key: "published", label: "Publikováno", color: "#059669" },
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number]["key"];
export const statusMeta = (k: string) => VIDEO_STATUSES.find((s) => s.key === k) ?? VIDEO_STATUSES[0];

export const HOOK_TYPES = [
  { key: "myth", label: "Vyvrácení mýtu", hint: "Začni rozšířeným omylem a hned ho shoď." },
  { key: "scene", label: "Konkrétní scéna", hint: "Situace ze života studenta, kterou zná každý." },
  { key: "direct", label: "Přímé oslovení", hint: "Mluv přímo k divákovi: „Jestli taky…“" },
] as const;
export type HookType = (typeof HOOK_TYPES)[number]["key"];

// Pózy povolené ve scénáři (6) + pomocné (pusa, mrkání) + nepoužívané
export const DEFAULT_POSES: { key: string; file: string; usage: string; kind: "pose" | "mouth" | "blink" | "unused"; inScript: boolean }[] = [
  { key: "Original", file: "Original_DC.jpg", usage: "neutrální; jediná póza s animací pusy a mrkání", kind: "pose", inScript: true },
  { key: "Point_up", file: "Point_up_DC.jpg", usage: "hook, důležité tvrzení", kind: "pose", inScript: true },
  { key: "Shrug", file: "Shrug_DC.jpg", usage: "problém, absurdita", kind: "pose", inScript: true },
  { key: "Arms_crossed", file: "Arms_crossed_DC.jpg", usage: "vyvrácení mýtu", kind: "pose", inScript: true },
  { key: "Thinking", file: "Thinking_DC.jpg", usage: "otázka, zvrat", kind: "pose", inScript: true },
  { key: "Point_down", file: "Points_down_DC.jpg", usage: "CTA, vždy poslední scéna", kind: "pose", inScript: true },
  { key: "Mouth_ah", file: "Mouth_ah_DC.jpg", usage: "animace pusy (hlasité)", kind: "mouth", inScript: false },
  { key: "Mouth_oh", file: "Mouth_oh_DC.jpg", usage: "animace pusy (střední)", kind: "mouth", inScript: false },
  { key: "Mouth_ee", file: "Mouth_ee_DC.jpg", usage: "animace pusy (tiché)", kind: "mouth", inScript: false },
  { key: "Blink", file: "Blink_DC.jpg", usage: "mrkání", kind: "blink", inScript: false },
  { key: "Face_palm", file: "Facepalm_DC.jpg", usage: "existuje, nepoužívá se", kind: "unused", inScript: false },
  { key: "Thumbs_up", file: "Thumbs_up_DC.jpg", usage: "existuje, nepoužívá se", kind: "unused", inScript: false },
  { key: "Wave", file: "Wave_DC.jpg", usage: "existuje, nepoužívá se", kind: "unused", inScript: false },
];
export const SCRIPT_POSES = ["Original", "Point_up", "Shrug", "Arms_crossed", "Thinking", "Point_down"] as const;
export type ScriptPose = (typeof SCRIPT_POSES)[number];

export type TemplateDef = {
  key: string;
  label: string;
  usage: string;
  params: { key: string; label: string; example: string; list?: boolean }[];
  events: string[];
};

// Knihovna grafických šablon (z obou videí + obecné výplně)
export const TEMPLATES: TemplateDef[] = [
  { key: "strike_word", label: "Přeškrtnuté slovo", usage: "01/1 „LÍNÝ“", params: [{ key: "word", label: "Slovo", example: "LÍNÝ" }, { key: "subtitle", label: "Podtitulek", example: "nebo ne?" }], events: ["strike"] },
  { key: "card_swap", label: "Výměna karty", usage: "01/2 skripta → mobil s notifikací", params: [{ key: "from_label", label: "Karta před", example: "Skripta" }, { key: "to_label", label: "Karta po", example: "Mobil" }, { key: "notification", label: "Notifikace", example: "3 nové zprávy" }], events: ["swap"] },
  { key: "loop_cycle", label: "Smyčka", usage: "01/3, 01/6 smyčka 5 bodů", params: [{ key: "nodes", label: "Body smyčky", example: "úkol|pocit|útěk|úleva|výčitky", list: true }], events: ["add_node", "orbit", "break_open", "show_check"] },
  { key: "fog_to_step", label: "Mlha → Krok", usage: "01/4 Mlha → Krok", params: [{ key: "left", label: "Vlevo", example: "Mlha" }, { key: "left_text", label: "Text vlevo", example: "Napsat bakalářku" }, { key: "right", label: "Vpravo", example: "Krok" }, { key: "right_text", label: "Text vpravo", example: "Otevřít dokument" }], events: ["show_left", "show_arrow_right"] },
  { key: "phone_door", label: "Mobil za dveře", usage: "01/5 mobil za dveře", params: [{ key: "label", label: "Popisek", example: "Mobil ven z pokoje" }], events: ["move_in", "close_door"] },
  { key: "numbered_circles", label: "Očíslované kroužky", usage: "01/4 úvod (1, 2) — i výchozí výplň", params: [{ key: "items", label: "Položky", example: "Mlha|Krok", list: true }], events: ["pop_n"] },
  { key: "calendar_countdown", label: "Kalendář — odpočet", usage: "02/1", params: [{ key: "number", label: "Číslo", example: "3" }, { key: "unit", label: "Jednotka", example: "dny" }, { key: "header", label: "Hlavička", example: "ZKOUŠKA ZA" }], events: ["shake", "show_empty_list"] },
  { key: "calendar_to_plan", label: "Kalendář → plán", usage: "02/2", params: [{ key: "title", label: "Nadpis", example: "Plán na 3 dny" }, { key: "days", label: "Dny", example: "Den 1|Den 2|Den 3", list: true }], events: ["morph_to_plan"] },
  { key: "sort_columns", label: "Třídění do sloupců", usage: "02/3–5", params: [{ key: "columns", label: "Sloupce", example: "Umím|Trochu|Neumím", list: true }, { key: "cards", label: "Kartičky", example: "Téma 1|Téma 2|Téma 3|Téma 4|Téma 5|Téma 6", list: true }, { key: "highlight", label: "Zvýraznit sloupec (1-n)", example: "3" }], events: ["drop_cards", "highlight_column", "tag_cards", "raise_tagged_cards", "grey_column", "float_away_column", "show_check"] },
  { key: "sleep_card", label: "Karta spánku", usage: "02/6", params: [{ key: "label", label: "Popisek", example: "Spánek 8 h" }, { key: "strike_label", label: "Přeškrtnout", example: "Noc před zkouškou" }], events: ["strike_label"] },
  { key: "calendar_expand", label: "Rozbalení kalendáře", usage: "02/7", params: [{ key: "from", label: "Z", example: "3 dny" }, { key: "to", label: "Na", example: "14 dní" }], events: ["expand"] },
  { key: "ebook_cta", label: "E-book CTA", usage: "01/7, 02/8 — držet do konce", params: [{ key: "title", label: "Nadpis", example: "Ještě 5 minut" }, { key: "subtitle", label: "Podtitulek", example: "E-book pro odkladače" }, { key: "cta", label: "CTA", example: "Odkaz v bio" }], events: ["pulse"] },
  { key: "text_card", label: "Textová karta", usage: "obecná výplň", params: [{ key: "title", label: "Nadpis", example: "Pravidlo 5 minut" }, { key: "lines", label: "Řádky", example: "Začni|Po 5 min smíš přestat", list: true }], events: ["reveal"] },
  { key: "big_number", label: "Velké číslo", usage: "obecná výplň", params: [{ key: "number", label: "Číslo", example: "25" }, { key: "label", label: "Popisek", example: "minut denně" }], events: ["pop"] },
  { key: "checklist", label: "Checklist", usage: "obecná výplň", params: [{ key: "items", label: "Položky", example: "Osnova|Ošklivý draft|25 min denně", list: true }], events: ["check_n"] },
];
export const templateDef = (k: string) => TEMPLATES.find((t) => t.key === k);

export const SFX_TYPES = ["pop", "tick", "swoosh"] as const;

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", input: 4, output: 20 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", input: 2, output: 10 },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", input: 0.1, output: 0.5 },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2", input: 8, output: 40 },
  { id: "claude-opus-5", label: "Claude Opus 5", input: 5, output: 25 },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", input: 2, output: 10 },
];
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export const ELEVEN_MODELS = [
  { id: "eleven_v3", label: "Eleven v3 (audio tagy)", tags: true },
  { id: "eleven_multilingual_v2", label: "Multilingual v2", tags: false },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5", tags: false },
  { id: "eleven_flash_v2_5", label: "Flash v2.5", tags: false },
];

export const LLM_TASKS = [
  { key: "topics", label: "Návrhy témat" },
  { key: "script", label: "Psaní scénáře" },
  { key: "revision", label: "Připomínky → úprava specu" },
  { key: "scene", label: "Přegenerování scény / hooku" },
] as const;
export type LlmTask = (typeof LLM_TASKS)[number]["key"];

export const PROVIDERS = [
  { key: "anthropic", label: "Anthropic (Claude)", env: "ANTHROPIC_API_KEY", prefix: "sk-ant-" },
  { key: "elevenlabs", label: "ElevenLabs", env: "ELEVENLABS_API_KEY", prefix: "" },
] as const;
export type Provider = (typeof PROVIDERS)[number]["key"];
