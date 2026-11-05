-- ==========================================================================
--  Rebuild Ancharo: database setup for Supabase
--
--  HOW TO USE: Supabase dashboard → SQL Editor → New query →
--  paste this WHOLE file → Run.  It is safe to run again later
--  (for example after an update); it will not delete your data.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. PROFILES: one row per user account, created automatically on sign-up
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 40),
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

-- Is the person making this request an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(new.raw_user_meta_data ->> 'phone', 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins may change roles, and the last admin can't be removed.
-- (Changes made directly in the SQL editor, where there is no logged-in user, are allowed.)
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change roles';
    end if;
    if old.role = 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'You cannot remove the last admin';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- --------------------------------------------------------------------------
-- 2. SETTINGS: fundraising goal, deadline, and money collected outside the site
-- --------------------------------------------------------------------------
create table if not exists public.settings (
  id              int primary key default 1 check (id = 1),
  goal            numeric(14, 2) not null default 5000000 check (goal > 0),
  currency        text not null default 'ETB' check (char_length(currency) between 1 and 6),
  deadline        date,
  offline_raised  numeric(14, 2) not null default 0 check (offline_raised >= 0),
  offline_donors  int not null default 0 check (offline_donors >= 0),
  updated_at      timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;
drop policy if exists "settings: public read" on public.settings;
create policy "settings: public read" on public.settings for select to anon, authenticated using (true);
drop policy if exists "settings: admin update" on public.settings;
create policy "settings: admin update" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------------------------
-- 3. DONATIONS: submitted by users with a receipt screenshot, approved by admins
-- --------------------------------------------------------------------------
create table if not exists public.donations (
  id               bigint generated always as identity primary key,
  user_id          uuid default auth.uid() references public.profiles (id) on delete set null,
  amount           numeric(14, 2) not null check (amount > 0 and amount < 1000000000),
  method           text not null default '' check (char_length(method) <= 80),
  reference        text check (char_length(reference) <= 120),
  donated_on       date,
  screenshot_path  text not null check (char_length(screenshot_path) <= 300),
  message          text check (char_length(message) <= 1000),
  show_name        boolean not null default false,
  display_name     text check (char_length(display_name) <= 80),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note       text check (char_length(admin_note) <= 1000),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists donations_status_idx on public.donations (status, created_at desc);
create index if not exists donations_user_idx on public.donations (user_id);

-- Record who reviewed a donation and when.
create or replace function public.stamp_donation_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stamp_donation_review on public.donations;
create trigger stamp_donation_review
  before update on public.donations
  for each row execute function public.stamp_donation_review();

alter table public.donations enable row level security;

drop policy if exists "donations: read own or admin" on public.donations;
create policy "donations: read own or admin" on public.donations
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Users can only submit for themselves, always as "pending", with a receipt in their own folder.
drop policy if exists "donations: submit own" on public.donations;
create policy "donations: submit own" on public.donations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and admin_note is null
    and reviewed_by is null
    and reviewed_at is null
    and screenshot_path like auth.uid()::text || '/%'
  );

drop policy if exists "donations: admin update" on public.donations;
create policy "donations: admin update" on public.donations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "donations: delete own pending or admin" on public.donations;
create policy "donations: delete own pending or admin" on public.donations
  for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- --------------------------------------------------------------------------
-- 4. ANNOUNCEMENTS (news posts)
-- --------------------------------------------------------------------------
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 20000),
  tag         text not null default 'News' check (char_length(tag) <= 40),
  image_url   text check (char_length(image_url) <= 500),
  pinned      boolean not null default false,
  published   boolean not null default true,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists announcements_created_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;
drop policy if exists "announcements: public read published" on public.announcements;
create policy "announcements: public read published" on public.announcements
  for select to anon, authenticated using (published or public.is_admin());
drop policy if exists "announcements: admin insert" on public.announcements;
create policy "announcements: admin insert" on public.announcements
  for insert to authenticated with check (public.is_admin());
drop policy if exists "announcements: admin update" on public.announcements;
create policy "announcements: admin update" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "announcements: admin delete" on public.announcements;
create policy "announcements: admin delete" on public.announcements
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- 5. GALLERY PHOTOS
-- --------------------------------------------------------------------------
create table if not exists public.gallery_photos (
  id          bigint generated always as identity primary key,
  image_url   text not null check (char_length(image_url) <= 500),
  caption     text not null default '' check (char_length(caption) <= 200),
  category    text not null default 'landscape' check (category in ('landscape', 'city', 'projects')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.gallery_photos enable row level security;
drop policy if exists "gallery: public read" on public.gallery_photos;
create policy "gallery: public read" on public.gallery_photos for select to anon, authenticated using (true);
drop policy if exists "gallery: admin insert" on public.gallery_photos;
create policy "gallery: admin insert" on public.gallery_photos
  for insert to authenticated with check (public.is_admin());
drop policy if exists "gallery: admin update" on public.gallery_photos;
create policy "gallery: admin update" on public.gallery_photos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "gallery: admin delete" on public.gallery_photos;
create policy "gallery: admin delete" on public.gallery_photos
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- 6. EXPENSES: public record of how the money was spent (transparency)
-- --------------------------------------------------------------------------
create table if not exists public.expenses (
  id           bigint generated always as identity primary key,
  spent_on     date not null default current_date,
  project      text not null default '' check (char_length(project) <= 120),
  description  text not null check (char_length(description) between 1 and 500),
  amount       numeric(14, 2) not null check (amount > 0),
  receipt_url  text check (char_length(receipt_url) <= 500),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.expenses enable row level security;
drop policy if exists "expenses: public read" on public.expenses;
create policy "expenses: public read" on public.expenses for select to anon, authenticated using (true);
drop policy if exists "expenses: admin insert" on public.expenses;
create policy "expenses: admin insert" on public.expenses
  for insert to authenticated with check (public.is_admin());
drop policy if exists "expenses: admin update" on public.expenses;
create policy "expenses: admin update" on public.expenses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "expenses: admin delete" on public.expenses;
create policy "expenses: admin delete" on public.expenses
  for delete to authenticated using (public.is_admin());

-- --------------------------------------------------------------------------
-- 7. PUBLIC FUNCTIONS: safe summaries anyone can see (no private data)
-- --------------------------------------------------------------------------

-- Totals for the progress bar.
create or replace function public.public_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'raised',   coalesce((select sum(amount) from public.donations where status = 'approved'), 0) + s.offline_raised,
    'donors',   (select count(*) from public.donations where status = 'approved') + s.offline_donors,
    'spent',    coalesce((select sum(amount) from public.expenses), 0),
    'goal',     s.goal,
    'currency', s.currency,
    'deadline', s.deadline,
    'updated',  greatest(s.updated_at, (select max(reviewed_at) from public.donations where status = 'approved'))
  )
  from public.settings s where s.id = 1;
$$;

-- Supporters wall: only shows a name if the donor ticked "show my name".
create or replace function public.public_supporters(lim int default 30)
returns table (name text, amount numeric, approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when d.show_name
      then coalesce(nullif(trim(d.display_name), ''), nullif(trim(p.full_name), ''), 'Anonymous')
      else 'Anonymous' end,
    d.amount,
    d.reviewed_at
  from public.donations d
  left join public.profiles p on p.id = d.user_id
  where d.status = 'approved'
  order by d.reviewed_at desc nulls last
  limit greatest(1, least(coalesce(lim, 30), 100));
$$;

-- Admin only: list users with their email address and donation totals.
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, phone text, role text, created_at timestamptz,
               donations bigint, approved_total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at,
           (select count(*) from public.donations d where d.user_id = p.id),
           coalesce((select sum(d.amount) from public.donations d where d.user_id = p.id and d.status = 'approved'), 0)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

-- Admin only: donations together with the donor's name and email.
create or replace function public.admin_list_donations(status_filter text default null)
returns table (id bigint, user_id uuid, donor_name text, donor_email text, donor_phone text,
               amount numeric, method text, reference text, donated_on date, screenshot_path text,
               message text, show_name boolean, display_name text, status text, admin_note text,
               reviewed_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select d.id, d.user_id, p.full_name, u.email::text, p.phone,
           d.amount, d.method, d.reference, d.donated_on, d.screenshot_path,
           d.message, d.show_name, d.display_name, d.status, d.admin_note,
           d.reviewed_at, d.created_at
    from public.donations d
    left join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    where status_filter is null or d.status = status_filter
    order by d.created_at desc;
end $$;

revoke all on function public.admin_list_users() from anon;
revoke all on function public.admin_list_donations(text) from anon;
grant execute on function public.public_stats() to anon, authenticated;
grant execute on function public.public_supporters(int) to anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_donations(text) to authenticated;

-- --------------------------------------------------------------------------
-- 8. FILE STORAGE
--    receipts: PRIVATE, donation screenshots (only the donor and admins can see them)
--    media:    PUBLIC, photos for news, gallery and expenses (only admins can upload)
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 6291456,
     array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']),
  ('media', 'media', true, 10485760,
     array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts: upload to own folder" on storage.objects;
create policy "receipts: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts: read own or admin" on storage.objects;
create policy "receipts: read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "receipts: delete own or admin" on storage.objects;
create policy "receipts: delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "media: admin upload" on storage.objects;
create policy "media: admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: admin update" on storage.objects;
create policy "media: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: admin delete" on storage.objects;
create policy "media: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- ==========================================================================
--  MAKE YOURSELF ADMIN (run once, after you have created your account on the website)
--  Replace the email address, then select just this line and press Run:
--
--  update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
-- ==========================================================================
