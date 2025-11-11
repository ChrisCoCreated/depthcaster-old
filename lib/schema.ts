import { pgTable, uuid, text, bigint, boolean, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  fid: bigint("fid", { mode: "number" }).primaryKey(),
  username: text("username"),
  displayName: text("display_name"),
  pfpUrl: text("pfp_url"),
  preferences: jsonb("preferences"),
  usageStats: jsonb("usage_stats"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  usernameIdx: index("username_idx").on(table.username),
}));

export const curatorPacks = pgTable("curator_packs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  creatorFid: bigint("creator_fid", { mode: "number" }).notNull().references(() => users.fid),
  isPublic: boolean("is_public").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  creatorFidIdx: index("creator_fid_idx").on(table.creatorFid),
}));

export const curatorPackUsers = pgTable("curator_pack_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  packId: uuid("pack_id").notNull().references(() => curatorPacks.id, { onDelete: "cascade" }),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => ({
  packUserUnique: uniqueIndex("pack_user_unique").on(table.packId, table.userFid),
  userFidIdx: index("user_fid_idx").on(table.userFid),
}));

export const userPackSubscriptions = pgTable("user_pack_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  packId: uuid("pack_id").notNull().references(() => curatorPacks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPackUnique: uniqueIndex("user_pack_unique").on(table.userFid, table.packId),
  userFidSubscriptionIdx: index("user_fid_subscription_idx").on(table.userFid),
}));

export const packFavorites = pgTable("pack_favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  packId: uuid("pack_id").notNull().references(() => curatorPacks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPackFavoriteUnique: uniqueIndex("user_pack_favorite_unique").on(table.userFid, table.packId),
  userFidIdx: index("user_fid_favorite_idx").on(table.userFid),
}));

export const curatedCasts = pgTable("curated_casts", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull(),
  castData: jsonb("cast_data").notNull(),
  curatorFid: bigint("curator_fid", { mode: "number" }).references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashUnique: uniqueIndex("cast_hash_unique").on(table.castHash),
  curatorFidIdx: index("curator_fid_idx").on(table.curatorFid),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CuratorPack = typeof curatorPacks.$inferSelect;
export type NewCuratorPack = typeof curatorPacks.$inferInsert;
export type CuratorPackUser = typeof curatorPackUsers.$inferSelect;
export type NewCuratorPackUser = typeof curatorPackUsers.$inferInsert;
export type UserPackSubscription = typeof userPackSubscriptions.$inferSelect;
export type NewUserPackSubscription = typeof userPackSubscriptions.$inferInsert;
export type PackFavorite = typeof packFavorites.$inferSelect;
export type NewPackFavorite = typeof packFavorites.$inferInsert;
export type CuratedCast = typeof curatedCasts.$inferSelect;
export type NewCuratedCast = typeof curatedCasts.$inferInsert;

