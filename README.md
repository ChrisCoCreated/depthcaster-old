# Depthcaster

A Long from farcaster client focused on deep thoughts, philosophy, art, and meaningful conversations. Built with Next.js and Neynar.

## Features

- **Quality-Focused Feed**: Curated content filtered by user quality scores, cast length, and engagement
- **Multiple Feed Views**: 
  - Curated feed from high-quality users
  - Deep Thoughts (longer, thoughtful casts)
  - Conversations (threaded discussions)
  - Art (art-focused channels)
  - Trending (quality-filtered trending content)
- **Threaded Conversations**: Full conversation threads with quality-ranked replies
- **Authentication**: Sign in with Neynar (SIWN) for posting and interacting
- **Content Filtering**: Hybrid approach combining:
  - Algorithmic filtering (user quality scores, length, engagement)
  - Manual curation (curated FIDs and channels)
  - Community signals (reply depth, engagement quality)

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env.local` file:
   ```
   NEYNAR_API_KEY=your_neynar_api_key_here
   NEXT_PUBLIC_NEYNAR_CLIENT_ID=your_neynar_client_id_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   POSTGRES_URL=your_postgres_url_here
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   ENABLE_NEYNAR_NOTIFICATIONS=true
   ```

   Get your API keys from:
   - [Neynar](https://neynar.com) - for Farcaster integration
   - [DeepSeek](https://www.deepseek.com) - for quality analysis and categorization (optional, but recommended)
   
   For local development, you can use a local PostgreSQL database or a service like [Neon](https://neon.tech) or [Supabase](https://supabase.com)
   
   **Note:** The `DEEPSEEK_API_KEY` is optional. If not provided, quality analysis will be skipped. Quality analysis provides AI-powered quality scores (0-100) and topic categorization for casts and replies.
   
   **Note:** `ENABLE_NEYNAR_NOTIFICATIONS` is optional and defaults to disabled. Set to `"true"` or `"1"` to enable fetching Neynar notifications (follows, likes, recasts, mentions, replies, quotes). When disabled, only database-stored notifications (curated casts, app updates) will be shown.

3. **Set up the database**:
   ```bash
   npm run setup-db
   ```
   This will create the necessary tables for user preferences and notification tracking.

4. **Run database migrations** (if needed):
   ```bash
   # Run specific migrations
   npx tsx scripts/run-migration-0012.ts
   npx tsx scripts/run-migration-0013.ts
   
   # Or use drizzle-kit
   npm run db:migrate
   ```
   See [Database Migrations](#database-migrations) section for more details.

5. **Configure curated lists** (optional):
   Edit `lib/curated.ts` to add:
   - Curated FIDs of high-quality users
   - Curated channels focused on philosophy/art

6. **Run the development server**:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Webhook maintenance

Depthcaster relies on three unified Neynar webhooks:

- `curated-replies-unified` (`01KA47AQSZV42RCY7B399X5PGM`)
- `curated-quotes-unified` (`01KA47ARX6SMBHJ17V9ZCV10PX`)
- `user-watches-unified` (`01KA4AEVR22SWJ088DBG0F28N4`)

If Neynar resets or removes any of them, run:

```bash
npx tsx scripts/sync-unified-webhooks.ts
```

The script will:

1. Upsert the three webhook records (including secrets) in the `webhooks` table.
2. Refresh both curated webhooks so their subscriptions include every curated cast plus tracked quote conversations.
3. Refresh the user-watch webhook with the current set of watched FIDs.

Ensure `WEBHOOK_BASE_URL`, `NEYNAR_API_KEY`, and database credentials are present in your environment before running the script.

## Notification API Usage

### Neynar Notification API Calls

The app uses Neynar's notification API efficiently with on-demand fetching:

**API Endpoints Used:**
- `GET /v2/farcaster/notifications` - 12 CU per call
- `POST /v2/farcaster/notifications/seen` - 20 CU per call

**When Neynar APIs are Called:**
1. **When notifications panel opens** - Once per panel open (12 CU)
2. **When user clicks "Load More"** - On-demand for pagination (12 CU per page)
3. **When marking notifications as seen** - Once when panel opens (20 CU)
4. **For device notifications** - Only if badge count increased and device notifications enabled (12 CU)

**When Neynar APIs are NOT Called:**
- Badge count polling (every 5 minutes) - Uses database-only count endpoint (0 CU)
- No automatic/polling of Neynar notifications
- Only users with plus role can fetch Neynar notifications

**Cost per User Session:**
- Typical: ~32-44 CU per session (1-2 notification fetches + 1 seen call)
- Much lower than polling every 5 minutes (which would be ~144 CU/hour)

**Badge Count Behavior:**
- Badge only shows database notifications (curated, cast.created, app.update)
- Does NOT include Neynar notifications (follows, likes, recasts, mentions, replies, quotes) to avoid API costs
- Neynar notifications are fetched and displayed when the panel opens

## Deployment

### Deploy to Vercel

1. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/yourusername/depthcaster.git
   git push -u origin main
   ```

2. **Connect to Vercel**:
   - Go to [Vercel](https://vercel.com) and sign in
   - Click "New Project" and import your GitHub repository
   - Vercel will automatically detect Next.js

3. **Set up Vercel Postgres**:
   - In your Vercel project dashboard, go to the "Storage" tab
   - Click "Create Database" and select "Postgres"
   - This will automatically add `POSTGRES_URL` to your environment variables

4. **Configure Environment Variables**:
   In your Vercel project settings, add these environment variables:
   - `NEYNAR_API_KEY` - Your Neynar API key
   - `NEXT_PUBLIC_NEYNAR_CLIENT_ID` - Your Neynar client ID
   - `NEXT_PUBLIC_APP_URL` - Your Vercel deployment URL (e.g., `https://depthcaster.vercel.app`)
   - `POSTGRES_URL` - Automatically set by Vercel Postgres
   - `DEEPSEEK_API_KEY` - Your DeepSeek API key (optional, for quality analysis)
   - `ENABLE_NEYNAR_NOTIFICATIONS` - Set to `"true"` or `"1"` to enable Neynar notifications (optional, defaults to disabled)

5. **Initialize the Database**:
   After deployment, run the database setup:
   ```bash
   npm run setup-db
   ```
   Or use Vercel's CLI:
   ```bash
   vercel env pull .env.local
   npm run setup-db
   ```

6. **Deploy**:
   Vercel will automatically deploy on every push to the main branch.

### Manual Database Setup

If you need to set up the database manually, you can run the SQL script:
```bash
psql $POSTGRES_URL -f lib/db-setup.sql
```

## Project Structure

```
depthcaster/
├── app/
│   ├── api/              # API routes
│   │   ├── feed/         # Feed fetching
│   │   ├── cast/         # Cast publishing
│   │   ├── conversation/ # Thread fetching
│   │   ├── build-ideas/  # Build ideas & feedback API
│   │   └── tags/         # Cast tagging (legacy, not used for build ideas)
│   ├── components/       # React components
│   │   ├── AuthProvider.tsx
│   │   ├── Feed.tsx
│   │   ├── CastCard.tsx
│   │   ├── CastThread.tsx
│   │   ├── CastComposer.tsx
│   │   ├── BuildIdeasManager.tsx
│   │   └── FeedbackModal.tsx
│   ├── cast/[hash]/      # Cast detail page
│   ├── profile/[fid]/    # Profile page
│   ├── admin/            # Admin panel
│   └── page.tsx          # Main feed page
├── lib/
│   ├── neynar.ts         # Neynar client setup
│   ├── filters.ts        # Content filtering logic
│   ├── curated.ts        # Curated lists
│   └── schema.ts         # Database schema
└── package.json
```

## Usage

1. **Sign In**: Click "Sign in" to authenticate with Farcaster via Neynar
2. **Browse Feeds**: Switch between different feed types using the tabs
3. **View Threads**: Click "View thread" on any cast to see the full conversation
4. **Post Casts**: Use the composer at the top of the feed to post new casts
5. **Reply**: Click on a cast to view its thread and reply
6. **Submit Feedback**: Click the feedback icon in the header to submit feedback, suggestions, or ideas (optionally linking to a cast)
7. **Manage Build Ideas** (Admin): Access the admin panel to create and manage build ideas and view user feedback

## Content Filtering

The app uses a hybrid filtering approach:

- **User Quality Scores**: Filters users with scores below 0.55 (configurable)
- **Cast Length**: Prioritizes longer, more thoughtful casts
- **Engagement Quality**: Values replies over likes/recasts
- **Curated Lists**: Manual curation of high-quality FIDs and channels
- **Experimental Flag**: Uses Neynar's experimental filtering for spam reduction

## Quality Scoring

The app uses AI-powered quality analysis to score all casts and replies on a scale of 0-100:

- **Quote Casts**: Quote casts are scored based on both the original cast's quality and the quality of any additional text added by the quoter. The base adjustment is -10 from the original cast's score. The system then analyzes the additional text:
  - **Neutral text** (single word, emoji, or very short acknowledgements): Keeps the default -10 adjustment
  - **High-quality commentary**: Reduces the penalty (e.g., -5, -3, or even 0 for exceptional commentary)
  - **Negative or harmful text**: Increases the penalty (e.g., -15, -20, or up to -40 for spam/trolling)
  - If the original cast hasn't been analyzed yet, the system automatically fetches it from Neynar, stores it in the database, analyzes it, and then scores the quote cast accordingly.
- **Quality Analysis**: Casts with original content are analyzed using DeepSeek AI to evaluate depth, clarity, and value, with scores ranging from 0-100.

## Customization

- Edit `lib/curated.ts` to customize curated FIDs and channels
- Adjust filtering thresholds in `lib/filters.ts`
- Modify feed types in `app/components/Feed.tsx`
- Customize UI styling in components and `app/globals.css`

## Database Migrations

The database schema is managed using Drizzle ORM and migration scripts. Key optimizations include:

### Cast Metadata Extraction (Migration 0012)

To improve query performance and reduce JSONB parsing overhead, frequently queried cast fields are extracted into dedicated columns:

- **Text fields**: `cast_text`, `cast_text_length` - Enable database-level text filtering
- **Engagement metrics**: `likes_count`, `recasts_count`, `replies_count`, `engagement_score` - Pre-computed for efficient sorting
- **Author reference**: `author_fid` - Foreign key to users table for joins
- **Threading**: `parent_hash` - For efficient thread queries

**Benefits:**
- Database-level filtering (no need to parse JSONB for common queries)
- Reduced compute usage on Neon DB
- Faster queries with indexed columns
- Better scalability for text-based filtering

### Build Ideas & Feedback System (Migration 0013)

The build ideas and feedback system uses a unified table structure:

- **Unified Storage**: Both build ideas and feedback are stored in the `build_ideas` table, distinguished by a `type` field
- **User Attribution**: All entries include user information showing who created them
- **Cast Linking**: Feedback entries can optionally link to specific casts via `cast_hash`
- **Type System**: Entries are typed as either `'build-idea'` (admin-created) or `'feedback'` (user-submitted)

**Running migrations:**
```bash
# Run a specific migration
npx tsx scripts/run-migration-0012.ts
npx tsx scripts/run-migration-0013.ts

# Or use drizzle-kit
npm run db:migrate
```

**Migration files:**
- `drizzle/0012_extract_cast_metadata.sql` - SQL migration
- `scripts/run-migration-0012.ts` - TypeScript migration script with backfilling
- `drizzle/0013_merge_feedback_into_build_ideas.sql` - SQL migration
- `scripts/run-migration-0013.ts` - TypeScript migration script

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Neynar SDK** - Farcaster API integration
- **Neon Postgres** - Serverless PostgreSQL database (via `@neondatabase/serverless`)
- **Drizzle ORM** - Type-safe database queries and migrations
- **date-fns** - Date formatting

## Database Architecture

The database uses a hybrid storage approach:

- **JSONB storage**: Full cast data stored in `cast_data` JSONB column for flexibility
- **Extracted columns**: Frequently queried fields extracted to dedicated columns for performance
- **Indexes**: Composite indexes on `(cast_text_length, engagement_score)`, `(author_fid, cast_created_at)`, etc.

This approach balances:
- **Flexibility**: Full cast data available in JSONB
- **Performance**: Fast queries using extracted columns and indexes
- **Efficiency**: Reduced JSONB parsing overhead

## License

MIT
