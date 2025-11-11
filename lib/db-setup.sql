-- Database schema for Depthcaster
-- Run this script to initialize the database

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  fid INTEGER PRIMARY KEY,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification seen tracking table
CREATE TABLE IF NOT EXISTS notification_seen (
  id SERIAL PRIMARY KEY,
  fid INTEGER NOT NULL,
  notification_id TEXT NOT NULL,
  seen_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fid, notification_id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notification_seen_fid 
ON notification_seen(fid);

CREATE INDEX IF NOT EXISTS idx_notification_seen_seen_at 
ON notification_seen(seen_at);

