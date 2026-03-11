import { GraphQLError } from "graphql";
import type { Context } from "./context.js";

export function requireAdmin(ctx: Context): void {
  if (!ctx.currentUser || ctx.currentUser.accessRole !== "admin") {
    throw new GraphQLError("Admin access required", {
      extensions: { code: "FORBIDDEN" },
    });
  }
}

export function isAdmin(ctx: Context): boolean {
  return ctx.currentUser?.accessRole === "admin";
}

export function currentUserName(ctx: Context): string | null {
  return ctx.currentUser?.name ?? null;
}
