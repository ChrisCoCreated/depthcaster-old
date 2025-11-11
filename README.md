# Depthcaster

A Farcaster client focused on deep thoughts, philosophy, art, and meaningful conversations. Built with Next.js and Neynar.

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
   ```

   Get your API keys from [Neynar](https://neynar.com)
   
   For local development, you can use a local PostgreSQL database or a service like [Neon](https://neon.tech) or [Supabase](https://supabase.com)

3. **Set up the database**:
   ```bash
   npm run setup-db
   ```
   This will create the necessary tables for user preferences and notification tracking.

4. **Configure curated lists** (optional):
   Edit `lib/curated.ts` to add:
   - Curated FIDs of high-quality users
   - Curated channels focused on philosophy/art

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

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
│   │   └── conversation/ # Thread fetching
│   ├── components/       # React components
│   │   ├── AuthProvider.tsx
│   │   ├── Feed.tsx
│   │   ├── CastCard.tsx
│   │   ├── CastThread.tsx
│   │   └── CastComposer.tsx
│   ├── cast/[hash]/      # Cast detail page
│   ├── profile/[fid]/    # Profile page
│   └── page.tsx          # Main feed page
├── lib/
│   ├── neynar.ts         # Neynar client setup
│   ├── filters.ts        # Content filtering logic
│   └── curated.ts        # Curated lists
└── package.json
```

## Usage

1. **Sign In**: Click "Sign in" to authenticate with Farcaster via Neynar
2. **Browse Feeds**: Switch between different feed types using the tabs
3. **View Threads**: Click "View thread" on any cast to see the full conversation
4. **Post Casts**: Use the composer at the top of the feed to post new casts
5. **Reply**: Click on a cast to view its thread and reply

## Content Filtering

The app uses a hybrid filtering approach:

- **User Quality Scores**: Filters users with scores below 0.55 (configurable)
- **Cast Length**: Prioritizes longer, more thoughtful casts
- **Engagement Quality**: Values replies over likes/recasts
- **Curated Lists**: Manual curation of high-quality FIDs and channels
- **Experimental Flag**: Uses Neynar's experimental filtering for spam reduction

## Customization

- Edit `lib/curated.ts` to customize curated FIDs and channels
- Adjust filtering thresholds in `lib/filters.ts`
- Modify feed types in `app/components/Feed.tsx`
- Customize UI styling in components and `app/globals.css`

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Neynar SDK** - Farcaster API integration
- **Vercel Postgres** - Database for user preferences and notifications
- **date-fns** - Date formatting

## License

MIT
