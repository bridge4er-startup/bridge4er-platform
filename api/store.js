import { kv } from "@vercel/kv";
import { sql } from "@vercel/postgres";

const STORE_KEY = "bbdmp:store";
const defaultStore = { dailyReports: {}, structureEntries: [], labData: {} };

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bbdmp_store (
      id text PRIMARY KEY,
      payload jsonb,
      updated_at timestamptz DEFAULT now()
    );
  `;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  return JSON.parse(raw);
}

function normalizeStore(data) {
  if (!data || typeof data !== "object") return defaultStore;
  return {
    dailyReports: data.dailyReports || {},
    structureEntries: data.structureEntries || [],
    labData: data.labData || {}
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    try {
      const kvStore = await kv.get(STORE_KEY);
      if (kvStore) {
        res.status(200).json(normalizeStore(kvStore));
        return;
      }

      await ensureTable();
      const result = await sql`SELECT payload FROM bbdmp_store WHERE id = ${STORE_KEY}`;
      if (result.rows.length) {
        const payload = normalizeStore(result.rows[0].payload);
        await kv.set(STORE_KEY, payload);
        res.status(200).json(payload);
        return;
      }

      res.status(200).json(defaultStore);
    } catch (err) {
      res.status(500).json({ error: "Failed to load store." });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readJson(req);
      const payload = normalizeStore(body);

      await ensureTable();
      await sql`
        INSERT INTO bbdmp_store (id, payload)
        VALUES (${STORE_KEY}, ${payload})
        ON CONFLICT (id)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();
      `;

      await kv.set(STORE_KEY, payload);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save store." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
