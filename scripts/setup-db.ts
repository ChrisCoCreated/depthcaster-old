#!/usr/bin/env tsx
/**
 * Database setup script
 * Run this script to initialize the database schema
 * 
 * Usage:
 *   npx tsx scripts/setup-db.ts
 * 
 * Or with environment variables:
 *   POSTGRES_URL=your_postgres_url npx tsx scripts/setup-db.ts
 */

import { initDatabase } from '../lib/db';

async function main() {
  console.log('Setting up database...');
  
  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is required');
    console.log('Set it in your .env.local file or as an environment variable');
    process.exit(1);
  }

  try {
    await initDatabase();
    console.log('✅ Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

main();

