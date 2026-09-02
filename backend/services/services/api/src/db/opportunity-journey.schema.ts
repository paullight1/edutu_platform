import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  OpportunityJourneyOutcome,
  OpportunityJourneyState,
} from "../opportunity-journeys/opportunity-journey.types";
import { opportunities } from "./schema";

export type OpportunityIntentStatus = "active" | "archived";
export type OpportunityIntentGoal =
  | "study_funding"
  | "work_experience"
  | "employment"
  | "business_funding"
  | "leadership_growth"
  | "skill_building"
  | "open_exploration";
export type OpportunityIntentRemotePreference =
  | "required"
  | "preferred"
  | "neutral"
  | "excluded";
export type OpportunityIntentReadinessMode = "apply_now" | "prepare";
export type OpportunityIntentSource = "inferred" | "explicit";
export type OpportunityJourneyPriority = "primary" | "secondary" | "none";
export type OpportunityJourneyEligibilityStatus =
  | "eligible"
  | "likely"
  | "unclear"
  | "ineligible";
export type OpportunityJourneyTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";
export type OpportunityJourneyTaskSource = "template" | "user" | "ai";
export type OpportunityJourneyEventSource =
  | "web"
  | "mobile"
  | "backend"
  | "migration";

export const opportunityIntents = pgTable(
  "opportunity_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    status: text("status")
      .$type<OpportunityIntentStatus>()
      .notNull()
      .default("active"),
    goalKey: text("goal_key").$type<OpportunityIntentGoal>().notNull(),
    opportunityTypes: text("opportunity_types").array().notNull().default([]),
    locations: text("locations").array().notNull().default([]),
    remotePreference: text("remote_preference")
      .$type<OpportunityIntentRemotePreference>()
      .notNull()
      .default("neutral"),
    actionHorizonDays: integer("action_horizon_days").notNull().default(90),
    weeklyHours: integer("weekly_hours").notNull().default(4),
    readinessMode: text("readiness_mode")
      .$type<OpportunityIntentReadinessMode>()
      .notNull()
      .default("apply_now"),
    source: text("source")
      .$type<OpportunityIntentSource>()
      .notNull()
      .default("explicit"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("opportunity_intents_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const userOpportunityJourneys = pgTable(
  "user_opportunity_journeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    intentId: uuid("intent_id").references(() => opportunityIntents.id, {
      onDelete: "set null",
    }),
    state: text("state").$type<OpportunityJourneyState>().notNull(),
    priority: text("priority")
      .$type<OpportunityJourneyPriority>()
      .notNull()
      .default("none"),
    eligibilityStatus: text("eligibility_status")
      .$type<OpportunityJourneyEligibilityStatus>()
      .notNull()
      .default("unclear"),
    eligibilityConfidence: numeric("eligibility_confidence", {
      precision: 4,
      scale: 3,
    })
      .notNull()
      .default("0"),
    eligibilityReasons: jsonb("eligibility_reasons")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    eligibilityBlockers: jsonb("eligibility_blockers")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    matchScoreSnapshot: integer("match_score_snapshot"),
    matchReasonsSnapshot: jsonb("match_reasons_snapshot")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    matchRisksSnapshot: jsonb("match_risks_snapshot")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    estimatedEffortHours: numeric("estimated_effort_hours", {
      precision: 6,
      scale: 2,
    }),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    applyLinkOpenedAt: timestamp("apply_link_opened_at", {
      withTimezone: true,
    }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    outcome: text("outcome").$type<OpportunityJourneyOutcome>(),
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_opportunity_journeys_user_id_opportunity_id_key").on(
      table.userId,
      table.opportunityId,
    ),
    uniqueIndex("opportunity_journeys_one_active_primary")
      .on(table.userId)
      .where(
        sql`${table.priority} = 'primary' and ${table.state} in ('pursuing', 'preparing', 'ready_to_apply', 'application_opened')`,
      ),
    index("opportunity_journeys_user_stage_idx").on(
      table.userId,
      table.state,
      table.updatedAt.desc(),
    ),
    index("opportunity_journeys_opportunity_idx").on(table.opportunityId),
  ],
);

export const opportunityJourneyTasks = pgTable(
  "opportunity_journey_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => userOpportunityJourneys.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    status: text("status")
      .$type<OpportunityJourneyTaskStatus>()
      .notNull()
      .default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    required: boolean("required").notNull().default(true),
    source: text("source")
      .$type<OpportunityJourneyTaskSource>()
      .notNull()
      .default("template"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("opportunity_journey_tasks_journey_id_position_key").on(
      table.journeyId,
      table.position,
    ),
    index("journey_tasks_next_action_idx").on(
      table.journeyId,
      table.status,
      table.dueAt,
      table.position,
    ),
  ],
);

export const opportunityJourneyEvents = pgTable(
  "opportunity_journey_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    journeyId: uuid("journey_id").references(() => userOpportunityJourneys.id, {
      onDelete: "cascade",
    }),
    intentId: uuid("intent_id").references(() => opportunityIntents.id, {
      onDelete: "set null",
    }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    source: text("source").$type<OpportunityJourneyEventSource>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("opportunity_journey_events_user_id_idempotency_key_key").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("journey_events_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("journey_events_type_created_idx").on(
      table.eventType,
      table.createdAt.desc(),
    ),
  ],
);

export type OpportunityIntent = typeof opportunityIntents.$inferSelect;
export type NewOpportunityIntent = typeof opportunityIntents.$inferInsert;
export type OpportunityJourney = typeof userOpportunityJourneys.$inferSelect;
export type NewOpportunityJourney = typeof userOpportunityJourneys.$inferInsert;
export type OpportunityJourneyTask =
  typeof opportunityJourneyTasks.$inferSelect;
export type NewOpportunityJourneyTask =
  typeof opportunityJourneyTasks.$inferInsert;
export type OpportunityJourneyEvent =
  typeof opportunityJourneyEvents.$inferSelect;
export type NewOpportunityJourneyEvent =
  typeof opportunityJourneyEvents.$inferInsert;
