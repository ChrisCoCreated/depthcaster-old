-- Create placeholder curated cast for parent casts saved for display purposes only
-- This allows parent casts (parents of quote casts) to be stored in cast_replies
-- without appearing in conversation trees or reply lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "curated_casts" 
    WHERE "cast_hash" = '0x0000000000000000000000000000000000000000'
  ) THEN
    INSERT INTO "curated_casts" ("cast_hash", "cast_data", "curator_fid", "created_at")
    VALUES (
      '0x0000000000000000000000000000000000000000',
      '{"hash": "0x0000000000000000000000000000000000000000", "text": "Placeholder for parent cast metadata"}'::jsonb,
      NULL,
      NOW()
    );
  END IF;
END $$;

