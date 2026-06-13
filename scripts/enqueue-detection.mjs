// One-off: enqueue canonical-forum-post detection for the N most recent proposals that
// don't have a canonical thread yet. Publishes QStash tasks to the live endpoint (same
// path spawn-on-create uses); the endpoint self-reschedules with backoff from there.
//
//   node scripts/enqueue-detection.mjs [limit]   # default 10
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Client } from "@upstash/qstash";

const LIMIT = Number(process.argv[2] || 10);
const APP_URL = "https://proposal-reviewer-portal.vercel.app";
const root = fileURLToPath(new URL("..", import.meta.url));
const env = readFileSync(root + ".env.local", "utf8");
const getEnv = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");

const POSTGRES_URL = getEnv("POSTGRES_URL");
const QSTASH_TOKEN = getEnv("QSTASH_TOKEN");
if (!POSTGRES_URL || !QSTASH_TOKEN) throw new Error("need POSTGRES_URL and QSTASH_TOKEN in .env.local");

// pooler connection (direct host is IPv6-only/unreachable here)
const m = POSTGRES_URL.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@(db\.([^.]+)\.supabase\.co):(\d+)\/(.+)$/);
const [, , password, , ref, , database] = m;
const REGIONS = ["us-east-1","us-east-2","us-west-1","us-west-2","ca-central-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"];
async function connect() {
  for (const region of REGIONS) {
    const c = new pg.Client({ host: `aws-0-${region}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, password, database, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 });
    try { await c.connect(); await c.query("SELECT 1"); return c; } catch { await c.end().catch(() => {}); }
  }
  throw new Error("no pooler region accepted the connection");
}

const db = await connect();
let rows;
try {
  ({ rows } = await db.query(
    `SELECT ps.proposal_id, ps.title
     FROM proposals_seen ps
     LEFT JOIN proposal_forum_threads ft
       ON ft.proposal_id::text = ps.proposal_id::text AND ft.is_canonical = true
     WHERE ft.proposal_id IS NULL
     ORDER BY ps.seen_at DESC
     LIMIT $1`,
    [LIMIT]
  ));
} finally {
  await db.end();
}

console.log(`${rows.length} recent proposal(s) without a canonical thread:`);
const qstash = new Client({ token: QSTASH_TOKEN });
let i = 0;
for (const r of rows) {
  const delay = i * 20; // stagger to be gentle on the forum
  const res = await qstash.publishJSON({
    url: `${APP_URL}/api/detect-forum-post`,
    body: { proposalId: String(r.proposal_id), attempt: 0 },
    delay,
  });
  console.log(`  enqueued #${r.proposal_id} (delay ${delay}s, msg ${res.messageId})  ${(r.title || "").slice(0, 50)}`);
  i++;
}
console.log(`\n✅ fired ${rows.length} detection task(s). They self-reschedule with backoff until the canonical thread is found.`);
