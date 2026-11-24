import type { Script } from "./script";

/** Ukázkový scénář (kapitola 2) — pro vyzkoušení editoru a renderu bez API klíče. */
export function sampleScript(id = "03"): Script {
  return {
    id,
    title: "Pět minut stačí",
    slug: "Pet_minut_staci",
    chapter: 2,
    hook_type: "myth",
    word_count: 0,
    cta: "Odkaz v bio",
    scenes: [
      {
        n: 1, spoken: "Myslíš, že se musíš učit tři hodiny v kuse?", on_screen: "Tři hodiny v *kuse*?", pose: "Arms_crossed",
        return_to_neutral: true, counter: null, graphic: "Velké číslo tři, na slově „kuse“ se objeví popisek hodiny.",
        template: "big_number", params: [{ key: "number", value: "3 h" }, { key: "label", value: "v kuse? Ne." }], events: [{ word: "kuse", action: "pop" }],
        continue_from_scene: false, pose_extra: [],
      },
      {
        n: 2, spoken: "Nemusíš. Stačí ti pět minut. Pak smíš klidně přestat.", on_screen: "Stačí *pět* minut", pose: "Point_up",
        return_to_neutral: true, counter: null, graphic: "Přeškrtnuté slovo HODINY, na slově „pět“ škrtnutí.",
        template: "strike_word", params: [{ key: "word", value: "HODINY" }, { key: "subtitle", value: "stačí 5 minut" }], events: [{ word: "pět", action: "strike" }],
        continue_from_scene: false, pose_extra: [],
      },
      {
        n: 3, spoken: "Problém není učení. Problém je ta mlha v hlavě, co tě zastaví.", on_screen: "Mlha v *hlavě*", pose: "Thinking",
        return_to_neutral: true, counter: "KROK 1/2", graphic: "Karta Mlha vlevo, na slově „mlha“ se ukáže.",
        template: "fog_to_step", params: [{ key: "left", value: "Mlha" }, { key: "left_text", value: "Naučit se na zkoušku" }, { key: "right", value: "Krok" }, { key: "right_text", value: "Přečíst jednu stranu" }],
        events: [{ word: "mlha", action: "show_left" }], continue_from_scene: false, pose_extra: [],
      },
      {
        n: 4, spoken: "Tak ji zmenši na jeden malý krok. Třeba přečíst jednu stranu.", on_screen: "Jeden *krok*", pose: "Original",
        return_to_neutral: false, counter: "KROK 2/2", graphic: "Šipka doprava ke kartě Krok na slově „krok“.",
        template: "fog_to_step", params: [{ key: "left", value: "Mlha" }, { key: "left_text", value: "Naučit se na zkoušku" }, { key: "right", value: "Krok" }, { key: "right_text", value: "Přečíst jednu stranu" }],
        events: [{ word: "krok", action: "show_arrow_right" }], continue_from_scene: true, pose_extra: [],
      },
      {
        n: 5, spoken: "Po pěti minutách většinou pokračuješ dál. Začít je ta těžší část.", on_screen: "Začít je *těžší*", pose: "Shrug",
        return_to_neutral: true, counter: null, graphic: "Checklist: začni, pět minut, pokračuj.",
        template: "checklist", params: [{ key: "items", value: "Začni|Pět minut|Pokračuj nebo přestaň" }],
        events: [{ word: "minutách", action: "check_n" }, { word: "pokračuješ", action: "check_n" }, { word: "těžší", action: "check_n" }], continue_from_scene: false, pose_extra: [],
      },
      {
        n: 6, spoken: "Celé pravidlo pěti minut najdeš v e-booku. Odkaz v bio.", on_screen: "Odkaz v *bio*", pose: "Point_down",
        return_to_neutral: false, counter: null, graphic: "Obálka e-booku a pulzující šipka.",
        template: "ebook_cta", params: [{ key: "title", value: "Ještě 5 minut" }, { key: "subtitle", value: "E-book pro odkladače" }, { key: "cta", value: "Odkaz v bio" }],
        events: [], continue_from_scene: false, pose_extra: [],
      },
    ],
    audio_parts: [
      { part: 1, scenes: [1, 2], mood: "pobavená skepse, pak úleva", stability: 0.45, tagged_text: "[playful] Myslíš, že se musíš učit tři hodiny v kuse? [confident] Nemusíš. Stačí ti pět minut. Pak smíš klidně přestat." },
      { part: 2, scenes: [3, 4], mood: "klidné vysvětlení", stability: 0.5, tagged_text: "[thoughtful] Problém není učení. Problém je ta mlha v hlavě, co tě zastaví. [reassuring] Tak ji zmenši na jeden malý krok. Třeba přečíst jednu stranu." },
      { part: 3, scenes: [5, 6], mood: "kamarádský tip a výzva", stability: 0.55, tagged_text: "[softly, warm] Po pěti minutách většinou pokračuješ dál. Začít je ta těžší část. [confident] Celé pravidlo pěti minut najdeš v e-booku. Odkaz v bio." },
    ],
    sfx: [
      { type: "pop", scene: 1, word: "kuse" },
      { type: "swoosh", scene: 2, word: "pět" },
      { type: "tick", scene: 5, word: "pokračuješ" },
    ],
    caption: "Učit se 3 hodiny v kuse? Stačí 5 minut. ⏱️ Jak začít → odkaz v bio.",
    hashtags: ["#odkladani", "#zkouskove", "#vysokaskola", "#studentlife", "#motivace"],
  };
}
