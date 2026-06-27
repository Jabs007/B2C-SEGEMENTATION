CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"segmentName" varchar(20) NOT NULL,
	"cluster" integer NOT NULL,
	"recency" real,
	"frequency" real,
	"monetary" real,
	"aov" real,
	"spendTrend" real,
	"interPurchaseInterval" real,
	"spendConcentration" real,
	"categoryBreadth" integer,
	"channelConsistency" integer,
	"latePaymentRate" real,
	"defaultFlag" integer,
	"tenure" real,
	"tenureAdjFreq" real,
	"preferredCategory" varchar(128),
	"region" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customerId_unique" UNIQUE("customerId")
);
--> statement-breakpoint
CREATE TABLE "pipelineRuns" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(15) DEFAULT 'pending' NOT NULL,
	"triggeredBy" varchar(15) DEFAULT 'manual' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"customersProcessed" integer,
	"logs" text,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"recency" real NOT NULL,
	"frequency" real NOT NULL,
	"monetary" real NOT NULL,
	"aov" real NOT NULL,
	"tenure" real NOT NULL,
	"predictedSegment" varchar(20) NOT NULL,
	"confidence" real,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduledJobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"cronExpression" varchar(64) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"scheduleCronTaskUid" varchar(65),
	"lastRunAt" timestamp,
	"nextRunAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(10) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
