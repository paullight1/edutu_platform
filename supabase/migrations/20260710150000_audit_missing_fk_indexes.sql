-- Audit follow-up: add missing indexes on frequently-filtered foreign keys /
-- lookup columns. All idempotent; safe to run on live.
--
-- Note: blog_posts.slug already has a UNIQUE constraint (blog_posts_slug_key),
-- which is backed by a unique index, so no additional slug index is created.

-- Guarded: some tables exist only in the Drizzle schema, not in every environment.
DO $$
BEGIN
  IF to_regclass('public.milestones') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON public.milestones (goal_id);
  END IF;
  IF to_regclass('public.quiz_questions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON public.quiz_questions (quiz_id);
  END IF;
  IF to_regclass('public.quiz_attempts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts (user_id);
  END IF;
  IF to_regclass('public.transactions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions (user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON public.blog_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts (status);
