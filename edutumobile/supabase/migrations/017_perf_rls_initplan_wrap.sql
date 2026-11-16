-- =====================================================
-- PERF: fix auth_rls_initplan (98 advisor warnings)
--
-- RLS policies call auth.uid()/auth.role()/auth.jwt()/
-- current_app_user_id()/private.current_app_is_admin() directly,
-- so Postgres re-evaluates them ONCE PER ROW. Wrapping each call in
-- a scalar subquery — (select auth.uid()) — makes the planner
-- evaluate it a single time per statement (an InitPlan).
--
-- This is SEMANTICS-PRESERVING: it changes only the query plan, not
-- who can see/modify which rows. Idempotent (safe to re-run).
--
-- Applies to every policy in `public` that references one of the five
-- helper calls (122 policies at time of writing).
-- =====================================================

DO $$
DECLARE
  p            record;
  new_qual     text;
  new_check    text;
  clauses      text;
  tokens       text[] := ARRAY[
    'auth.uid()',
    'auth.role()',
    'auth.jwt()',
    'current_app_user_id()',
    'private.current_app_is_admin()'
  ];
  t            text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~
          '(auth\.(uid|role|jwt)\(\)|current_app_user_id\(\)|current_app_is_admin\(\))'
  LOOP
    new_qual  := p.qual;
    new_check := p.with_check;

    -- For each helper call: first unwrap (idempotency), then wrap.
    FOREACH t IN ARRAY tokens LOOP
      IF new_qual IS NOT NULL THEN
        new_qual := replace(new_qual, '(select ' || t || ')', t);
        new_qual := replace(new_qual, t, '(select ' || t || ')');
      END IF;
      IF new_check IS NOT NULL THEN
        new_check := replace(new_check, '(select ' || t || ')', t);
        new_check := replace(new_check, t, '(select ' || t || ')');
      END IF;
    END LOOP;

    -- Build only the clauses that apply to this policy's command.
    clauses := '';
    IF new_qual IS NOT NULL THEN
      clauses := clauses || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      clauses := clauses || ' WITH CHECK (' || new_check || ')';
    END IF;

    IF clauses <> '' THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I%s',
        p.policyname, p.schemaname, p.tablename, clauses
      );
      RAISE NOTICE 'rewrote policy % on %.%', p.policyname, p.schemaname, p.tablename;
    END IF;
  END LOOP;
END$$;
