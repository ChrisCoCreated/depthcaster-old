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

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'curator', 'admin', 'superadmin'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userRoleUnique: uniqueIndex("user_role_unique").on(table.userFid, table.role),
  userFidIdx: index("user_roles_user_fid_idx").on(table.userFid),
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
  castCreatedAt: timestamp("cast_created_at"),
  curatorFid: bigint("curator_fid", { mode: "number" }).references(() => users.fid),
  topReplies: jsonb("top_replies"),
  repliesUpdatedAt: timestamp("replies_updated_at"),
  conversationFetchedAt: timestamp("conversation_fetched_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Extracted metadata fields for efficient querying
  castText: text("cast_text"),
  castTextLength: integer("cast_text_length").default(0),
  authorFid: bigint("author_fid", { mode: "number" }).references(() => users.fid, { onDelete: "set null" }),
  likesCount: integer("likes_count").default(0),
  recastsCount: integer("recasts_count").default(0),
  repliesCount: integer("replies_count").default(0),
  engagementScore: integer("engagement_score").default(0),
  parentHash: text("parent_hash"),
}, (table) => ({
  castHashIdx: index("cast_hash_idx").on(table.castHash),
  curatorFidIdx: index("curator_fid_idx").on(table.curatorFid),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
  castCreatedAtIdx: index("curated_casts_cast_created_at_idx").on(table.castCreatedAt),
  castTextLengthEngagementScoreIdx: index("curated_casts_cast_text_length_engagement_score_idx").on(table.castTextLength, table.engagementScore),
  authorFidCastCreatedAtIdx: index("curated_casts_author_fid_cast_created_at_idx").on(table.authorFid, table.castCreatedAt),
  parentHashIdx: index("curated_casts_parent_hash_idx").on(table.parentHash),
}));

export const curatorCastCurations = pgTable("curator_cast_curations", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  curatorFid: bigint("curator_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashCuratorUnique: uniqueIndex("cast_hash_curator_unique").on(table.castHash, table.curatorFid),
  castHashIdx: index("curator_cast_curations_cast_hash_idx").on(table.castHash),
  curatorFidIdx: index("curator_cast_curations_curator_fid_idx").on(table.curatorFid),
  castHashCreatedAtIdx: index("curator_cast_curations_cast_hash_created_at_idx").on(table.castHash, table.createdAt),
}));

export const userWatches = pgTable("user_watches", {
  id: uuid("id").defaultRandom().primaryKey(),
  watcherFid: bigint("watcher_fid", { mode: "number" }).notNull().references(() => users.fid),
  watchedFid: bigint("watched_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  watcherWatchedUnique: uniqueIndex("watcher_watched_unique").on(table.watcherFid, table.watchedFid),
  watcherFidIdx: index("watcher_fid_idx").on(table.watcherFid),
}));

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  neynarWebhookId: text("neynar_webhook_id").notNull().unique(),
  type: text("type").notNull(), // 'user-watch', 'curated-reply', or 'curated-quote'
  config: jsonb("config").notNull(),
  url: text("url").notNull(),
  secret: text("secret"), // Webhook secret for signature verification
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("type_idx").on(table.type),
  neynarWebhookIdIdx: index("neynar_webhook_id_idx").on(table.neynarWebhookId),
}));

export const curatedCastInteractions = pgTable("curated_cast_interactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  curatedCastHash: text("curated_cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  targetCastHash: text("target_cast_hash").notNull(), // Hash of the cast being interacted with (could be curated cast or any reply in thread)
  interactionType: text("interaction_type").notNull(), // 'reply', 'like', 'recast', 'quote'
  userFid: bigint("user_fid", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  curatedCastTargetTypeUserUnique: uniqueIndex("curated_cast_target_type_user_unique").on(table.curatedCastHash, table.targetCastHash, table.interactionType, table.userFid),
  curatedCastHashCreatedAtIdx: index("curated_cast_hash_created_at_idx").on(table.curatedCastHash, table.createdAt),
}));

export const userNotifications = pgTable("user_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  type: text("type").notNull(), // 'cast.created'
  castHash: text("cast_hash").notNull(),
  castData: jsonb("cast_data").notNull(),
  authorFid: bigint("author_fid", { mode: "number" }).notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userFidIsReadCreatedAtIdx: index("user_fid_is_read_created_at_idx").on(table.userFid, table.isRead, table.createdAt),
  userFidCastHashUnique: uniqueIndex("user_fid_cast_hash_unique").on(table.userFid, table.castHash),
}));

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userFidIdx: index("push_subscriptions_user_fid_idx").on(table.userFid),
  endpointIdx: index("push_subscriptions_endpoint_idx").on(table.endpoint),
  endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
}));

export const castTags = pgTable("cast_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull(),
  tag: text("tag").notNull(),
  adminFid: bigint("admin_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashTagUnique: uniqueIndex("cast_hash_tag_unique").on(table.castHash, table.tag),
  castHashIdx: index("cast_tags_cast_hash_idx").on(table.castHash),
  tagIdx: index("cast_tags_tag_idx").on(table.tag),
  adminFidIdx: index("cast_tags_admin_fid_idx").on(table.adminFid),
}));

export const castReplies = pgTable("cast_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  curatedCastHash: text("curated_cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  replyCastHash: text("reply_cast_hash").notNull(),
  castData: jsonb("cast_data").notNull(),
  castCreatedAt: timestamp("cast_created_at"),
  parentCastHash: text("parent_cast_hash"),
  rootCastHash: text("root_cast_hash").notNull(),
  replyDepth: integer("reply_depth").default(0).notNull(),
  isQuoteCast: boolean("is_quote_cast").default(false).notNull(),
  quotedCastHash: text("quoted_cast_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Extracted metadata fields for efficient querying
  castText: text("cast_text"),
  castTextLength: integer("cast_text_length").default(0),
  authorFid: bigint("author_fid", { mode: "number" }).references(() => users.fid, { onDelete: "set null" }),
  likesCount: integer("likes_count").default(0),
  recastsCount: integer("recasts_count").default(0),
  repliesCount: integer("replies_count").default(0),
  engagementScore: integer("engagement_score").default(0),
}, (table) => ({
  replyCastHashUnique: uniqueIndex("reply_cast_hash_unique").on(table.replyCastHash),
  curatedCastHashIdx: index("cast_replies_curated_cast_hash_idx").on(table.curatedCastHash),
  quotedCastHashIdx: index("cast_replies_quoted_cast_hash_idx").on(table.quotedCastHash),
  curatedCastHashReplyDepthIdx: index("cast_replies_curated_cast_hash_reply_depth_idx").on(table.curatedCastHash, table.replyDepth),
  curatedCastHashCreatedAtIdx: index("cast_replies_curated_cast_hash_created_at_idx").on(table.curatedCastHash, table.createdAt),
  curatedCastHashCastCreatedAtIdx: index("cast_replies_curated_cast_hash_cast_created_at_idx").on(table.curatedCastHash, table.castCreatedAt),
  castTextLengthEngagementScoreIdx: index("cast_replies_cast_text_length_engagement_score_idx").on(table.castTextLength, table.engagementScore),
  authorFidCastCreatedAtIdx: index("cast_replies_author_fid_cast_created_at_idx").on(table.authorFid, table.castCreatedAt),
  parentHashIdx: index("cast_replies_parent_hash_idx").on(table.parentCastHash),
}));

export const buildIdeas = pgTable("build_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"), // For build ideas
  castHash: text("cast_hash"), // For feedback - optional cast hash or link
  type: text("type").notNull().default("build-idea"), // 'build-idea' or 'feedback'
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("build_ideas_created_at_idx").on(table.createdAt),
  userFidIdx: index("build_ideas_user_fid_idx").on(table.userFid),
  typeIdx: index("build_ideas_type_idx").on(table.type),
  castHashIdx: index("build_ideas_cast_hash_idx").on(table.castHash),
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
export type CuratorCastCuration = typeof curatorCastCurations.$inferSelect;
export type NewCuratorCastCuration = typeof curatorCastCurations.$inferInsert;
export type UserWatch = typeof userWatches.$inferSelect;
export type NewUserWatch = typeof userWatches.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type CuratedCastInteraction = typeof curatedCastInteractions.$inferSelect;
export type NewCuratedCastInteraction = typeof curatedCastInteractions.$inferInsert;
export type UserNotification = typeof userNotifications.$inferSelect;
export type NewUserNotification = typeof userNotifications.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type CastTag = typeof castTags.$inferSelect;
export type NewCastTag = typeof castTags.$inferInsert;
export type CastReply = typeof castReplies.$inferSelect;
export type NewCastReply = typeof castReplies.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type BuildIdea = typeof buildIdeas.$inferSelect;
export type NewBuildIdea = typeof buildIdeas.$inferInsert;

