-- 030: Make the creator-application funnel work under Clerk JWTs.
--
-- APPLIED LIVE 2026-07-12 via Supabase MCP (three migrations:
-- creator_applications_clerk_safe_rls, creator_status_rpcs_dual_key_profiles,
-- drop_anon_upload_creator_applications_bucket). This file mirrors them so the
-- repo stays the source of truth.
--
-- Why: every creator_applications policy compared auth.uid()::text = user_id.
-- auth.uid() casts the JWT sub to uuid, and Clerk subs ("user_…") are not
-- uuids, so the cast ABORTED every insert/select/update from the mobile app —
-- the table had zero rows in production. The app writes user_id as
-- toSafeUUID(clerkId) (mirrored in SQL by public.clerk_id_to_uuid), so
-- policies must accept either representation, like profiles already does.

-- ── creator_applications RLS ────────────────────────────────────────────────
drop policy if exists "creator_applications_insert" on public.creator_applications;
drop policy if exists "creator_applications_select" on public.creator_applications;
drop policy if exists "creator_applications_update" on public.creator_applications;
drop policy if exists "Admins can delete applications" on public.creator_applications;

create policy "creator_applications_insert" on public.creator_applications
  for insert
  with check (
    public.current_app_user_id() is not null
    and (
      user_id = public.current_app_user_id()
      or user_id = public.clerk_id_to_uuid(public.current_app_user_id())
    )
  );

create policy "creator_applications_select" on public.creator_applications
  for select
  using (
    (
      public.current_app_user_id() is not null
      and (
        user_id = public.current_app_user_id()
        or user_id = public.clerk_id_to_uuid(public.current_app_user_id())
      )
    )
    or private.current_app_is_admin()
  );

create policy "creator_applications_update" on public.creator_applications
  for update
  using (
    (
      public.current_app_user_id() is not null
      and (
        user_id = public.current_app_user_id()
        or user_id = public.clerk_id_to_uuid(public.current_app_user_id())
      )
      and status = 'pending'
    )
    or private.current_app_is_admin()
  );

create policy "creator_applications_delete_admin" on public.creator_applications
  for delete
  using (private.current_app_is_admin());

-- ── Dual-key the profile writes in the creator-status RPCs ──────────────────
-- profiles.user_id is dual-keyed in the wild (raw Clerk sub OR safe-uuid), but
-- both RPCs updated by a single exact key, so granting creator status could
-- silently miss the profile row.

CREATE OR REPLACE FUNCTION public.set_creator_status(p_status text, p_user_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller   TEXT    := current_app_user_id();
    v_is_admin BOOLEAN := private.current_app_is_admin();
    v_target   TEXT;
BEGIN
    IF v_caller IS NULL AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('none','pending','rejected','approved','active','suspended') THEN
        RAISE EXCEPTION 'Invalid creator status: %', p_status;
    END IF;
    IF v_is_admin THEN
        v_target := COALESCE(p_user_id, v_caller);
    ELSE
        v_target := v_caller;
        IF p_status NOT IN ('none','pending','rejected') THEN
            RAISE EXCEPTION 'Not authorized to set status %', p_status USING ERRCODE = '42501';
        END IF;
    END IF;
    PERFORM set_config('app.credit_op', 'on', true);
    UPDATE public.profiles
       SET creator_status = p_status, updated_at = NOW()
     WHERE user_id = v_target
        OR user_id = public.clerk_id_to_uuid(v_target)
        OR public.clerk_id_to_uuid(user_id) = v_target;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_creator_application(p_application_id uuid, p_status text, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_app_user_id text; v_current_status text; v_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE user_id = public.current_app_user_id() AND role IN ('admin','super_admin')) THEN
    RETURN jsonb_build_object('error','Unauthorized: admin access required.');
  END IF;
  IF p_status NOT IN ('approved','rejected') THEN
    RETURN jsonb_build_object('error','Invalid status. Must be approved or rejected.');
  END IF;
  SELECT user_id, status, COALESCE(application_kind,'creator')
    INTO v_app_user_id, v_current_status, v_kind
    FROM public.creator_applications WHERE id=p_application_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Application not found.'); END IF;
  IF v_current_status <> 'pending' THEN RETURN jsonb_build_object('error','Application already reviewed.'); END IF;
  UPDATE public.creator_applications SET status=p_status, reviewed_at=now(), reviewer_notes=p_notes
    WHERE id=p_application_id;
  PERFORM set_config('app.credit_op','on',true);
  IF v_kind='mentor' THEN
    UPDATE public.profiles SET mentor_status=p_status
     WHERE user_id = v_app_user_id
        OR user_id = public.clerk_id_to_uuid(v_app_user_id)
        OR public.clerk_id_to_uuid(user_id) = v_app_user_id;
  ELSE
    UPDATE public.profiles SET creator_status=p_status
     WHERE user_id = v_app_user_id
        OR user_id = public.clerk_id_to_uuid(v_app_user_id)
        OR public.clerk_id_to_uuid(user_id) = v_app_user_id;
  END IF;
  RETURN jsonb_build_object('success',true,'status',p_status,'kind',v_kind,'user_id',v_app_user_id);
END;
$function$;

-- ── storage: close the anonymous-upload hole on the private KYC bucket ──────
-- storage.objects had two INSERT policies for creator-applications; this one
-- had no role check at all. "Authenticated Users Upload" already authorizes
-- real users for this bucket.
drop policy if exists "creator_applications_insert" on storage.objects;
