CREATE TABLE "xmtp_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_fid" bigint NOT NULL,
	"wallet_address" text NOT NULL,
	"keys" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmtp_conversations" (
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
--> statement-breakpoint
CREATE TABLE "xmtp_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" text NOT NULL,
	"member_address" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xmtp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"sender_address" text NOT NULL,
	"content" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "xmtp_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "xmtp_clients" ADD CONSTRAINT "xmtp_clients_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xmtp_conversations" ADD CONSTRAINT "xmtp_conversations_user_fid_users_fid_fk" FOREIGN KEY ("user_fid") REFERENCES "public"."users"("fid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xmtp_clients_user_fid_wallet_unique" ON "xmtp_clients" USING btree ("user_fid","wallet_address");--> statement-breakpoint
CREATE INDEX "xmtp_clients_user_fid_idx" ON "xmtp_clients" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "xmtp_clients_wallet_address_idx" ON "xmtp_clients" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "xmtp_conversations_conversation_id_idx" ON "xmtp_conversations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "xmtp_conversations_user_fid_idx" ON "xmtp_conversations" USING btree ("user_fid");--> statement-breakpoint
CREATE INDEX "xmtp_conversations_user_fid_last_message_at_idx" ON "xmtp_conversations" USING btree ("user_fid","last_message_at");--> statement-breakpoint
CREATE INDEX "xmtp_conversations_peer_address_idx" ON "xmtp_conversations" USING btree ("peer_address");--> statement-breakpoint
CREATE INDEX "xmtp_conversations_group_id_idx" ON "xmtp_conversations" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xmtp_group_members_conversation_member_unique" ON "xmtp_group_members" USING btree ("conversation_id","member_address");--> statement-breakpoint
CREATE INDEX "xmtp_group_members_conversation_id_idx" ON "xmtp_group_members" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "xmtp_group_members_member_address_idx" ON "xmtp_group_members" USING btree ("member_address");--> statement-breakpoint
CREATE INDEX "xmtp_messages_conversation_id_idx" ON "xmtp_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "xmtp_messages_conversation_id_sent_at_idx" ON "xmtp_messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "xmtp_messages_sender_address_idx" ON "xmtp_messages" USING btree ("sender_address");--> statement-breakpoint
CREATE INDEX "xmtp_messages_message_id_idx" ON "xmtp_messages" USING btree ("message_id");