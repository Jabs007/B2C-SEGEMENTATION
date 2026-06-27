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

// Pipeline runs table
export const pipelineRuns = pgTable("pipelineRuns", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 15 }).default("pending").notNull(),
  triggeredBy: varchar("triggeredBy", { length: 15 }).default("manual").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  customersProcessed: integer("customersProcessed"),
  logs: text("logs"),
  errorMessage: text("errorMessage"),
});

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRun = typeof pipelineRuns.$inferInsert;

// Scheduled jobs table
export const scheduledJobs = pgTable("scheduledJobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type InsertScheduledJob = typeof scheduledJobs.$inferInsert;
