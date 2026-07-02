import {
  integer,
  serial,
  pgTable,
  text,
  timestamp,
  varchar,
  real,
  boolean,
  json,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 10 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Customer segments table
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull().unique(),
  segmentName: varchar("segmentName", { length: 20 }).notNull(),
  cluster: integer("cluster").notNull(),
  recency: real("recency"),
  frequency: real("frequency"),
  monetary: real("monetary"),
  aov: real("aov"),
  spendTrend: real("spendTrend"),
  interPurchaseInterval: real("interPurchaseInterval"),
  spendConcentration: real("spendConcentration"),
  categoryBreadth: integer("categoryBreadth"),
  channelConsistency: integer("channelConsistency"),
  latePaymentRate: real("latePaymentRate"),
  defaultFlag: integer("defaultFlag"),
  tenure: real("tenure"),
  tenureAdjFreq: real("tenureAdjFreq"),
  preferredCategory: varchar("preferredCategory", { length: 128 }),
  region: varchar("region", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// Predictions table
export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  recency: real("recency").notNull(),
  frequency: real("frequency").notNull(),
  monetary: real("monetary").notNull(),
  aov: real("aov").notNull(),
  tenure: real("tenure").notNull(),
  predictedSegment: varchar("predictedSegment", { length: 20 }).notNull(),
  confidence: real("confidence"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = typeof predictions.$inferInsert;

// Bulk prediction logs table
export const predictionLogs = pgTable("prediction_logs", {
  id: serial("id").primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  fileSize: integer("fileSize"),
  rowCount: integer("rowCount"),
  successCount: integer("successCount"),
  errorCount: integer("errorCount"),
  results: json("results"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PredictionLog = typeof predictionLogs.$inferSelect;
export type InsertPredictionLog = typeof predictionLogs.$inferInsert;

// Customer segment history table
export const customerSegmentHistory = pgTable("customer_segment_history", {
  id: serial("id").primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  pipelineRunId: integer("pipelineRunId").notNull(),
  segment: varchar("segment", { length: 50 }).notNull(),
  recency: real("recency"),
  frequency: real("frequency"),
  monetary: real("monetary"),
  aov: real("aov"),
  tenure: real("tenure"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustomerSegmentHistory = typeof customerSegmentHistory.$inferSelect;
export type InsertCustomerSegmentHistory = typeof customerSegmentHistory.$inferInsert;

// Segment migrations table
export const segmentMigrations = pgTable("segment_migrations", {
  id: serial("id").primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  fromSegment: varchar("fromSegment", { length: 50 }),
  toSegment: varchar("toSegment", { length: 50 }).notNull(),
  pipelineRunId: integer("pipelineRunId").notNull(),
  migrationDate: timestamp("migrationDate").defaultNow().notNull(),
});
export type SegmentMigration = typeof segmentMigrations.$inferSelect;
export type InsertSegmentMigration = typeof segmentMigrations.$inferInsert;

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  segmentName: varchar("segmentName", { length: 50 }).notNull(),
  campaignType: varchar("campaignType", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetAudience: integer("targetAudience"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  discountCode: varchar("discountCode", { length: 100 }),
  emailTemplate: text("emailTemplate"),
  owner: varchar("owner", { length: 255 }),
  scheduledDate: timestamp("scheduledDate"),
  sentCount: integer("sentCount").default(0),
  openCount: integer("openCount").default(0),
  clickCount: integer("clickCount").default(0),
  conversionCount: integer("conversionCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Drift metrics table
export const driftMetrics = pgTable("drift_metrics", {
  id: serial("id").primaryKey(),
  pipelineRunId: integer("pipelineRunId").notNull(),
  feature: varchar("feature", { length: 50 }).notNull(),
  trainingMean: real("trainingMean"),
  trainingStd: real("trainingStd"),
  currentMean: real("currentMean"),
  currentStd: real("currentStd"),
  driftScore: real("driftScore"),
  isDrifted: boolean("isDrifted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DriftMetric = typeof driftMetrics.$inferSelect;
export type InsertDriftMetric = typeof driftMetrics.$inferInsert;


// Pipeline runs table
export const pipeline_runs = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 15 }).default("pending").notNull(),
  triggeredBy: varchar("triggeredBy", { length: 15 }).default("manual").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  customersProcessed: integer("customersProcessed"),
  logs: text("logs"),
  errorMessage: text("errorMessage"),
});

export type PipelineRun = typeof pipeline_runs.$inferSelect;
export type InsertPipelineRun = typeof pipeline_runs.$inferInsert;

// Scheduled jobs table
export const scheduled_jobs = pgTable("scheduled_jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduledJob = typeof scheduled_jobs.$inferSelect;
export type InsertScheduledJob = typeof scheduled_jobs.$inferInsert;
