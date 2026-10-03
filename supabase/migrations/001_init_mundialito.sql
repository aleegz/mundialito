-- Enable required extensions
create extension if not exists pgcrypto;

-- 1. MUNDIALITOS
create table if not exists public.mundialitos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'FINISHED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for mundialitos
create index if not exists mundialitos_owner_id_idx on public.mundialitos (owner_id);

-- 2. PARTICIPANTS
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  mundialito_id uuid not null references public.mundialitos (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
invite_token_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_mundialito_auth_user_unique unique (mundialito_id, auth_user_id),
  -- Requerido por la FK compuesta de votes: (mundialito_id, participant_id)
  constraint participants_mundialito_id_id_unique unique (mundialito_id, id)
);

-- Indexes for participants
create index if not exists participants_auth_user_id_idx on public.participants (auth_user_id, mundialito_id);

-- 3. ITEMS
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  mundialito_id uuid not null references public.mundialitos (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Requerido por la FK compuesta de votes: (mundialito_id, item_id)
  constraint items_mundialito_id_id_unique unique (mundialito_id, id)
);
 
-- 4. VOTES
create table if not exists public.votes (
  mundialito_id uuid not null,
  participant_id uuid not null,
  item_id uuid not null,
  score smallint not null check (score >= 1 and score <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mundialito_id, participant_id, item_id),
  constraint votes_mundialito_participant_fk
    foreign key (mundialito_id, participant_id)
    references public.participants (mundialito_id, id)
    on delete cascade,
  constraint votes_mundialito_item_fk
    foreign key (mundialito_id, item_id)
    references public.items (mundialito_id, id)
    on delete cascade
);

-- Indexes for votes
create index if not exists votes_item_idx on public.votes (mundialito_id, item_id);

-- Helper: keep updated_at current on updates
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers updated_at
drop trigger if exists set_updated_at_mundialitos on public.mundialitos;
create trigger set_updated_at_mundialitos
  before update on public.mundialitos
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_participants on public.participants;
create trigger set_updated_at_participants
  before update on public.participants
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_items on public.items;
create trigger set_updated_at_items
  before update on public.items
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_votes on public.votes;
create trigger set_updated_at_votes
  before update on public.votes
  for each row execute function public.set_updated_at();