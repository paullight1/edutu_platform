begin;

-- These user-id-accepting overloads were removed by the canonical credit
-- hardening migration. Keep this cutover safe on databases where they are
-- already absent; the caller-scoped spend_credits(integer, text) RPC remains
-- available to authenticated users for their own account.
do $$
begin
  if to_regprocedure('public.spend_credits(text, integer, text, text, text)') is not null then
    execute 'revoke execute on function public.spend_credits(text, integer, text, text, text) from public, anon, authenticated';
    execute 'grant execute on function public.spend_credits(text, integer, text, text, text) to service_role';
  end if;

  if to_regprocedure('public.add_credits(text, integer, text, text, text)') is not null then
    execute 'revoke execute on function public.add_credits(text, integer, text, text, text) from public, anon, authenticated';
    execute 'grant execute on function public.add_credits(text, integer, text, text, text) to service_role';
  end if;
end;
$$;

commit;
