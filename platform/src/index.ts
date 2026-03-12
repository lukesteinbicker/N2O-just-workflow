// Platform API server: Apollo Server 5 + Express + Supabase Postgres.
// Serves the NOS GraphQL schema on /graphql and SMS webhook on /sms/inbound.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import http from "node:http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import cors from "cors";
import express from "express";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./resolvers/index.js";
import { getPool, closePool, validateDbConfig } from "./db.js";
import { createLoaders } from "./loaders.js";
import { auditLogPlugin } from "./plugins/audit-log.js";
import type { CurrentUser } from "./context.js";
import { runSync, startSyncLoop, stopSyncLoop, isSyncing } from "./services/toggl-sync.js";

// Validate required env vars before starting
validateDbConfig();

const PORT = parseInt(process.env.PORT ?? "4000");
const DEV_MODE = process.env.NOS_DEV_MODE === "true";
const SUPABASE_URL = process.env.SUPABASE_URL ?? `https://${process.env.SUPABASE_REF}.supabase.co`;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

const app = express();
const httpServer = http.createServer(app);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [auditLogPlugin],
});

await server.start();

const pool = getPool();

// Mount GraphQL endpoint
app.use(
  "/graphql",
  cors<cors.CorsRequest>(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      let currentUser: CurrentUser | null = null;

      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const token = authHeader.slice(7);
          // Verify token via Supabase Auth API (supports ECC + HS256 keys)
          const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          });
          if (authRes.ok) {
            const user = await authRes.json();
            const email = user.email;
            if (email) {
              const { rows } = await pool.query(
                `SELECT name, email, access_role FROM developers WHERE email = $1`,
                [email]
              );
              if (rows.length > 0) {
                currentUser = {
                  name: rows[0].name,
                  email: rows[0].email,
                  accessRole: rows[0].access_role,
                };
              }
            }
          }
        } catch {
          // Auth verification failed — currentUser stays null
        }
      } else if (!authHeader && DEV_MODE) {
        // Dev mode: default to admin when no auth header
        currentUser = {
          name: "whsimonds",
          accessRole: "admin",
          email: "dev@local",
        };
      }

      const pageRoute = (req.headers["x-page-route"] as string) ?? null;

      return {
        db: pool,
        loaders: createLoaders(pool),
        currentUser,
        pageRoute,
      };
    },
  })
);

// SMS webhook placeholder (Task 3 will implement the full handler)
app.post("/sms/inbound", express.urlencoded({ extended: false }), (_req, res) => {
  res.sendStatus(200);
});

await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
console.log(`NOS Data Platform API ready at http://localhost:${PORT}/graphql`);

// Start Toggl sync: immediate first sync + 5-minute interval
if (process.env.TOGGL_API_TOKEN) {
  runSync(pool).catch((err) => console.error("Initial Toggl sync failed:", err));
  startSyncLoop(pool, 5 * 60 * 1000);
  console.log("Toggl sync loop started (5-minute interval)");
}

// Graceful shutdown
async function shutdown() {
  stopSyncLoop();
  // Wait for in-progress sync (up to 10 seconds)
  const deadline = Date.now() + 10_000;
  while (isSyncing() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await server.stop();
  httpServer.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await shutdown();
});

process.on("SIGTERM", async () => {
  await shutdown();
});
