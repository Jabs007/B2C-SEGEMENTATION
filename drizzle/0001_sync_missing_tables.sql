-- Idempotent sync migration: ensure all schema-defined tables exist.
-- Tables created here are already present in the dev DB (created via raw SQL
-- after the original 0000 migration). On a fresh DB they get created here.
-- All statements use IF NOT EXISTS so re-running them is a no-op.

CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"segmentName" varchar(50) NOT NULL,
	"campaignType" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"targetAudience" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"discountCode" varchar(100),
	"emailTemplate" text,
	"owner" varchar(255),
	"scheduledDate" timestamp,
	"sentCount" integer DEFAULT 0,
	"openCount" integer DEFAULT 0,
	"clickCount" integer DEFAULT 0,
	"conversionCount" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_segment_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"pipelineRunId" integer NOT NULL,
	"segment" varchar(50) NOT NULL,
	"recency" real,
	"frequency" real,
	"monetary" real,
	"aov" real,
	"tenure" real,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "segment_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"fromSegment" varchar(50),
	"toSegment" varchar(50) NOT NULL,
	"pipelineRunId" integer NOT NULL,
	"migrationDate" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prediction_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" varchar(64) NOT NULL,
	"fileSize" integer,
	"rowCount" integer,
	"successCount" integer,
	"errorCount" integer,
	"results" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_logs_batchId_unique" UNIQUE("batchId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drift_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipelineRunId" integer NOT NULL,
	"feature" varchar(50) NOT NULL,
	"trainingMean" real,
	"trainingStd" real,
	"currentMean" real,
	"currentStd" real,
	"driftScore" real,
	"isDrifted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
