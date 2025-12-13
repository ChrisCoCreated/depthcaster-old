import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Running migration 0012: Add XMTP tables...");

    // Create xmtp_clients table
    console.log("Creating xmtp_clients table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "xmtp_clients" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_fid" bigint NOT NULL,
        "wallet_address" text NOT NULL,
        "keys" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("✓ Created xmtp_clients table");

    // Add foreign key constraint to xmtp_clients
    console.log("Adding foreign key constraint to xmtp_clients...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'xmtp_clients_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "xmtp_clients" 
          ADD CONSTRAINT "xmtp_clients_user_fid_users_fid_fk" 
          FOREIGN KEY ("user_fid") 
          REFERENCES "public"."users"("fid") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Added foreign key constraint to xmtp_clients");

    // Create indexes for xmtp_clients
    console.log("Creating indexes for xmtp_clients...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "xmtp_clients_user_fid_wallet_unique" 
      ON "xmtp_clients" USING btree ("user_fid", "wallet_address");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_clients_user_fid_idx" 
      ON "xmtp_clients" USING btree ("user_fid");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_clients_wallet_address_idx" 
      ON "xmtp_clients" USING btree ("wallet_address");
    `);
    console.log("✓ Created indexes for xmtp_clients");

    // Create xmtp_conversations table
    console.log("Creating xmtp_conversations table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "xmtp_conversations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" text NOT NULL,
        "user_fid" bigint NOT NULL,
        "peer_address" text,
        "group_id" text,
        "type" text NOT NULL,
        "last_message_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "xmtp_conversations_conversation_id_unique" UNIQUE("conversation_id")
      );
    `);
    console.log("✓ Created xmtp_conversations table");

    // Add foreign key constraint to xmtp_conversations
    console.log("Adding foreign key constraint to xmtp_conversations...");
    await db.execute(sql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'xmtp_conversations_user_fid_users_fid_fk'
        ) THEN
          ALTER TABLE "xmtp_conversations" 
          ADD CONSTRAINT "xmtp_conversations_user_fid_users_fid_fk" 
          FOREIGN KEY ("user_fid") 
          REFERENCES "public"."users"("fid") 
          ON DELETE CASCADE 
          ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("✓ Added foreign key constraint to xmtp_conversations");

    // Create indexes for xmtp_conversations
    console.log("Creating indexes for xmtp_conversations...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_conversations_conversation_id_idx" 
      ON "xmtp_conversations" USING btree ("conversation_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_conversations_user_fid_idx" 
      ON "xmtp_conversations" USING btree ("user_fid");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_conversations_user_fid_last_message_at_idx" 
      ON "xmtp_conversations" USING btree ("user_fid", "last_message_at");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_conversations_peer_address_idx" 
      ON "xmtp_conversations" USING btree ("peer_address");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_conversations_group_id_idx" 
      ON "xmtp_conversations" USING btree ("group_id");
    `);
    console.log("✓ Created indexes for xmtp_conversations");

    // Create xmtp_group_members table
    console.log("Creating xmtp_group_members table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "xmtp_group_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" text NOT NULL,
        "member_address" text NOT NULL,
        "added_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("✓ Created xmtp_group_members table");

    // Create indexes for xmtp_group_members
    console.log("Creating indexes for xmtp_group_members...");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "xmtp_group_members_conversation_member_unique" 
      ON "xmtp_group_members" USING btree ("conversation_id", "member_address");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_group_members_conversation_id_idx" 
      ON "xmtp_group_members" USING btree ("conversation_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_group_members_member_address_idx" 
      ON "xmtp_group_members" USING btree ("member_address");
    `);
    console.log("✓ Created indexes for xmtp_group_members");

    // Create xmtp_messages table
    console.log("Creating xmtp_messages table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "xmtp_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "conversation_id" text NOT NULL,
        "message_id" text NOT NULL,
        "sender_address" text NOT NULL,
        "content" text NOT NULL,
        "sent_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "xmtp_messages_message_id_unique" UNIQUE("message_id")
      );
    `);
    console.log("✓ Created xmtp_messages table");

    // Create indexes for xmtp_messages
    console.log("Creating indexes for xmtp_messages...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_messages_conversation_id_idx" 
      ON "xmtp_messages" USING btree ("conversation_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_messages_conversation_id_sent_at_idx" 
      ON "xmtp_messages" USING btree ("conversation_id", "sent_at");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_messages_sender_address_idx" 
      ON "xmtp_messages" USING btree ("sender_address");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "xmtp_messages_message_id_idx" 
      ON "xmtp_messages" USING btree ("message_id");
    `);
    console.log("✓ Created indexes for xmtp_messages");

    console.log("\n✅ Migration 0012 (XMTP tables) completed successfully!");
    console.log("- Created xmtp_clients table with indexes");
    console.log("- Created xmtp_conversations table with indexes");
    console.log("- Created xmtp_group_members table with indexes");
    console.log("- Created xmtp_messages table with indexes");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();

