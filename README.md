# Ještě 5 minut — Studio

Webová aplikace pro výrobu 20–35s reels s AI avatarem, které propagují e-book *Ještě 5 minut*.
Z jednoho kliknutí („Nové video“) vznikne hotové MP4 1080 × 1920 pro Instagram Reels a TikTok.
Člověk do procesu vstupuje jen třikrát: **schválí scénář, nahraje audio z ElevenLabs a zkontroluje video**.

## Co umí

**Přihlášení a účty**
- Login před vstupem do aplikace, první spuštění vytvoří účet správce (`/setup`)
- Role správce / editor / čtenář, správa uživatelů, změna hesla, odhlášení ostatních zařízení
- Volitelné dvoufázové ověření (TOTP, QR kód), omezení pokusů o přihlášení, CSRF kontrola původu
- Hesla scrypt, session cookie httpOnly + SameSite

**Dashboard** — KPI, pipeline podle stavu, „Čeká na tebe“ (další krok u každého videa), mapa kapitol,
připravenost (klíče, e-book, pózy, ffmpeg), kvóta ElevenLabs, grafy videí za týden a API nákladů, poslední rendery a aktivita.

**Workflow videa** (stavy Nápad → Scénář → Schváleno → Čeká na audio → Render → Hotovo → Publikováno)
1. **Téma** — Claude navrhne 3–5 témat z nepoužitých kapitol, nebo vlastní téma, nebo ze zásobníku (hromadně 10 témat)
2. **Scénář** — Claude vrátí JSON přes structured outputs, aplikace ho zvaliduje (60–80 slov, věty do 12 slov,
   jeden *akcent*, poslední scéna Point_down, text bez tagů = mluvený text, zakázané sliby…) a chyby nechá automaticky opravit.
   Editor scén s živým náhledem videa přímo v prohlížeči, přegenerování scény/hooku, historie verzí, JSON editor.
3. **Setup ElevenLabs** — text po částech s tagy a stability, tlačítko Kopírovat, profil hlasu, oba `.md` soubory
4. **Audio** — přetažení `cast1–n.mp3`, více takeů na část, výběr nejlepšího, kontrola délky (±15 %),
   volitelně generování hlasu přímo přes ElevenLabs API
5. **Render a kontrola** — jedním tlačítkem s průběhem; automatická kontrola konce řeči (±50 ms), délky,
   hlasitosti (−16 ± 1 LUFS) a zeleného lemu; kontaktní arch z MP4. Připomínky ke scénám → Claude upraví spec → render `_v2`, `_v3`
6. **Export** — MP4, popisek + hashtagy ke kopírování, `.md` zálohy, `video_spec.json`, `timeline.json`, stav Publikováno s odkazy

**Nastavení — hraní s klíči, hlasy a modely**
- **API klíče** — více klíčů na poskytovatele (Anthropic, ElevenLabs), přepínání aktivního, test připojení, šifrování AES-256-GCM
- **Hlasy** — profily (Josef / Multilingual v2 a cílový Eleven v3 s tagy), výběr hlasu z knihovny ElevenLabs s ukázkami,
  slidery Stability / Similarity / Style / Speed, stability po náladách, okamžitý test hlasu
- **Modely** — model, effort a max tokenů pro každou úlohu (témata, scénář, připomínky, scéna), načtení modelů z API,
  záložní model při odmítnutí, přikládání PDF e-booku, doplněk systémového promptu
- Obsah a pravidla (tón, zakázáno, rozsahy, tempo hlasu, výslovnost „e-booku → íbůku“), brand a CTA (barvy, obálka, logo),
  render a rozvržení (zóny 1080 × 1920, LUFS, prahy ticha, chroma key), vzory názvů souborů, systém a záloha

**Laboratoř** — A/B porovnání dvou nastavení hlasu, Claude playground (model, effort, tokeny, cena), kontrola textu.

**Avatar a šablony** — nahrání 13 póz na zeleném pozadí (předklíčování jednou: prahy 15–70, eroze, rozmazání, despill),
mapování názvů póz na soubory, knihovna 15 grafických šablon s živým náhledem a parametry.

## Spuštění

Potřeba: **Node.js 22.13+** a **ffmpeg** v `PATH`.

```bash
npm install
npm run dev        # http://localhost:3000 → /setup vytvoří první účet
```

Produkce:

```bash
npm run build
APP_SECRET=… DATA_DIR=/var/lib/j5m npm start
```

nebo Docker (obsahuje ffmpeg):

```bash
docker build -t j5m-studio .
docker run -p 3000:3000 -v j5m-data:/data -e APP_SECRET=… j5m-studio
```

Render běží na CPU (bez GPU), ~30 s na 30s video na 2 jádrech. Proměnné prostředí viz `.env.example`.

### Render bez webu

```bash
npm run render -- <video_id>   # nová verze existujícího videa
npm run render -- --demo       # ukázkové video se syntetickým audiem (test pipeline)
```

## Statická verze — GitHub Pages

Celá aplikace běží i bez serveru, čistě v prohlížeči: **https://ggbosky.github.io/jeste5minut-creator/**

| Serverová verze (Next.js) | Statická verze (GitHub Pages) |
|---|---|
| SQLite + soubory na serveru | IndexedDB v prohlížeči (data jen na tomto zařízení) |
| API na serveru | service worker (`web/sw/`) obsluhuje stejné `api/*` endpointy |
| render přes ffmpeg | render přes WebCodecs (H.264 + AAC) a mp4-muxer — v Chrome/Edge |
| hesla scrypt, klíče AES-GCM | hesla PBKDF2, klíče AES-GCM v trezoru zabaleném heslem uživatele |
| Claude a ElevenLabs volá server | volání jdou přímo z prohlížeče na api.anthropic.com a api.elevenlabs.io |

Omezení statické verze: přihlášení chrání data jen v rámci jednoho prohlížeče (není to serverové zabezpečení),
render běží v otevřené kartě, data se nesdílí mezi zařízeními (zálohu stáhneš v Nastavení → Systém).
Firefox zatím neumí kódovat AAC, audio pak bude Opus — pro Instagram použij Chrome nebo Edge.

```bash
npm run web:build     # → dist-web/
npm run web:preview   # http://localhost:4173
```

Nasazení: workflow `.github/workflows/pages.yml` při pushi do `main` (nebo vývojové větve) sestaví `dist-web/` a nasadí ho.
Jednou je potřeba v repozitáři zapnout **Settings → Pages → Source: GitHub Actions**.

## Architektura

| Část | Kde | Poznámka |
|---|---|---|
| Web + API | Next.js 15 (App Router), `src/app` | stránky v `(app)`, API v `api/` |
| Databáze | SQLite (`node:sqlite`), `src/lib/db.ts` | migrace + seed (kapitoly, pózy, profily hlasu) |
| Auth | `src/lib/auth.ts`, `authflow.ts`, `crypto.ts` | scrypt, sessions, TOTP, AES-GCM pro klíče |
| Scénář | `src/lib/script.ts` | zod schéma + všechny kontroly (sdílené s editorem) |
| LLM | `src/lib/llm.ts` | Anthropic SDK, structured outputs, effort, fallback, PDF e-booku |
| ElevenLabs | `src/lib/elevenlabs.ts` | hlasy, TTS, Scribe STT (časy slov), kvóta |
| Výstupy | `src/lib/outputs.ts` | názvy souborů, `ElevenLabs.md`, `Strih.md`, `video_spec.json` |
| Audio | `src/lib/audio.ts` | ořez ticha, 2průchodový loudnorm jednou, spojení s pauzou, SFX generované v kódu, limiter |
| Časování | `src/lib/timing.ts`, `src/render/timeline.ts` | STT zarovnané na text, jinak slabiky v úsecích řeči → `timeline.json` |
| Renderer | `src/render/*` | čistá funkce `frame(t)` na Canvas 2D — stejný kód kreslí náhled v prohlížeči i MP4 na serveru |
| Pipeline | `src/lib/pipeline.ts` | fronta renderů, snímky → ffmpeg (H.264 CRF 18, AAC 192k, faststart), kontrola, kontaktní arch |

Poučení z výroby zapracovaná v kódu: normalizace jen jednou + kontrola konce řeči po exportu, délku řídí hlas
(odhad 2,1 slova/s), postava 800 px a titulek na y 1040, gesto 1,2–1,6 s pak Original (u CTA zpět na Point_down na „Odkaz“),
výchozí výplň prázdných scén, pevné pořadí vrstev v šablonách (hlavičky sloupců navrchu), pózy předklíčované jednou,
obálka a logo jako konfigurace brandu.

## Otevřené otázky z podkladu — jak je aplikace řeší

- **Josef / Multilingual v2 vs. Eleven v3 s tagy** — oba profily existují, výchozí se přepíná v Nastavení → Hlasy.
- **Cílová délka 27 s vs. délka podle hlasu** — délku řídí hlas; cíl a tolerance jsou v Nastavení → Obsah.
- **Kdo píše video_spec** — Claude rovnou vyplní šablonu, parametry a události v JSON scénáře; spec se z něj skládá deterministicky
  a dá se upravit formulářem v editoru.
- **Zvukové efekty** — generují se v kódu (pop, tick, swoosh), žádné licence.
- **Publikace** — zatím ručně; aplikace připraví soubory a eviduje stav a odkazy.
- **Kde leží pózy** — v datové složce serveru, přístup jen přihlášeným uživatelům.
