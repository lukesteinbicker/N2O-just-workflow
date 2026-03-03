// HTTP-based SQL executor using the Supabase Management API.
// Avoids IPv6/pooler connectivity issues by going through HTTPS (IPv4).

const SUPABASE_REF = process.env.SUPABASE_REF ?? "mktnhfbpvksnyfzipuph";
const SUPABASE_ACCESS_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN ??
  "sbp_0432018dd9867db471847a730df45a97cc76f586";

const QUERY_URL = `https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`;

function escapeParam(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  // Escape single quotes by doubling them
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function interpolate(sql: string, params: any[]): string {
  let i = 0;
  return sql.replace(/\$(\d+)/g, (_, idx) => escapeParam(params[parseInt(idx) - 1]));
}

const CACHE_TTL_MS = 30_000; // 30s — dashboard data doesn't need sub-second freshness

interface CacheEntry {
  rows: any[];
  expiresAt: number;
}

export class SupabasePool {
  private cache = new Map<string, CacheEntry>();

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    const finalSql = params.length > 0 ? interpolate(sql, params) : sql;

    // Check cache
    const cached = this.cache.get(finalSql);
    if (cached && cached.expiresAt > Date.now()) {
      return { rows: cached.rows };
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(QUERY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: finalSql }),
      });
      if (res.status === 429 && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Supabase query failed (${res.status}): ${body}`);
      }
      const rows = await res.json();
      const result = Array.isArray(rows) ? rows : [];

      // Store in cache
      this.cache.set(finalSql, { rows: result, expiresAt: Date.now() + CACHE_TTL_MS });

      // Evict expired entries periodically (every 50 queries)
      if (this.cache.size > 100) {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
          if (entry.expiresAt <= now) this.cache.delete(key);
        }
      }

      return { rows: result };
    }
    throw new Error("Supabase query failed: max retries exceeded");
  }

  async end(): Promise<void> {
    this.cache.clear();
  }
}

let pool: SupabasePool | null = null;

export function getPool(): SupabasePool {
  if (!pool) {
    pool = new SupabasePool();
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
