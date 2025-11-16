# Deployment Guide

This guide will help you deploy Depthcaster to GitHub and Vercel.

## Prerequisites

- A GitHub account
- A Vercel account (sign up at [vercel.com](https://vercel.com))
- Neynar API keys (get from [neynar.com](https://neynar.com))

## Step 1: Push to GitHub

1. **Create a new repository on GitHub**:
   - Go to [github.com/new](https://github.com/new)
   - Name it `depthcaster` (or your preferred name)
   - Choose public or private
   - Don't initialize with README (we already have one)

2. **Add the remote and push**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/depthcaster.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy to Vercel

1. **Import your repository**:
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js settings

2. **Configure environment variables**:
   - In the project settings, go to "Environment Variables"
   - Add the following:
     - `NEYNAR_API_KEY` - Your Neynar API key
     - `NEXT_PUBLIC_NEYNAR_CLIENT_ID` - Your Neynar client ID
     - `NEXT_PUBLIC_APP_URL` - Will be set after first deployment (e.g., `https://depthcaster.vercel.app`)

3. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete
   - Note your deployment URL

4. **Update APP_URL**:
   - Go back to Environment Variables
   - Update `NEXT_PUBLIC_APP_URL` with your actual Vercel URL
   - Redeploy if needed

## Step 3: Set up Vercel Postgres Database

1. **Create the database**:
   - In your Vercel project dashboard, go to the "Storage" tab
   - Click "Create Database"
   - Select "Postgres"
   - Choose a name (e.g., `depthcaster-db`)
   - Select a region close to your users
   - Click "Create"

2. **Initialize the database**:
   - The `POSTGRES_URL` environment variable is automatically added
   - Install Vercel CLI locally:
     ```bash
     npm i -g vercel
     ```
   - Pull environment variables:
     ```bash
     vercel env pull .env.local
     ```
   - Run the database setup:
     ```bash
     npm run setup-db
     ```

   Alternatively, you can use Vercel's database UI:
   - Go to your database in Vercel dashboard
   - Click "Query" tab
   - Copy and paste the contents of `lib/db-setup.sql`
   - Run the query

3. **Run database migrations**:
   After initial setup, run any pending migrations:
   ```bash
   # Run specific migrations
   npx tsx scripts/run-migration-0012.ts
   npx tsx scripts/run-migration-0013.ts
   
   # Or use drizzle-kit
   npm run db:migrate
   ```
   
   **Important**: Migrations should be run in order. Check the `drizzle/` directory for available migrations.

## Step 4: Verify Deployment

1. Visit your Vercel deployment URL
2. Sign in with Neynar
3. Test the feed and other features
4. Check that notifications work (database-dependent features)

## Continuous Deployment

Vercel automatically deploys on every push to the `main` branch. To deploy:
```bash
git add .
git commit -m "Your commit message"
git push
```

## Database Migrations

When deploying updates that include database schema changes:

1. **Check for new migrations**:
   - Review `drizzle/` directory for new migration files
   - Check `scripts/` for migration scripts

2. **Run migrations**:
   ```bash
   # Pull latest environment variables
   vercel env pull .env.local
   
   # Run specific migrations
   npx tsx scripts/run-migration-0012.ts
   npx tsx scripts/run-migration-0013.ts
   ```

3. **Verify migration success**:
   - Check migration script output for success messages
   - Verify new columns/indexes exist in database
   - Test application functionality

**Note**: Migrations are idempotent - safe to run multiple times. They use `IF NOT EXISTS` checks where possible.

## Troubleshooting

- **Database connection errors**: Ensure `POSTGRES_URL` is set in Vercel environment variables
- **API errors**: Verify your Neynar API keys are correct
- **Build failures**: Check the build logs in Vercel dashboard
- **Environment variables not working**: Make sure to redeploy after adding new variables
- **Migration errors**: Check that all previous migrations have been run. Foreign key constraints may fail if referenced data doesn't exist

