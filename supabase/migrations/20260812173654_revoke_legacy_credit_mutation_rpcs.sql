begin;

revoke execute on function public.spend_credits(text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.add_credits(text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.spend_credits(text, integer, text, text, text) to service_role;
grant execute on function public.add_credits(text, integer, text, text, text) to service_role;

commit;
