import type { ApolloServerPlugin } from "@apollo/server";
import type { Context } from "../context.js";

export const auditLogPlugin: ApolloServerPlugin<Context> = {
  async requestDidStart() {
    return {
      async willSendResponse({ contextValue, operation, request }) {
        // Only log mutations
        if (operation?.operation !== "mutation") return;

        // Skip introspection
        const opName = operation.name?.value ?? "unknown";
        if (opName.startsWith("__")) return;

        const performer = contextValue.currentUser?.name ?? "anonymous";

        try {
          await contextValue.db.query(
            `INSERT INTO audit_logs (table_name, record_id, action, new_data, performed_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              "graphql",
              opName,
              opName,
              JSON.stringify(request.variables ?? {}),
              performer,
            ]
          );
        } catch {
          // Don't let audit logging failures break the request
        }
      },
    };
  },
};
