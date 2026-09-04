import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "migrations");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: databaseUrl });

async function migrations() {
  return (await readdir(migrationsDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
}

async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(738501)");
    await ensureLedger(client);
    const applied = new Map((await client.query("SELECT version, checksum FROM schema_migrations")).rows.map((row) => [row.version, row.checksum]));
    for (const name of await migrations()) {
      const source = await readFile(path.join(migrationsDirectory, name), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [name, checksum]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally { await client.query("SELECT pg_advisory_unlock(738501)").catch(() => undefined); client.release(); }
}

async function status() {
  const client = await pool.connect();
  try { await ensureLedger(client); console.log(JSON.stringify((await client.query("SELECT version, applied_at FROM schema_migrations ORDER BY version")).rows)); }
  finally { client.release(); }
}

try { if (process.argv[2] === "status") await status(); else await migrate(); } finally { await pool.end(); }
