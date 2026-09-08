-- Grant Super Admin to the production operator account.
-- Safe to run multiple times.

insert into public.super_admin_allowed_emails (email)
values ('safecloud88@gmail.com')
on conflict (email) do nothing;

insert into public.platform_admins (user_id)
select u.id
from auth.users u
where lower(trim(u.email)) = lower('safecloud88@gmail.com')
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
