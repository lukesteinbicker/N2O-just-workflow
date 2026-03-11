// Platform API server: Apollo Server 5 + Supabase Postgres, serves the N2O GraphQL schema on port 4000.
import "dotenv/config";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import jwt from "jsonwebtoken";
import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./resolvers/index.js";
import { getPool, closePool } from "./db.js";
import { createLoaders } from "./loaders.js";
import { auditLogPlugin } from "./plugins/audit-log.js";
import type { CurrentUser } from "./context.js";

const PORT = parseInt(process.env.PORT ?? "4000");
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const DEV_MODE = process.env.N2O_DEV_MODE === "true";

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [auditLogPlugin],
});

const pool = getPool();

const { url } = await startStandaloneServer(server, {
  listen: { port: PORT },
  context: async ({ req }) => {
    let currentUser: CurrentUser | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ") && JWT_SECRET) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET) as { email?: string };
        if (decoded.email) {
          const { rows } = await pool.query(
            `SELECT name, email, access_role FROM developers WHERE email = $1`,
            [decoded.email]
          );
          if (rows.length > 0) {
            currentUser = {
              name: rows[0].name,
              email: rows[0].email,
              accessRole: rows[0].access_role,
            };
          }
        }
      } catch {
        // Invalid token — currentUser stays null
      }
    } else if (!authHeader && DEV_MODE) {
      // Dev mode: default to admin when no auth header
      currentUser = { name: "whsimonds", accessRole: "admin", email: "dev@local" };
    }

    return {
      db: pool,
      loaders: createLoaders(pool),
      currentUser,
    };
  },
});

console.log(`N2O Data Platform API ready at ${url}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});
