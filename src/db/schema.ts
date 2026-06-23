import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  fullName: text("full_name"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  memberTier: text("member_tier").default("standard").notNull(),
  preferredPlatforms: text("preferred_platforms")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique("payout_accounts_user_id_unique")
      .references(() => profiles.userId, {
        onDelete: "cascade",
      }),
    method: text("method").default("bank").notNull(),
    provider: text("provider").notNull(),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    status: text("status").default("unverified").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "payout_accounts_method_check",
      sql`${table.method} = 'bank'`,
    ),
    check(
      "payout_accounts_status_check",
      sql`${table.status} in ('unverified', 'verified', 'rejected', 'disabled')`,
    ),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

export type PayoutAccountRow = typeof payoutAccounts.$inferSelect;
export type NewPayoutAccountRow = typeof payoutAccounts.$inferInsert;