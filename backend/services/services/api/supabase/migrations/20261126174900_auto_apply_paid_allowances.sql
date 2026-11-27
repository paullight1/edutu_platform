begin;

insert into private.auto_apply_plan_limits (plan_tier, monthly_limit)
values ('lite', 5), ('pro', 8), ('scholar', 12)
on conflict (plan_tier) do nothing;

commit;
