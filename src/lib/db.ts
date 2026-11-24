import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "./seed";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));

const MIGRATIONS: string[] = [
  // 1 — základ
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    pending_2fa INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    last4 TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    last_tested_at TEXT,
    test_status TEXT,
    test_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE voice_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    voice_id TEXT NOT NULL DEFAULT '',
    voice_name TEXT NOT NULL DEFAULT '',
    model_id TEXT NOT NULL,
    use_tags INTEGER NOT NULL DEFAULT 0,
    stability REAL NOT NULL DEFAULT 0.5,
    similarity REAL NOT NULL DEFAULT 0.75,
    style REAL NOT NULL DEFAULT 0,
    speed REAL NOT NULL DEFAULT 1,
    speaker_boost INTEGER NOT NULL DEFAULT 1,
    stability_emotion REAL NOT NULL DEFAULT 0.45,
    stability_normal REAL NOT NULL DEFAULT 0.5,
    stability_tips REAL NOT NULL DEFAULT 0.55,
    notes TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE chapters (
    n INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    idea TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter INTEGER NOT NULL,
    hook_type TEXT NOT NULL,
    title TEXT NOT NULL,
    angle TEXT NOT NULL DEFAULT '',
    hook_line TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog',
    video_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    hook_type TEXT NOT NULL,
    angle TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idea',
    script TEXT,
    script_locked INTEGER NOT NULL DEFAULT 0,
    voice_profile_id INTEGER,
    spec TEXT,
    timeline TEXT,
    audio_stale INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT,
    published_at TEXT,
    publish_info TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE script_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    script TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE audio_takes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    part INTEGER NOT NULL,
    file TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'upload',
    duration_s REAL,
    selected INTEGER NOT NULL DEFAULT 0,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE renders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT '',
    progress REAL NOT NULL DEFAULT 0,
    log TEXT NOT NULL DEFAULT '',
    output_file TEXT,
    contact_sheet TEXT,
    qa TEXT,
    spec TEXT,
    timeline TEXT,
    notes TEXT NOT NULL DEFAULT '',
    duration_s REAL,
    render_seconds REAL,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );
  CREATE TABLE revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    render_version INTEGER,
    scene INTEGER,
    comment TEXT NOT NULL,
    patch TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE poses (
    key TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    usage TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'pose',
    in_script INTEGER NOT NULL DEFAULT 1,
    processed_file TEXT,
    source_file TEXT,
    updated_at TEXT
  );
  CREATE TABLE assets (
    key TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    characters INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_activity_created ON activity(created_at);
  CREATE INDEX idx_usage_created ON api_usage(created_at);
  CREATE INDEX idx_renders_video ON renders(video_id);
  CREATE INDEX idx_takes_video ON audio_takes(video_id);
  `,
];

type G = typeof globalThis & { __j5mDb?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let v = row.user_version;
  while (v < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      v++;
      db.exec(`PRAGMA user_version = ${v}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  seedDatabase(db);
  return db;
}

export function db(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__j5mDb) g.__j5mDb = open();
  return g.__j5mDb;
}

// Malé pomocníky — node:sqlite vrací null-prototype objekty
export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])).map((r) => ({ ...r })) as T[];
}
export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const r = db().prepare(sql).get(...(params as never[]));
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...(params as never[]));
}
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function dataPath(...p: string[]) {
  const full = path.join(DATA_DIR, ...p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
}
