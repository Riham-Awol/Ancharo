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

revoke all on function public.admin_list_users() from anon;
grant execute on function public.public_stats() to anon, authenticated;
grant execute on function public.public_supporters(int) to anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;

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

-- --------------------------------------------------------------------------
-- 9. PHONE SIGN-IN SUPPORT
--    People sign in with phone number + password. Admins can reset a forgotten
--    password to 123456; the person must then choose a new one when they sign in.
-- --------------------------------------------------------------------------
alter table public.profiles add column if not exists must_change_password boolean not null default false;

create or replace function public.admin_reset_password(target uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  update auth.users set encrypted_password = crypt('123456', gen_salt('bf')), updated_at = now() where id = target;
  update public.profiles set must_change_password = true where id = target;
end $$;
revoke all on function public.admin_reset_password(uuid) from anon;
grant execute on function public.admin_reset_password(uuid) to authenticated;

-- Amharic versions of announcements (optional; English is used when empty)
alter table public.announcements add column if not exists title_am text check (char_length(title_am) <= 200);
alter table public.announcements add column if not exists body_am text check (char_length(body_am) <= 20000);

-- --------------------------------------------------------------------------
-- 10. ADOPT A PROJECT
-- --------------------------------------------------------------------------
create table if not exists public.projects (
  id              bigint generated always as identity primary key,
  title           text not null check (char_length(title) between 1 and 200),
  title_am        text check (char_length(title_am) <= 200),
  description     text not null default '' check (char_length(description) <= 5000),
  description_am  text check (char_length(description_am) <= 5000),
  image_url       text check (char_length(image_url) <= 500),
  goal            numeric(14, 2) not null check (goal > 0),
  status          text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  sort            int not null default 0,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.projects enable row level security;
drop policy if exists "projects: public read" on public.projects;
create policy "projects: public read" on public.projects for select to anon, authenticated using (true);
drop policy if exists "projects: admin insert" on public.projects;
create policy "projects: admin insert" on public.projects for insert to authenticated with check (public.is_admin());
drop policy if exists "projects: admin update" on public.projects;
create policy "projects: admin update" on public.projects for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "projects: admin delete" on public.projects;
create policy "projects: admin delete" on public.projects for delete to authenticated using (public.is_admin());

-- A donation can be given to a specific project
alter table public.donations add column if not exists project_id bigint references public.projects (id) on delete set null;

create table if not exists public.project_adoptions (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references public.projects (id) on delete cascade,
  user_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  display_name  text not null check (char_length(display_name) between 1 and 100),
  pledge        numeric(14, 2) not null check (pledge > 0 and pledge < 1000000000),
  message       text check (char_length(message) <= 1000),
  show_public   boolean not null default true,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at    timestamptz not null default now()
);
create index if not exists adoptions_project_idx on public.project_adoptions (project_id);

alter table public.project_adoptions enable row level security;
drop policy if exists "adoptions: read own or admin" on public.project_adoptions;
create policy "adoptions: read own or admin" on public.project_adoptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "adoptions: pledge as self" on public.project_adoptions;
create policy "adoptions: pledge as self" on public.project_adoptions
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "adoptions: admin update" on public.project_adoptions;
create policy "adoptions: admin update" on public.project_adoptions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "adoptions: delete own pending or admin" on public.project_adoptions;
create policy "adoptions: delete own pending or admin" on public.project_adoptions
  for delete to authenticated using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- Projects with money raised (approved donations), confirmed pledges and public adopter names
create or replace function public.public_projects()
returns table (id bigint, title text, title_am text, description text, description_am text, image_url text,
               goal numeric, status text, raised numeric, pledged numeric, adopters text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.title_am, p.description, p.description_am, p.image_url, p.goal, p.status,
    coalesce((select sum(d.amount) from public.donations d where d.project_id = p.id and d.status = 'approved'), 0),
    coalesce((select sum(a.pledge) from public.project_adoptions a where a.project_id = p.id and a.status = 'confirmed'), 0),
    coalesce((select array_agg(a.display_name order by a.created_at) from public.project_adoptions a
              where a.project_id = p.id and a.status = 'confirmed' and a.show_public), '{}')
  from public.projects p
  order by p.sort, p.created_at;
$$;
grant execute on function public.public_projects() to anon, authenticated;

-- --------------------------------------------------------------------------
-- 11. LET THE COMMUNITY DECIDE (votes)
-- --------------------------------------------------------------------------
create table if not exists public.proposals (
  id              bigint generated always as identity primary key,
  title           text not null check (char_length(title) between 1 and 200),
  title_am        text check (char_length(title_am) <= 200),
  description     text not null default '' check (char_length(description) <= 5000),
  description_am  text check (char_length(description_am) <= 5000),
  image_url       text check (char_length(image_url) <= 500),
  options         text[] not null check (cardinality(options) between 2 and 10),
  options_am      text[],
  closes_at       timestamptz,
  is_open         boolean not null default true,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.proposals enable row level security;
drop policy if exists "proposals: public read" on public.proposals;
create policy "proposals: public read" on public.proposals for select to anon, authenticated using (true);
drop policy if exists "proposals: admin insert" on public.proposals;
create policy "proposals: admin insert" on public.proposals for insert to authenticated with check (public.is_admin());
drop policy if exists "proposals: admin update" on public.proposals;
create policy "proposals: admin update" on public.proposals for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "proposals: admin delete" on public.proposals;
create policy "proposals: admin delete" on public.proposals for delete to authenticated using (public.is_admin());

create table if not exists public.votes (
  proposal_id  bigint not null references public.proposals (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  choice       int not null check (choice >= 0),
  created_at   timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

-- Is this a valid vote on a proposal that is still open?
create or replace function public.can_vote(pid bigint, opt int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals
    where id = pid and is_open and (closes_at is null or closes_at > now()) and opt < cardinality(options)
  );
$$;

alter table public.votes enable row level security;
drop policy if exists "votes: read own or admin" on public.votes;
create policy "votes: read own or admin" on public.votes
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "votes: vote as self" on public.votes;
create policy "votes: vote as self" on public.votes
  for insert to authenticated with check (user_id = auth.uid() and public.can_vote(proposal_id, choice));
drop policy if exists "votes: change own vote" on public.votes;
create policy "votes: change own vote" on public.votes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_vote(proposal_id, choice));
drop policy if exists "votes: remove own vote" on public.votes;
create policy "votes: remove own vote" on public.votes
  for delete to authenticated using (user_id = auth.uid() and public.can_vote(proposal_id, 0));

-- Vote counts only (never who voted for what)
create or replace function public.proposal_results()
returns table (proposal_id bigint, choice int, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.proposal_id, v.choice, count(*) from public.votes v group by v.proposal_id, v.choice;
$$;
grant execute on function public.proposal_results() to anon, authenticated;

-- --------------------------------------------------------------------------
-- 12. VOLUNTEERS (help with your profession instead of money)
-- --------------------------------------------------------------------------
create table if not exists public.volunteers (
  id            bigint generated always as identity primary key,
  user_id       uuid unique default auth.uid() references public.profiles (id) on delete cascade,
  profession    text not null check (char_length(profession) between 1 and 80),
  skills        text check (char_length(skills) <= 500),
  availability  text check (char_length(availability) <= 200),
  location      text check (char_length(location) <= 120),
  message       text check (char_length(message) <= 1000),
  status        text not null default 'new' check (status in ('new', 'contacted', 'active')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- Only admins change a volunteer's status.
create or replace function public.protect_volunteer_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change the status';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists protect_volunteer_status on public.volunteers;
create trigger protect_volunteer_status before update on public.volunteers
  for each row execute function public.protect_volunteer_status();

alter table public.volunteers enable row level security;
drop policy if exists "volunteers: read own or admin" on public.volunteers;
create policy "volunteers: read own or admin" on public.volunteers
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "volunteers: sign up self" on public.volunteers;
create policy "volunteers: sign up self" on public.volunteers
  for insert to authenticated with check (user_id = auth.uid() and status = 'new');
drop policy if exists "volunteers: update own or admin" on public.volunteers;
create policy "volunteers: update own or admin" on public.volunteers
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "volunteers: delete own or admin" on public.volunteers;
create policy "volunteers: delete own or admin" on public.volunteers
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Public: how many volunteers per profession (no names)
create or replace function public.volunteer_stats()
returns table (profession text, people bigint)
language sql stable security definer set search_path = public as $$
  select v.profession, count(*) from public.volunteers v group by v.profession order by count(*) desc, v.profession;
$$;
grant execute on function public.volunteer_stats() to anon, authenticated;

-- --------------------------------------------------------------------------
-- 13. ADMIN LISTS with names and phone numbers
-- --------------------------------------------------------------------------
create or replace function public.admin_list_volunteers()
returns table (id bigint, user_id uuid, full_name text, phone text, profession text, skills text,
               availability text, location text, message text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select v.id, v.user_id, p.full_name, p.phone, v.profession, v.skills, v.availability, v.location,
           v.message, v.status, v.created_at
    from public.volunteers v left join public.profiles p on p.id = v.user_id
    order by v.created_at desc;
end $$;

create or replace function public.admin_list_adoptions()
returns table (id bigint, project_id bigint, project_title text, user_id uuid, full_name text, phone text,
               display_name text, pledge numeric, message text, show_public boolean, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select a.id, a.project_id, pr.title, a.user_id, p.full_name, p.phone, a.display_name, a.pledge,
           a.message, a.show_public, a.status, a.created_at
    from public.project_adoptions a
    join public.projects pr on pr.id = a.project_id
    left join public.profiles p on p.id = a.user_id
    order by a.created_at desc;
end $$;

-- Donations list now also says which project a donation was for
drop function if exists public.admin_list_donations(text);
create or replace function public.admin_list_donations(status_filter text default null)
returns table (id bigint, user_id uuid, donor_name text, donor_email text, donor_phone text,
               amount numeric, method text, reference text, donated_on date, screenshot_path text,
               message text, show_name boolean, display_name text, status text, admin_note text,
               reviewed_at timestamptz, created_at timestamptz, project_id bigint, project_title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select d.id, d.user_id, p.full_name, u.email::text, p.phone,
           d.amount, d.method, d.reference, d.donated_on, d.screenshot_path,
           d.message, d.show_name, d.display_name, d.status, d.admin_note,
           d.reviewed_at, d.created_at, d.project_id, pr.title
    from public.donations d
    left join public.profiles p on p.id = d.user_id
    left join auth.users u on u.id = d.user_id
    left join public.projects pr on pr.id = d.project_id
    where status_filter is null or d.status = status_filter
    order by d.created_at desc;
end $$;

revoke all on function public.admin_list_volunteers() from anon;
revoke all on function public.admin_list_adoptions() from anon;
revoke all on function public.admin_list_donations(text) from anon;
grant execute on function public.admin_list_volunteers() to authenticated;
grant execute on function public.admin_list_adoptions() to authenticated;
grant execute on function public.admin_list_donations(text) to authenticated;

-- --------------------------------------------------------------------------
-- 14. REPAIRS + MAKE ADMIN
-- --------------------------------------------------------------------------
-- Accounts created before this file was run have no profile yet: create them now.
insert into public.profiles (id, full_name, phone)
select u.id,
       left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 120),
       left(coalesce(u.raw_user_meta_data ->> 'phone', nullif(split_part(u.email, '@phone.ancharo.app', 1), u.email)), 40)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- People may create their own missing profile (never as admin).
drop policy if exists "profiles: create own" on public.profiles;
create policy "profiles: create own" on public.profiles
  for insert to authenticated with check (id = auth.uid() and role = 'user' and not must_change_password);

-- select make_admin('0911 22 33 44');  → makes that account an admin.
-- Accepts any way of writing the number. Only works in the SQL Editor (or for existing admins).
create or replace function public.make_admin(phone_number text)
returns text language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(phone_number, ''), '\D', '', 'g');
  uid uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if phone_number ~ '^\s*00' then d := substr(d, 3);
  elsif phone_number !~ '^\s*\+' and length(d) = 10 and left(d, 1) = '0' then d := '251' || substr(d, 2);
  elsif phone_number !~ '^\s*\+' and d ~ '^[79][0-9]{8}$' then d := '251' || d;
  end if;
  select id into uid from auth.users where email = d || '@phone.ancharo.app';
  if uid is null then
    return 'No account found for +' || d || '. First create the account on the website (Create account), then run this again.';
  end if;
  insert into public.profiles (id, full_name, phone)
  select u.id, left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 120), d from auth.users u where u.id = uid
  on conflict (id) do nothing;
  update public.profiles set role = 'admin', phone = coalesce(nullif(phone, ''), d) where id = uid;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = uid;
  return 'Done: +' || d || ' is now an admin. Refresh the website.';
end $$;
revoke all on function public.make_admin(text) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 15. COMMUNITY MEMBER CARDS (digital ID, printed and handed out in person)
--     This is a campaign membership card, NOT a government ID.
-- --------------------------------------------------------------------------
alter table public.settings add column if not exists card_phone text check (char_length(card_phone) <= 40);
alter table public.settings add column if not exists card_issuer text check (char_length(card_issuer) <= 80);

create sequence if not exists public.member_card_seq start 1;

create table if not exists public.member_cards (
  id                 bigint generated always as identity primary key,
  card_number        text not null unique
                     default 'ANC-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.member_card_seq')::text, 5, '0'),
  verify_code        text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  user_id            uuid references public.profiles (id) on delete set null,
  full_name          text not null check (char_length(full_name) between 1 and 120),
  full_name_am       text check (char_length(full_name_am) <= 120),
  sex                text check (sex in ('M', 'F')),
  date_of_birth      date,
  phone              text check (char_length(phone) <= 40),
  kebele             text check (char_length(kebele) <= 120),
  role               text not null default 'Member' check (char_length(role) <= 40),
  blood_type         text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  emergency_name     text check (char_length(emergency_name) <= 120),
  emergency_phone    text check (char_length(emergency_phone) <= 40),
  fayda_number       text check (fayda_number ~ '^[0-9]{12}$|^[0-9]{16}$'),
  fayda_verified     boolean not null default false,
  photo_url          text check (char_length(photo_url) <= 500),
  status             text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  issued_on          date,
  expires_on         date,
  printed_count      int not null default 0,
  last_printed_at    timestamptz,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
-- Address printed on the back: city, sub-city, woreda, kebele, house number
alter table public.member_cards add column if not exists city text check (char_length(city) <= 80);
alter table public.member_cards add column if not exists subcity text check (char_length(subcity) <= 80);
alter table public.member_cards add column if not exists woreda text check (char_length(woreda) <= 80);
alter table public.member_cards add column if not exists house_no text check (char_length(house_no) <= 40);
create index if not exists member_cards_user_idx on public.member_cards (user_id);
create unique index if not exists member_cards_one_open_application
  on public.member_cards (user_id) where status = 'pending';

-- Only admins can activate, revoke, date, or mark Fayda as checked.
create or replace function public.protect_member_card()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.fayda_verified := false; new.issued_on := null; new.expires_on := null;
      new.printed_count := 0; new.last_printed_at := null; new.role := 'Member';
      new.card_number := 'ANC-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.member_card_seq')::text, 5, '0');
      new.verify_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    else
      if old.status <> 'pending' then raise exception 'This card can only be changed by an admin'; end if;
      new.status := old.status; new.fayda_verified := old.fayda_verified; new.issued_on := old.issued_on;
      new.expires_on := old.expires_on; new.printed_count := old.printed_count; new.role := old.role;
      new.card_number := old.card_number; new.verify_code := old.verify_code; new.user_id := old.user_id;
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  -- the Fayda tick is cleared when the number changes
  if tg_op = 'UPDATE' and new.fayda_number is distinct from old.fayda_number and not public.is_admin() then
    new.fayda_verified := false;
  end if;
  return new;
end $$;
drop trigger if exists protect_member_card on public.member_cards;
create trigger protect_member_card before insert or update on public.member_cards
  for each row execute function public.protect_member_card();

alter table public.member_cards enable row level security;
drop policy if exists "cards: read own or admin" on public.member_cards;
create policy "cards: read own or admin" on public.member_cards
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "cards: apply for own or admin" on public.member_cards;
create policy "cards: apply for own or admin" on public.member_cards
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "cards: edit own application or admin" on public.member_cards;
create policy "cards: edit own application or admin" on public.member_cards
  for update to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "cards: withdraw own application or admin" on public.member_cards;
create policy "cards: withdraw own application or admin" on public.member_cards
  for delete to authenticated using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- What the QR code shows to anyone who scans it: who the card belongs to and whether it is valid.
-- Never shows phone numbers, Fayda numbers, birth dates or emergency contacts.
create or replace function public.verify_card(code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'card_number', c.card_number, 'full_name', c.full_name, 'full_name_am', c.full_name_am,
    'role', c.role, 'photo_url', c.photo_url, 'issued_on', c.issued_on, 'expires_on', c.expires_on,
    'fayda_verified', c.fayda_verified,
    'status', case when c.status = 'revoked' then 'revoked'
                   when c.status = 'pending' then 'pending'
                   when c.expires_on is not null and c.expires_on < current_date then 'expired'
                   else 'valid' end)
  from public.member_cards c
  where c.verify_code = code and length(code) >= 12;
$$;
grant execute on function public.verify_card(text) to anon, authenticated;

-- Admin: count a print
create or replace function public.mark_cards_printed(ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.member_cards set printed_count = printed_count + 1, last_printed_at = now() where id = any(ids);
end $$;
revoke all on function public.mark_cards_printed(bigint[]) from anon;
grant execute on function public.mark_cards_printed(bigint[]) to authenticated;

-- Card photos: random file names; anyone with the link can view (needed for the scan page),
-- nobody can list them; members upload into their own folder, admins anywhere.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-photos', 'id-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "id-photos: upload own or admin" on storage.objects;
create policy "id-photos: upload own or admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "id-photos: delete own or admin" on storage.objects;
create policy "id-photos: delete own or admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'id-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ==========================================================================
--  MAKE YOURSELF ADMIN (after creating your account on the website)
--  Put your phone number in, select just this line and press Run:
--
--  select make_admin('0911 22 33 44');
-- ==========================================================================
