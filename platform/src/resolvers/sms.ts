// SMS resolvers: phone registration, notification preferences, test SMS, identity resolution.
import { GraphQLError } from "graphql";
import type { Context } from "../context.js";
import { queryOne } from "../db-adapter.js";
import { requireAdmin, isAdmin, currentUserName } from "../auth.js";
import { sendSms, E164_REGEX } from "../services/twilio-api.js";
import { mapDeveloper } from "./mappers.js";

/**
 * Resolve a phone number to a developer record.
 * Used by the SMS webhook handler (Task 3) to identify inbound callers.
 */
export async function resolveIdentity(
  db: any,
  phoneNumber: string
): Promise<{
  name: string;
  accessRole: string;
  timeTrackingUserId: number | null;
  fullName: string;
} | null> {
  const row = await queryOne(
    db,
    "SELECT name, full_name, access_role, time_tracking_user_id FROM developers WHERE phone_number = ?",
    [phoneNumber]
  );
  if (!row) return null;
  return {
    name: row.name,
    fullName: row.full_name,
    accessRole: row.access_role ?? "engineer",
    timeTrackingUserId: row.time_tracking_user_id ?? null,
  };
}

export const smsResolvers = {
  Mutation: {
    registerPhone: async (
      _: any,
      args: { developer: string; phoneNumber: string },
      ctx: Context
    ) => {
      requireAdmin(ctx);

      // Validate E.164 format
      if (!E164_REGEX.test(args.phoneNumber)) {
        throw new GraphQLError(
          `Invalid phone number format. Must be E.164 (e.g., +12025551234)`,
          { extensions: { code: "BAD_USER_INPUT" } }
        );
      }

      // Check if phone number is already registered to another developer
      const existing = await queryOne(
        ctx.db,
        "SELECT name FROM developers WHERE phone_number = ? AND name != ?",
        [args.phoneNumber, args.developer]
      );
      if (existing) {
        throw new GraphQLError(
          `Phone number ${args.phoneNumber} is already registered to ${existing.name}`,
          { extensions: { code: "BAD_USER_INPUT" } }
        );
      }

      // Check developer exists
      const dev = await queryOne(
        ctx.db,
        "SELECT * FROM developers WHERE name = ?",
        [args.developer]
      );
      if (!dev) {
        throw new GraphQLError(`Developer '${args.developer}' not found`);
      }

      // Update phone number
      await ctx.db.query(
        "UPDATE developers SET phone_number = $1 WHERE name = $2",
        [args.phoneNumber, args.developer]
      );

      // Return updated developer
      const updated = await queryOne(
        ctx.db,
        "SELECT * FROM developers WHERE name = ?",
        [args.developer]
      );
      return mapDeveloper(updated);
    },

    updateNotificationPreferences: async (
      _: any,
      args: {
        developer: string;
        enabled?: boolean;
        digestTime?: string;
        digestDays?: string;
        quietStart?: string;
        quietEnd?: string;
        timezone?: string;
      },
      ctx: Context
    ) => {
      // Admin can update anyone; engineer can only update self
      if (!isAdmin(ctx) && args.developer !== currentUserName(ctx)) {
        throw new GraphQLError(
          "You don't have permission to update another developer's notification preferences",
          { extensions: { code: "FORBIDDEN" } }
        );
      }

      // Upsert notification preferences
      // Convert boolean to integer for SQLite compatibility
      const enabledVal = args.enabled != null ? (args.enabled ? 1 : 0) : 0;
      await ctx.db.query(
        `INSERT INTO notification_preferences (developer, enabled, digest_time, digest_days, quiet_start, quiet_end, timezone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(developer) DO UPDATE SET
           enabled = COALESCE(excluded.enabled, notification_preferences.enabled),
           digest_time = COALESCE(excluded.digest_time, notification_preferences.digest_time),
           digest_days = COALESCE(excluded.digest_days, notification_preferences.digest_days),
           quiet_start = COALESCE(excluded.quiet_start, notification_preferences.quiet_start),
           quiet_end = COALESCE(excluded.quiet_end, notification_preferences.quiet_end),
           timezone = COALESCE(excluded.timezone, notification_preferences.timezone),
           updated_at = CURRENT_TIMESTAMP`,
        [
          args.developer,
          enabledVal,
          args.digestTime ?? "08:00",
          args.digestDays ?? "Mon,Tue,Wed,Thu,Fri",
          args.quietStart ?? null,
          args.quietEnd ?? null,
          args.timezone ?? "America/New_York",
        ]
      );

      // Read back the preferences
      const row = await queryOne(
        ctx.db,
        "SELECT * FROM notification_preferences WHERE developer = ?",
        [args.developer]
      );

      return {
        enabled: row.enabled === true || row.enabled === 1,
        digestTime: row.digest_time,
        digestDays: row.digest_days,
        quietStart: row.quiet_start,
        quietEnd: row.quiet_end,
        timezone: row.timezone,
      };
    },

    sendTestSms: async (
      _: any,
      args: { developer: string },
      ctx: Context
    ) => {
      requireAdmin(ctx);

      // Look up developer's phone number
      const dev = await queryOne(
        ctx.db,
        "SELECT phone_number FROM developers WHERE name = ?",
        [args.developer]
      );
      if (!dev || !dev.phone_number) {
        throw new GraphQLError(
          `Developer '${args.developer}' has no phone number registered`,
          { extensions: { code: "BAD_USER_INPUT" } }
        );
      }

      await sendSms(dev.phone_number, "NOS SMS connected. You're all set!");
      return true;
    },
  },
};
