import { pgTable, uuid, text, bigint, boolean, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  fid: bigint("fid", { mode: "number" }).primaryKey(),
  username: text("username"),
  displayName: text("display_name"),
  pfpUrl: text("pfp_url"),
  signerUuid: text("signer_uuid"),
  preferences: jsonb("preferences"),
  usageStats: jsonb("usage_stats"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  usernameIdx: index("username_idx").on(table.username),
  signerUuidIdx: index("signer_uuid_idx").on(table.signerUuid),
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
  qualityScore: integer("quality_score"),
  category: text("category"),
  qualityAnalyzedAt: timestamp("quality_analyzed_at"),
}, (table) => ({
  castHashIdx: index("cast_hash_idx").on(table.castHash),
  curatorFidIdx: index("curator_fid_idx").on(table.curatorFid),
  createdAtIdx: index("created_at_idx").on(table.createdAt),
  castCreatedAtIdx: index("curated_casts_cast_created_at_idx").on(table.castCreatedAt),
  castTextLengthEngagementScoreIdx: index("curated_casts_cast_text_length_engagement_score_idx").on(table.castTextLength, table.engagementScore),
  authorFidCastCreatedAtIdx: index("curated_casts_author_fid_cast_created_at_idx").on(table.authorFid, table.castCreatedAt),
  parentHashIdx: index("curated_casts_parent_hash_idx").on(table.parentHash),
  qualityScoreIdx: index("curated_casts_quality_score_idx").on(table.qualityScore),
  categoryIdx: index("curated_casts_category_idx").on(table.category),
  qualityCategoryIdx: index("curated_casts_quality_category_idx").on(table.qualityScore, table.category),
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
  type: text("type").notNull(), // 'cast.created', 'curated.quality_reply', 'curated.curated', 'curated.liked', 'curated.recast', 'curated.quality_score'
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
  qualityScore: integer("quality_score"),
  category: text("category"),
  qualityAnalyzedAt: timestamp("quality_analyzed_at"),
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
  qualityScoreIdx: index("cast_replies_quality_score_idx").on(table.qualityScore),
  categoryIdx: index("cast_replies_category_idx").on(table.category),
  qualityCategoryIdx: index("cast_replies_quality_category_idx").on(table.qualityScore, table.category),
}));

export const buildIdeas = pgTable("build_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"), // For build ideas
  castHash: text("cast_hash"), // For feedback - optional cast hash or link
  type: text("type").notNull().default("build-idea"), // 'build-idea' or 'feedback'
  feedbackType: text("feedback_type"), // For feedback: 'bug', 'feature', or 'feedback'
  status: text("status"), // 'backlog', 'in-progress', or 'complete'
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("build_ideas_created_at_idx").on(table.createdAt),
  userFidIdx: index("build_ideas_user_fid_idx").on(table.userFid),
  typeIdx: index("build_ideas_type_idx").on(table.type),
  castHashIdx: index("build_ideas_cast_hash_idx").on(table.castHash),
  statusIdx: index("build_ideas_status_idx").on(table.status),
}));

export const pageViews = pgTable("page_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).references(() => users.fid),
  pagePath: text("page_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pagePathIdx: index("page_views_page_path_idx").on(table.pagePath),
  userFidIdx: index("page_views_user_fid_idx").on(table.userFid),
  createdAtIdx: index("page_views_created_at_idx").on(table.createdAt),
  pagePathCreatedAtIdx: index("page_views_page_path_created_at_idx").on(table.pagePath, table.createdAt),
}));

export const feedViewSessions = pgTable("feed_view_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).references(() => users.fid),
  feedType: text("feed_type").notNull(), // 'curated', 'following', 'for-you', 'trending', etc.
  durationSeconds: integer("duration_seconds").notNull(),
  sortBy: text("sort_by"),
  curatorFids: jsonb("curator_fids"), // Array of curator FIDs if filtered
  packIds: jsonb("pack_ids"), // Array of pack IDs if filtered
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  feedTypeIdx: index("feed_view_sessions_feed_type_idx").on(table.feedType),
  userFidIdx: index("feed_view_sessions_user_fid_idx").on(table.userFid),
  createdAtIdx: index("feed_view_sessions_created_at_idx").on(table.createdAt),
  feedTypeCreatedAtIdx: index("feed_view_sessions_feed_type_created_at_idx").on(table.feedType, table.createdAt),
}));

export const castViews = pgTable("cast_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).references(() => users.fid),
  castHash: text("cast_hash").notNull(),
  authorFid: bigint("author_fid", { mode: "number" }).notNull(),
  feedType: text("feed_type"), // Which feed the cast was viewed in
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashIdx: index("cast_views_cast_hash_idx").on(table.castHash),
  feedTypeIdx: index("cast_views_feed_type_idx").on(table.feedType),
  userFidIdx: index("cast_views_user_fid_idx").on(table.userFid),
  createdAtIdx: index("cast_views_created_at_idx").on(table.createdAt),
  feedTypeCreatedAtIdx: index("cast_views_feed_type_created_at_idx").on(table.feedType, table.createdAt),
  userCastFeedUnique: uniqueIndex("cast_views_user_cast_feed_unique").on(table.userFid, table.castHash, table.feedType),
}));

// Aggregation tables for cost mitigation (30+ day data)
export const feedViewSessionsDaily = pgTable("feed_view_sessions_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date").notNull(), // Date (start of day)
  feedType: text("feed_type").notNull(),
  totalSessions: integer("total_sessions").default(0).notNull(),
  totalDurationSeconds: integer("total_duration_seconds").default(0).notNull(),
  uniqueUsers: integer("unique_users").default(0).notNull(),
  avgDuration: integer("avg_duration").default(0).notNull(), // Average duration in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dateFeedTypeUnique: uniqueIndex("feed_view_sessions_daily_date_feed_type_unique").on(table.date, table.feedType),
  dateIdx: index("feed_view_sessions_daily_date_idx").on(table.date),
  feedTypeIdx: index("feed_view_sessions_daily_feed_type_idx").on(table.feedType),
}));

export const castViewsDaily = pgTable("cast_views_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date").notNull(), // Date (start of day)
  feedType: text("feed_type").notNull(),
  castHash: text("cast_hash").notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  uniqueUsers: integer("unique_users").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dateFeedTypeCastUnique: uniqueIndex("cast_views_daily_date_feed_type_cast_unique").on(table.date, table.feedType, table.castHash),
  dateIdx: index("cast_views_daily_date_idx").on(table.date),
  feedTypeIdx: index("cast_views_daily_feed_type_idx").on(table.feedType),
  castHashIdx: index("cast_views_daily_cast_hash_idx").on(table.castHash),
}));

export const pageViewsDaily = pgTable("page_views_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date").notNull(), // Date (start of day)
  pagePath: text("page_path").notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  uniqueUsers: integer("unique_users").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  datePagePathUnique: uniqueIndex("page_views_daily_date_page_path_unique").on(table.date, table.pagePath),
  dateIdx: index("page_views_daily_date_idx").on(table.date),
  pagePathIdx: index("page_views_daily_page_path_idx").on(table.pagePath),
}));

export const userReactionSyncState = pgTable("user_reaction_sync_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  lastReactionHash: text("last_reaction_hash"), // Hash of the most recent reaction found in Neynar
  lastReactionType: text("last_reaction_type"), // 'like' or 'recast'
  lastReactionTimestamp: timestamp("last_reaction_timestamp"), // Timestamp of the last reaction (if available from Neynar)
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(), // When we last ran the incremental check
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userFidUnique: uniqueIndex("user_reaction_sync_state_user_fid_unique").on(table.userFid),
  lastCheckedAtIdx: index("user_reaction_sync_state_last_checked_at_idx").on(table.lastCheckedAt),
}));

export const apiCallStats = pgTable("api_call_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  callType: text("call_type").notNull(), // 'reaction_fetch' for incremental sync reaction fetches
  count: integer("count").default(0).notNull(), // Total count of calls
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  callTypeUnique: uniqueIndex("api_call_stats_call_type_unique").on(table.callType),
  callTypeIdx: index("api_call_stats_call_type_idx").on(table.callType),
}));

export const miniappInstallations = pgTable("miniapp_installations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  installedAt: timestamp("installed_at").defaultNow().notNull(),
}, (table) => ({
  userFidUnique: uniqueIndex("miniapp_installations_user_fid_unique").on(table.userFid),
  userFidIdx: index("miniapp_installations_user_fid_idx").on(table.userFid),
  installedAtIdx: index("miniapp_installations_installed_at_idx").on(table.installedAt),
}));

export const miniappNotificationQueue = pgTable("miniapp_notification_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  castHash: text("cast_hash").notNull(),
  castData: jsonb("cast_data").notNull(),
  notificationType: text("notification_type").notNull().default("new_curated_cast"), // e.g., "new_curated_cast"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(), // When to send (calculated based on frequency)
  sentAt: timestamp("sent_at"), // When notification was actually sent (nullable)
}, (table) => ({
  userFidIdx: index("miniapp_notification_queue_user_fid_idx").on(table.userFid),
  scheduledForIdx: index("miniapp_notification_queue_scheduled_for_idx").on(table.scheduledFor),
  sentAtIdx: index("miniapp_notification_queue_sent_at_idx").on(table.sentAt),
  userFidScheduledForIdx: index("miniapp_notification_queue_user_fid_scheduled_for_idx").on(table.userFid, table.scheduledFor),
}));

export const curatorRecommendations = pgTable("curator_recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  recommendedUserFid: bigint("recommended_user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  recommenderFid: bigint("recommender_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recommendedRecommenderUnique: uniqueIndex("curator_recommendations_recommended_recommender_unique").on(table.recommendedUserFid, table.recommenderFid),
  recommendedUserFidIdx: index("curator_recommendations_recommended_user_fid_idx").on(table.recommendedUserFid),
  recommenderFidIdx: index("curator_recommendations_recommender_fid_idx").on(table.recommenderFid),
  createdAtIdx: index("curator_recommendations_created_at_idx").on(table.createdAt),
}));

export const qualityFeedback = pgTable("quality_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }), // Foreign key to curated_casts (curated cast hash)
  targetCastHash: text("target_cast_hash").notNull(), // The actual cast being reviewed (may be a reply)
  curatorFid: bigint("curator_fid", { mode: "number" }).notNull().references(() => users.fid),
  rootCastHash: text("root_cast_hash"), // Optional - for replies, the root cast hash
  feedback: text("feedback").notNull(), // The curator's feedback text
  previousQualityScore: integer("previous_quality_score").notNull(),
  newQualityScore: integer("new_quality_score").notNull(),
  deepseekReasoning: text("deepseek_reasoning"), // DeepSeek's reasoning for the new score
  isAdmin: boolean("is_admin").default(false).notNull(), // Whether user was admin when submitting
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashIdx: index("quality_feedback_cast_hash_idx").on(table.castHash),
  targetCastHashIdx: index("quality_feedback_target_cast_hash_idx").on(table.targetCastHash),
  curatorFidIdx: index("quality_feedback_curator_fid_idx").on(table.curatorFid),
  rootCastHashIdx: index("quality_feedback_root_cast_hash_idx").on(table.rootCastHash),
  createdAtIdx: index("quality_feedback_created_at_idx").on(table.createdAt),
  castHashCreatedAtIdx: index("quality_feedback_cast_hash_created_at_idx").on(table.castHash, table.createdAt),
}));

export const signInLogs = pgTable("sign_in_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).references(() => users.fid),
  requestData: jsonb("request_data"), // Data sent during sign-in
  responseData: jsonb("response_data"), // Data received from Neynar
  signerUuid: text("signer_uuid"), // The signer UUID from the response
  success: boolean("success").notNull(), // Whether sign-in was successful
  error: text("error"), // Error message if failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userFidIdx: index("sign_in_logs_user_fid_idx").on(table.userFid),
  createdAtIdx: index("sign_in_logs_created_at_idx").on(table.createdAt),
  userFidCreatedAtIdx: index("sign_in_logs_user_fid_created_at_idx").on(table.userFid, table.createdAt),
}));

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name"),
  description: text("description"),
  creatorFid: bigint("creator_fid", { mode: "number" }).notNull().references(() => users.fid),
  accessType: text("access_type").notNull(), // 'open', 'gated_user', 'gated_rule'
  gatedUserId: bigint("gated_user_id", { mode: "number" }).references(() => users.fid),
  gatingRule: jsonb("gating_rule"), // Flexible rule configuration for 'gated_rule' type
  displayType: text("display_type").notNull().default("text"), // 'text', 'image', 'image-text'
  autoCurationEnabled: boolean("auto_curation_enabled").default(false).notNull(),
  autoCurationRules: jsonb("auto_curation_rules"), // CustomFeed structure for auto-curation
  displayMode: jsonb("display_mode"), // DisplayMode from customFeeds
  headerConfig: jsonb("header_config"), // HeaderConfig from customFeeds
  hiddenEmbedUrls: jsonb("hidden_embed_urls"), // Array of URLs/domains to hide embeds from
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("collections_name_idx").on(table.name),
  creatorFidIdx: index("collections_creator_fid_idx").on(table.creatorFid),
  accessTypeIdx: index("collections_access_type_idx").on(table.accessType),
  autoCurationEnabledIdx: index("collections_auto_curation_enabled_idx").on(table.autoCurationEnabled),
}));

export const thinkingCasts = pgTable("thinking_casts", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull().unique(),
  castData: jsonb("cast_data").notNull(),
  castCreatedAt: timestamp("cast_created_at"),
  authorFid: bigint("author_fid", { mode: "number" }).references(() => users.fid, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashIdx: index("thinking_casts_cast_hash_idx").on(table.castHash),
  castCreatedAtIdx: index("thinking_casts_cast_created_at_idx").on(table.castCreatedAt),
  authorFidIdx: index("thinking_casts_author_fid_idx").on(table.authorFid),
}));

export const collectionCasts = pgTable("collection_casts", {
  id: uuid("id").defaultRandom().primaryKey(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  castHash: text("cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  curatorFid: bigint("curator_fid", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  order: integer("order"),
}, (table) => ({
  collectionIdCastHashUnique: uniqueIndex("collection_casts_collection_id_cast_hash_key").on(table.collectionId, table.castHash),
  collectionIdIdx: index("collection_casts_collection_id_idx").on(table.collectionId),
  castHashIdx: index("collection_casts_cast_hash_idx").on(table.castHash),
  curatorFidIdx: index("collection_casts_curator_fid_idx").on(table.curatorFid),
  createdAtIdx: index("collection_casts_created_at_idx").on(table.createdAt),
  orderIdx: index("collection_casts_order_idx").on(table.order),
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
export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;
export type FeedViewSession = typeof feedViewSessions.$inferSelect;
export type NewFeedViewSession = typeof feedViewSessions.$inferInsert;
export type CastView = typeof castViews.$inferSelect;
export type NewCastView = typeof castViews.$inferInsert;
export type FeedViewSessionDaily = typeof feedViewSessionsDaily.$inferSelect;
export type NewFeedViewSessionDaily = typeof feedViewSessionsDaily.$inferInsert;
export type CastViewDaily = typeof castViewsDaily.$inferSelect;
export type NewCastViewDaily = typeof castViewsDaily.$inferInsert;
export type PageViewDaily = typeof pageViewsDaily.$inferSelect;
export type NewPageViewDaily = typeof pageViewsDaily.$inferInsert;
export type UserReactionSyncState = typeof userReactionSyncState.$inferSelect;
export type NewUserReactionSyncState = typeof userReactionSyncState.$inferInsert;
export type ApiCallStat = typeof apiCallStats.$inferSelect;
export type NewApiCallStat = typeof apiCallStats.$inferInsert;
export type MiniappInstallation = typeof miniappInstallations.$inferSelect;
export type NewMiniappInstallation = typeof miniappInstallations.$inferInsert;
export type MiniappNotificationQueue = typeof miniappNotificationQueue.$inferSelect;
export type NewMiniappNotificationQueue = typeof miniappNotificationQueue.$inferInsert;
export type QualityFeedback = typeof qualityFeedback.$inferSelect;
export type NewQualityFeedback = typeof qualityFeedback.$inferInsert;
export type SignInLog = typeof signInLogs.$inferSelect;
export type NewSignInLog = typeof signInLogs.$inferInsert;
export const xmtpClients = pgTable("xmtp_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  walletAddress: text("wallet_address").notNull(),
  keys: text("keys").notNull(), // Encrypted XMTP keys
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userFidWalletUnique: uniqueIndex("xmtp_clients_user_fid_wallet_unique").on(table.userFid, table.walletAddress),
  userFidIdx: index("xmtp_clients_user_fid_idx").on(table.userFid),
  walletAddressIdx: index("xmtp_clients_wallet_address_idx").on(table.walletAddress),
}));

export const xmtpConversations = pgTable("xmtp_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: text("conversation_id").notNull().unique(), // XMTP topic ID
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  peerAddress: text("peer_address"), // For 1:1 chats
  groupId: text("group_id"), // For group chats
  type: text("type").notNull(), // '1:1' or 'group'
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("xmtp_conversations_conversation_id_idx").on(table.conversationId),
  userFidIdx: index("xmtp_conversations_user_fid_idx").on(table.userFid),
  userFidLastMessageAtIdx: index("xmtp_conversations_user_fid_last_message_at_idx").on(table.userFid, table.lastMessageAt),
  peerAddressIdx: index("xmtp_conversations_peer_address_idx").on(table.peerAddress),
  groupIdIdx: index("xmtp_conversations_group_id_idx").on(table.groupId),
}));

export const xmtpMessages = pgTable("xmtp_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: text("conversation_id").notNull(), // XMTP topic ID - references xmtpConversations.conversationId
  messageId: text("message_id").notNull().unique(), // XMTP message ID
  senderAddress: text("sender_address").notNull(),
  content: text("content").notNull(),
  sentAt: timestamp("sent_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("xmtp_messages_conversation_id_idx").on(table.conversationId),
  conversationIdSentAtIdx: index("xmtp_messages_conversation_id_sent_at_idx").on(table.conversationId, table.sentAt),
  senderAddressIdx: index("xmtp_messages_sender_address_idx").on(table.senderAddress),
  messageIdIdx: index("xmtp_messages_message_id_idx").on(table.messageId),
}));

export const xmtpGroupMembers = pgTable("xmtp_group_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: text("conversation_id").notNull(), // XMTP topic ID - references xmtpConversations.conversationId
  memberAddress: text("member_address").notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => ({
  conversationMemberUnique: uniqueIndex("xmtp_group_members_conversation_member_unique").on(table.conversationId, table.memberAddress),
  conversationIdIdx: index("xmtp_group_members_conversation_id_idx").on(table.conversationId),
  memberAddressIdx: index("xmtp_group_members_member_address_idx").on(table.memberAddress),
}));

export const castThanks = pgTable("cast_thanks", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  fromFid: bigint("from_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  toFid: bigint("to_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  castHashFromToUnique: uniqueIndex("cast_thanks_cast_hash_from_to_unique").on(table.castHash, table.fromFid, table.toFid),
  castHashIdx: index("cast_thanks_cast_hash_idx").on(table.castHash),
  fromFidIdx: index("cast_thanks_from_fid_idx").on(table.fromFid),
  toFidIdx: index("cast_thanks_to_fid_idx").on(table.toFid),
}));

export const polls = pgTable("polls", {
  id: uuid("id").defaultRandom().primaryKey(),
  castHash: text("cast_hash").notNull().unique().references(() => curatedCasts.castHash, { onDelete: "cascade" }),
  question: text("question").notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.fid),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  castHashIdx: index("polls_cast_hash_idx").on(table.castHash),
  createdByIdx: index("polls_created_by_idx").on(table.createdBy),
}));

export const pollOptions = pgTable("poll_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  optionText: text("option_text").notNull(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pollIdIdx: index("poll_options_poll_id_idx").on(table.pollId),
  pollIdOrderIdx: index("poll_options_poll_id_order_idx").on(table.pollId, table.order),
}));

export const pollResponses = pgTable("poll_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  userFid: bigint("user_fid", { mode: "number" }).notNull().references(() => users.fid, { onDelete: "cascade" }),
  rankings: jsonb("rankings").notNull(), // Array of option IDs in ranked order
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pollUserUnique: uniqueIndex("poll_responses_poll_user_unique").on(table.pollId, table.userFid),
  pollIdIdx: index("poll_responses_poll_id_idx").on(table.pollId),
  userFidIdx: index("poll_responses_user_fid_idx").on(table.userFid),
}));

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type CollectionCast = typeof collectionCasts.$inferSelect;
export type NewCollectionCast = typeof collectionCasts.$inferInsert;
export type XmtpClient = typeof xmtpClients.$inferSelect;
export type NewXmtpClient = typeof xmtpClients.$inferInsert;
export type XmtpConversation = typeof xmtpConversations.$inferSelect;
export type NewXmtpConversation = typeof xmtpConversations.$inferInsert;
export type XmtpMessage = typeof xmtpMessages.$inferSelect;
export type NewXmtpMessage = typeof xmtpMessages.$inferInsert;
export type XmtpGroupMember = typeof xmtpGroupMembers.$inferSelect;
export type NewXmtpGroupMember = typeof xmtpGroupMembers.$inferInsert;
export type CastThanks = typeof castThanks.$inferSelect;
export type NewCastThanks = typeof castThanks.$inferInsert;
export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollOption = typeof pollOptions.$inferSelect;
export type NewPollOption = typeof pollOptions.$inferInsert;
export type PollResponse = typeof pollResponses.$inferSelect;
export type NewPollResponse = typeof pollResponses.$inferInsert;

export const pfpNfts = pgTable("pfp_nfts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenId: bigint("token_id", { mode: "number" }).notNull(),
  ownerAddress: text("owner_address").notNull(),
  imageUrl: text("image_url").notNull(),
  metadata: jsonb("metadata"),
  mintedAt: timestamp("minted_at").defaultNow().notNull(),
  transactionHash: text("transaction_hash"),
  replicateJobId: text("replicate_job_id"),
}, (table) => ({
  tokenIdIdx: index("pfp_nfts_token_id_idx").on(table.tokenId),
  ownerAddressIdx: index("pfp_nfts_owner_address_idx").on(table.ownerAddress),
  transactionHashIdx: index("pfp_nfts_transaction_hash_idx").on(table.transactionHash),
}));

export type PfpNft = typeof pfpNfts.$inferSelect;
export type NewPfpNft = typeof pfpNfts.$inferInsert;

