// Poll the DB to watch canonical threads get written by the detection tasks.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const IDS = (process.argv.slice(2).length ? process.argv.slice(2) : [
  "142265","142255","142254","142133","142130","142129","142124","141982","141980","141981",
]);
const root = fileURLToPath(new URL("..", import.meta.url));
const env = readFileSync(root + ".env.local", "utf8");
const POSTGRES_URL = (env.match(/^POSTGRES_URL=(.*)$/m) || [])[1].trim();
const m = POSTGRES_URL.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@(db\.([^.]+)\.supabase\.co):(\d+)\/(.+)$/);
const [, , password, , ref, , database] = m;
const REGIONS = ["us-east-1","us-east-2","us-west-1","us-west-2","ca-central-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"];
async function connect() {
  for (const region of REGIONS) {
    const c = new pg.Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, password, database, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 });
    try { await c.connect(); await c.query("SELECT 1"); return c; } catch { await c.end().catch(() => {}); }
  }
  throw new Error("no pooler region");
}
const db = await connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + 5 * 60 * 1000;
let done = new Set();
try {
  while (Date.now() < deadline) {
    const { rows } = await db.query(
      `SELECT proposal_id::text id, forum_url FROM proposal_forum_threads
       WHERE is_canonical = true AND proposal_id::text = ANY($1)`,
      [IDS]
    );
    for (const r of rows) {
      if (!done.has(r.id)) { done.add(r.id); console.log(`✅ #${r.id} → ${r.forum_url}`); }
    }
    console.log(`[${new Date().toISOString().slice(11,19)}] ${done.size}/${IDS.length} canonical so far`);
    if (done.size === IDS.length) break;
    await sleep(45000);
  }
} finally {
  await db.end();
}
const missing = IDS.filter((id) => !done.has(id));
console.log(`\nDONE: ${done.size}/${IDS.length} resolved.` + (missing.length ? ` Still pending (will retry via backoff): ${missing.join(", ")}` : " all resolved!"));
