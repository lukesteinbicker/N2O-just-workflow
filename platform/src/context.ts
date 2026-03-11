import type { SupabasePool } from "./db.js";
import type { Loaders } from "./loaders.js";

export interface CurrentUser {
  name: string;
  accessRole: "admin" | "engineer";
  email: string;
}

export interface Context {
  db: SupabasePool;
  loaders: Loaders;
  currentUser: CurrentUser | null;
}
