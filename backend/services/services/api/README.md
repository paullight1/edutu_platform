# Backend API (NestJS + Drizzle)

This service manages the core business logic, database interactions, and AI processing for the Edutu platform.

## Why this Architecture?

### 1. NestJS (The Brains)
NestJS provides a structured, scalable backend framework similar to Angular but for Node.js.
- **Why not just Supabase functions?**
  - **AI Timeouts**: Long-running AI agents (e.g., generating a full roadmap) can take 60s+. Serverless functions often time out after 10s. NestJS runs on a server, so it can work as long as needed.
  - **Security**: Complex business rules and sensitive API keys (OpenAI) are safer in a dedicated backend than in client-side code or edge functions.
  - **Queues**: We handle recurring tasks (Daily Missions) using background job queues, which is difficult with just Supabase.

### 2. Drizzle ORM (The Data Layer)
Drizzle connects our TypeScript code to the Postgres database.
- **Why not just Supabase JS Client?**
  - **Type Safety**: Drizzle guarantees that if you change a database column, your code knows about it immediately. If we rename `user_score` to `xp`, our app won't crash at runtime; it will fail to build, protecting users.
  - **Migrations**: We get a strict history of every change made to the DB schema, essential for keeping the App and Mobile versions in sync.

## Setup Guide

### 1. Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase credentials.

```bash
cp .env.example .env
```

### 2. Database Migration
To sync your Drizzle schema with the remote Supabase database:

```bash
# Generate SQL migration file based on schema.ts
npm run db:generate

# Apply migration to the database
npm run db:migrate
```

### 3. Running the Server
```bash
# Development mode
npm run dev

# Production build
npm run build
npm run start:prod
```

## Folder Structure
- `src/db`: Drizzle schema and connection logic.
- `src/modules`: Feature-based modules (e.g., `users`, `missions`, `ai`).
- `test`: End-to-end tests.
