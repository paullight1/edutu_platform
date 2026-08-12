# Legacy credit RPC cutover

## Scope

Migration `20260812173654_revoke_legacy_credit_mutation_rpcs.sql` removes
client execution of these legacy, caller-supplied-user-id credit mutation
functions:

- `public.spend_credits(text, integer, text, text, text)`
- `public.add_credits(text, integer, text, text, text)`

`PUBLIC`, `anon`, and `authenticated` must not have `EXECUTE` on either
function. The migration retains `service_role` execution as a temporary
cutover allowance. This does not authorize client use of either RPC.

## Caller assessment

Repository scan on 2026-08-12 found no exact references to either legacy
five-argument function under `backend/services/services/api`. Current
canonical billing migrations use service-role-only fulfillment primitives
instead. No backend code was changed.

This is repository evidence only. Task 1 did not establish the production
project, deployed backend revision, or live function inventory, so an
authorized operator must confirm that no deployed caller uses either legacy
function before removing the temporary `service_role` grants or dropping the
functions.

## Staging cutover and verification

1. Confirm staging is the intended Supabase project and contains both exact
   legacy function identities. Do not infer this from the repository.

   ```sql
   select to_regprocedure('public.spend_credits(text, integer, text, text, text)') as spend_credits,
          to_regprocedure('public.add_credits(text, integer, text, text, text)') as add_credits;
   ```

2. Apply `20260812173654_revoke_legacy_credit_mutation_rpcs.sql` through the
   approved Supabase staging deployment path.
3. Run `supabase/tests/security_credit_rpc.sql` against the staging database
   with pgTAP available, or run it locally against a disposable database with
   `npx --yes supabase test db` after `supabase start`.
4. Capture the post-migration ACLs:

   ```sql
   select n.nspname,
          p.proname,
          pg_get_function_identity_arguments(p.oid) as identity_arguments,
          exists (
            select 1
            from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
            where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
          ) as public_execute,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where p.oid in (
     'public.spend_credits(text, integer, text, text, text)'::regprocedure,
     'public.add_credits(text, integer, text, text, text)'::regprocedure
   )
   order by p.proname;
   ```

   Expected: `public_execute`, `anon_execute`, and `authenticated_execute`
   are `false`; `service_role_execute` is `true` while the temporary cutover
   grant remains.

5. Exercise the canonical backend billing flows in staging. Do not test by
   calling either legacy RPC from a client credential.

## Production gate

Do not apply this migration to production until Task 1's target-project,
deployment, migration-history, ACL, and Supabase Advisor checks are complete.
After an approved staging cutover, an authorized operator must rerun the ACL
query above and capture Security and Performance Advisor output for the
verified production project before and after the production migration.

Production was not changed by this task.

## Follow-up and rollback

After confirming no deployed service-role caller needs either function,
submit a separate migration that revokes `service_role` execution and drops
the functions only after a verified caller inventory. Do not restore client
execution as an application rollback; the client-role revocation is a
security boundary. If a backend regression requires mitigation, route it
through a verified canonical billing service/RPC or use the temporary
service-role-only grant while a forward fix is prepared.
