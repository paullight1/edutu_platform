import { toSafeUUID } from '../_shared/user-id.ts';

const deletionTargets = [
  ["application_documents", "user_id"],
  ["user_uploads", "user_id"],
  ["ai_documents", "user_id"],
  ["user_ai_memories", "user_id"],
  ["notification_push_tokens", "user_id"],
  ["saved_searches", "user_id"],
  ["chat_messages", "user_id"],
  ["chat_threads", "user_id"],
  ["flashcard_reviews", "user_id"],
  ["flashcard_study_sessions", "user_id"],
  ["flashcard_decks", "user_id"],
  ["quiz_attempts", "user_id"],
  ["quizzes", "user_id"],
  ["goals", "user_id"],
  ["bookmarks", "user_id"],
  ["user_opportunity_bookmarks", "user_id"],
  ["user_opportunity_preferences", "user_id"],
  ["user_opportunity_signals", "user_id"],
  ["notifications", "user_id"],
  ["user_notifications", "user_id"],
  ["opportunity_applications", "user_id"],
  ["roadmap_enrollments", "user_id"],
  ["user_roadmap_intents", "user_id"],
  ["roadmap_feedback", "user_id"],
  ["creator_applications", "user_id"],
  ["creator-applications", "user_id"],
  ["community_posts", "user_id"],
  ["community_group_members", "user_id"],
  ["community_join_requests", "user_id"],
  ["marketplace_enrollments", "user_id"],
  ["user_cvs", "user_id"],
  ["tickets", "user_id"],
  ["profiles", "user_id"],
] as const;

// Shared parents and financial records need a separate, verified retention and
// anonymisation workflow. Deleting them here can erase other users' data or
// remove records needed for accounting and payment-event deduplication.

// These legacy tables were absent from the inspected self-hosted schema.
// Missing any other table is an error: silently skipping current data could
// falsely tell a user that their account was deleted.
const optionalLegacyTables = new Set([
  'creator-applications', 'marketplace_items', 'quiz_attempts', 'quizzes',
  'tickets', 'transactions', 'user_opportunity_bookmarks', 'wallet_transactions',
]);

export async function deleteUserRows(supabase: any, userId: string): Promise<void> {
  const safeId = toSafeUUID(userId);
  for (const [table, column] of deletionTargets) {
    for (const id of new Set([userId, safeId])) {
      const { error } = await supabase.from(table).delete().eq(column, id);
      if (!error) continue;
      if (optionalLegacyTables.has(table) && ['42P01', 'PGRST205'].includes(error.code)) break;
      if (id === userId && id !== safeId && error.code === '22P02' &&
          String(error.message).includes('invalid input syntax for type uuid') &&
          String(error.message).includes(userId)) continue;
      throw error;
    }
  }
}
