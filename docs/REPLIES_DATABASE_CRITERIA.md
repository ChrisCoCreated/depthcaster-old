# Replies Database: Save Criteria and User Preferences

This document describes the criteria that determine what gets saved in the `cast_replies` database table by default, the constants that control this behavior, and how individual user preferences affect what users see.

## What Gets Saved in the Replies Database

The `cast_replies` table stores replies, quote casts, and related conversation data for curated casts. The following items are saved **by default**:

### 1. Regular Replies
- Replies to curated casts that meet the quality threshold
- Replies to quote casts (also associated with the original curated cast)
- Maximum depth: 5 levels (configurable via `maxDepth` parameter)
- Maximum replies per conversation: 50 (configurable via `maxReplies` parameter)

### 2. Quote Casts
- Quote casts that quote a curated cast and meet the quality threshold
- Stored with `isQuoteCast = true` and `replyDepth = 0` (top-level)

### 3. Replies to Quote Casts
- Replies made to quote casts are also stored
- Associated with the original curated cast hash
- Subject to the same quality threshold requirements

### 4. Parent Casts (Metadata Only)
- Parent casts saved for display purposes only
- Use placeholder hash `0x0000000000000000000000000000000000000000`
- Filtered out from normal queries but available for conversation threading

## Quality Threshold Criteria

A cast must meet **ALL** of the following criteria to be saved:

### 1. Not a Bot Cast
- Cast must NOT be from a bot in the `DEFAULT_HIDDEN_BOTS` list
- Default bots are **ALWAYS** excluded, regardless of other criteria:
  - `betonbangers`
  - `deepbot`
  - `bracky`
  - `hunttown.eth`
- Bot detection checks both:
  - Author username
  - Mentioned profiles in the cast

### 2. Meets Quality Threshold
A cast must meet **at least ONE** of the following:

- **User Score**: `cast.author.score > 0.7`
  - OR
- **Cast Length**: `cast.text.length > 500` characters

**Note**: Bot casts **ALWAYS fail** the quality test, regardless of length or score.

## Constants That Control Saving Behavior

### Quality Threshold Constants
Located in `lib/cast-quality.ts`:

```typescript
export const MIN_USER_SCORE_THRESHOLD = 0.7;
export const MIN_CAST_LENGTH_THRESHOLD = 500;
```

### Default Hidden Bots
Located in `lib/cast-quality.ts` and `lib/bot-filter.ts`:

```typescript
const DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky", "hunttown.eth"];
```

**Important**: These bots are **ALWAYS** excluded from the database, regardless of user preferences.

### Conversation Fetching Limits
Located in `lib/conversation.ts`:

```typescript
export async function fetchAndStoreConversation(
  castHash: string,
  maxDepth: number = 5,      // Maximum reply depth to traverse
  maxReplies: number = 50    // Maximum number of replies to store
)
```

### Placeholder Hash for Parent Casts
Located in `app/api/conversation/database/route.ts` and `app/api/feed/replies/route.ts`:

```typescript
const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";
```

This placeholder is used to mark parent casts that are saved for display purposes only and should be excluded from normal queries.

## User Preferences That Affect What Users See

User preferences **do NOT** affect what gets saved in the database. They only affect what is **displayed** to individual users.

### 1. Bot Filtering Preferences

**Location**: `lib/bot-filter.ts`, `app/api/user/preferences/route.ts`

#### `hideBots` (boolean, default: `true`)
- Controls whether to hide bot casts from the user's view
- Default: `true` (hide bots)
- If `false`, only default bots are hidden (they're always hidden regardless)
- If `true`, hides both default bots AND user's custom bot list

#### `hiddenBots` (string array, default: `DEFAULT_HIDDEN_BOTS`)
- Custom list of bot usernames to hide (in addition to default bots)
- Default bots are always included, even if not explicitly listed
- Users can add/remove bots from this list via settings

**Important**: Default bots (`betonbangers`, `deepbot`, `bracky`, `hunttown.eth`) are **ALWAYS** hidden, regardless of user preferences.

### 2. Engagement Filtering

**Location**: `app/components/ConversationView.tsx`, `app/api/feed/replies/route.ts`

#### `showAll` (boolean, default: `false`)
- When `false`: Hides replies with no engagement (no likes, recasts, or replies)
- When `true`: Shows all replies regardless of engagement
- Always shows at least 3 replies if available (even with no engagement)
- When sorting by "newest", always shows the most recent reply even if it has no engagement

#### Engagement Calculation
A reply has engagement if:
- `engagementScore > 0`
- Where `engagementScore = repliesCount * 4 + recastsCount * 2 + likesCount`

### 3. Sorting Preferences

**Location**: `app/components/ConversationView.tsx`, `app/api/feed/replies/route.ts`

#### `sortBy` (string, default: `"newest"`)
- `"newest"`: Sort by cast creation time (most recent first)
  - Always shows the most recent reply even if it has no engagement
- `"engagement"`: Sort by engagement score (highest first)
  - Prioritizes replies with more likes, recasts, and replies

### 4. Minimum Replies Display

**Location**: `app/components/ConversationView.tsx`, `app/api/feed/replies/route.ts`

- Always displays at least **3 replies** if available, even if they have no engagement
- Ensures conversations don't appear empty even when engagement filtering is active

### 5. Recent Activity Filtering

**Location**: `app/api/feed/replies/route.ts`

- Uses `lastSessionTimestamp` to identify replies created since the user's last session
- Replies that are new since last session are always shown, even if they have no engagement
- Helps users see new activity in conversations they've viewed before

## Summary

### What Gets Saved (Database Level)
- ✅ Replies that meet quality threshold (user score > 0.7 OR length > 500)
- ✅ Quote casts that meet quality threshold
- ✅ Replies to quote casts that meet quality threshold
- ❌ Bot casts (always excluded)
- ❌ Replies that don't meet quality threshold
- ❌ Replies beyond maxDepth (5) or maxReplies (50) limits

### What Users See (Display Level)
- Filtered by user's `hideBots` and `hiddenBots` preferences
- Filtered by engagement (unless `showAll = true`)
- Sorted by user's `sortBy` preference
- Always shows at least 3 replies if available
- Always shows most recent reply when sorting by "newest"
- Always shows replies new since last session

### Key Constants
- `MIN_USER_SCORE_THRESHOLD = 0.7`
- `MIN_CAST_LENGTH_THRESHOLD = 500`
- `DEFAULT_HIDDEN_BOTS = ["betonbangers", "deepbot", "bracky", "hunttown.eth"]`
- `maxDepth = 5` (default)
- `maxReplies = 50` (default)

