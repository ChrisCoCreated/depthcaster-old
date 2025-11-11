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
   ```

   Get your API keys from [Neynar](https://neynar.com)

3. **Configure curated lists** (optional):
   Edit `lib/curated.ts` to add:
   - Curated FIDs of high-quality users
   - Curated channels focused on philosophy/art

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

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
- **date-fns** - Date formatting

## License

MIT
