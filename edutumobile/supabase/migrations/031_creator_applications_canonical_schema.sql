-- 031: One canonical creator_applications schema for all four writers.
--
-- APPLIED LIVE 2026-07-12 via Supabase MCP (same content). Mirrored here so
-- the repo stays the source of truth.
--
-- The table accreted three incompatible column sets (mobile legacy fields,
-- web camelCase fields, backend canonical fields). Consequences before this
-- migration:
--   * mobile mentor-apply violated NOT NULLs it never collects
--     (opportunity_type/title, kyc_image_url) → every mentor application 500'd
--   * web MentorPage wrote a nonexistent submitted_at column → every web
--     application insert failed (and the failure was swallowed client-side)
--   * quoted camelCase duplicates ("proofUrl", "phoneNumber", …) drifted from
--     their snake_case twins
--
-- Canonical rules after this migration:
--   * only user_id / application_kind / status stay NOT NULL — which narrative
--     fields are required is per-kind application logic, not table DDL
--   * snake_case is canonical; a BEFORE trigger folds legacy camelCase writes
--     (already-deployed web bundles) into the snake columns
--   * review metadata = status / reviewer_notes / reviewed_by / reviewed_at

-- ── Relax kind-specific NOT NULLs ────────────────────────────────────────────
ALTER TABLE public.creator_applications
  ALTER COLUMN motivation DROP NOT NULL,
  ALTER COLUMN opportunity_type DROP NOT NULL,
  ALTER COLUMN opportunity_title DROP NOT NULL,
  ALTER COLUMN linkedin_url DROP NOT NULL,
  ALTER COLUMN bio DROP NOT NULL,
  ALTER COLUMN kyc_image_url DROP NOT NULL;

-- ── Canonical columns the review pipeline / web form still lacked ────────────
ALTER TABLE public.creator_applications
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

-- ── Backfill snake_case from the quoted camelCase duplicates ─────────────────
UPDATE public.creator_applications SET
  proof_url       = COALESCE(proof_url, "proofUrl"),
  proof_path      = COALESCE(proof_path, "proofPath"),
  proof_file_name = COALESCE(proof_file_name, "proofFileName"),
  proof_file_type = COALESCE(proof_file_type, "proofFileType"),
  proof_file_size = COALESCE(proof_file_size, "proofFileSize"),
  phone_number    = COALESCE(phone_number, "phoneNumber"),
  consent_accepted = (COALESCE(consent_accepted, false) OR COALESCE("consentAccepted", false))
WHERE "proofUrl" IS NOT NULL
   OR "proofPath" IS NOT NULL
   OR "proofFileName" IS NOT NULL
   OR "proofFileType" IS NOT NULL
   OR "proofFileSize" IS NOT NULL
   OR "phoneNumber" IS NOT NULL
   OR "consentAccepted" IS TRUE;

-- ── Fold future camelCase writes into the canonical columns ──────────────────
-- Old deployed web bundles still insert the quoted camelCase keys; this keeps
-- their data readable through the canonical columns until those clients are
-- gone, at which point the camel columns (and this trigger) can be dropped.
CREATE OR REPLACE FUNCTION public.creator_applications_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.proof_url       := COALESCE(NEW.proof_url, NEW."proofUrl");
  NEW.proof_path      := COALESCE(NEW.proof_path, NEW."proofPath");
  NEW.proof_file_name := COALESCE(NEW.proof_file_name, NEW."proofFileName");
  NEW.proof_file_type := COALESCE(NEW.proof_file_type, NEW."proofFileType");
  NEW.proof_file_size := COALESCE(NEW.proof_file_size, NEW."proofFileSize");
  NEW.phone_number    := COALESCE(NEW.phone_number, NEW."phoneNumber");
  -- Both columns default false, so a plain COALESCE would mask a camel true.
  NEW.consent_accepted := (COALESCE(NEW.consent_accepted, false) OR COALESCE(NEW."consentAccepted", false));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS creator_applications_normalize ON public.creator_applications;
CREATE TRIGGER creator_applications_normalize
  BEFORE INSERT OR UPDATE ON public.creator_applications
  FOR EACH ROW EXECUTE FUNCTION public.creator_applications_normalize();
