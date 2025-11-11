import { sql } from '@vercel/postgres';

export async function initDatabase() {
  try {
    // Create user_preferences table
    await sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
        fid INTEGER PRIMARY KEY,
        preferences JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Create notification_seen table
    await sql`
      CREATE TABLE IF NOT EXISTS notification_seen (
        id SERIAL PRIMARY KEY,
        fid INTEGER NOT NULL,
        notification_id TEXT NOT NULL,
        seen_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(fid, notification_id)
      );
    `;

    // Create indexes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_notification_seen_fid 
      ON notification_seen(fid);
    `;

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function getUserPreferences(fid: number) {
  const result = await sql`
    SELECT preferences FROM user_preferences WHERE fid = ${fid}
  `;
  return result.rows[0]?.preferences || {};
}

export async function updateUserPreferences(fid: number, preferences: Record<string, any>) {
  await sql`
    INSERT INTO user_preferences (fid, preferences, updated_at)
    VALUES (${fid}, ${JSON.stringify(preferences)}::jsonb, NOW())
    ON CONFLICT (fid) 
    DO UPDATE SET 
      preferences = ${JSON.stringify(preferences)}::jsonb,
      updated_at = NOW()
  `;
}

export async function markNotificationSeen(fid: number, notificationId: string) {
  await sql`
    INSERT INTO notification_seen (fid, notification_id)
    VALUES (${fid}, ${notificationId})
    ON CONFLICT (fid, notification_id) DO NOTHING
  `;
}

export async function getSeenNotifications(fid: number): Promise<string[]> {
  const result = await sql`
    SELECT notification_id FROM notification_seen WHERE fid = ${fid}
  `;
  return result.rows.map(row => row.notification_id);
}

