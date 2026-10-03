-- ============================================================
-- 002_rls.sql — Row Level Security policies
-- ============================================================
-- Principios:
--   - Frontend = UX, RLS/DB = seguridad real
--   - Sin políticas recursivas: usar helpers SECURITY DEFINER
--   - Nunca confiar en el cliente
-- ============================================================

-- ------------------------------------------------------------
-- Helpers SECURITY DEFINER (evitan recursión de policies)
-- ------------------------------------------------------------

-- ¿El usuario actual es owner de este mundialito?
create or replace function public.is_mundialito_owner(target_mundialito_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mundialitos m
    where m.id = target_mundialito_id
      and m.owner_id = auth.uid()
  );
$$;

-- ¿El usuario actual participa (membership) de este mundialito?
create or replace function public.is_mundialito_participant(target_mundialito_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    where p.mundialito_id = target_mundialito_id
      and p.auth_user_id = auth.uid()
  );
$$;

-- ¿Puede el usuario actual ver este mundialito?
-- Owner o participante autenticado.
-- Los participantes sin cuenta (auth_user_id null) no dependen de RLS
-- para lectura: se resuelven con invite_token (ver 003).
create or replace function public.can_read_mundialito(target_mundialito_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_mundialito_owner(target_mundialito_id)
      or public.is_mundialito_participant(target_mundialito_id);
$$;

-- ------------------------------------------------------------
-- RLS: habilitar (idempotente)
-- ------------------------------------------------------------
alter table public.mundialitos  enable row level security;
alter table public.participants enable row level security;
alter table public.items        enable row level security;
alter table public.votes        enable row level security;

-- ------------------------------------------------------------
-- Limpieza de policies previas (para re-correr el archivo)
-- ------------------------------------------------------------
drop policy if exists "mundialitos_select"          on public.mundialitos;
drop policy if exists "mundialitos_insert"          on public.mundialitos;
drop policy if exists "mundialitos_update"          on public.mundialitos;
drop policy if exists "mundialitos_delete"          on public.mundialitos;

drop policy if exists "participants_select"         on public.participants;
drop policy if exists "participants_insert"         on public.participants;
drop policy if exists "participants_update"         on public.participants;
drop policy if exists "participants_delete"         on public.participants;

drop policy if exists "items_select"                on public.items;
drop policy if exists "items_insert"                on public.items;
drop policy if exists "items_update"                on public.items;
drop policy if exists "items_delete"                on public.items;

drop policy if exists "votes_select"                on public.votes;
drop policy if exists "votes_insert"                on public.votes;
drop policy if exists "votes_update"                on public.votes;
drop policy if exists "votes_delete"                on public.votes;

-- ============================================================
-- MUNDIALITOS
-- ============================================================

-- Lectura: owner o participante autenticado
create policy "mundialitos_select"
on public.mundialitos
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_mundialito_participant(id)
);

-- Creación: solo el owner puede ser uno mismo
create policy "mundialitos_insert"
on public.mundialitos
for insert
to authenticated
with check (owner_id = auth.uid());

-- Edición: solo el owner, y solo mientras esté en DRAFT.
-- Iniciar (DRAFT -> ACTIVE) y finalizar (ACTIVE -> FINISHED)
-- los permite el owner en cualquier estado de origen.
create policy "mundialitos_update"
on public.mundialitos
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Borrado: solo el owner
create policy "mundialitos_delete"
on public.mundialitos
for delete
to authenticated
using (owner_id = auth.uid());

-- ============================================================
-- PARTICIPANTS
-- ============================================================

-- Lectura: quien puede leer el mundialito padre
create policy "participants_select"
on public.participants
for select
to authenticated
using (public.can_read_mundialito(mundialito_id));

-- Alta: solo el owner, y solo en DRAFT
create policy "participants_insert"
on public.participants
for insert
to authenticated
with check (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- Edición: solo el owner en DRAFT.
-- Permite vincular auth_user_id (claim de invitación) al owner.
create policy "participants_update"
on public.participants
for update
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
)
with check (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- Baja: solo el owner en DRAFT
create policy "participants_delete"
on public.participants
for delete
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- ============================================================
-- ITEMS
-- ============================================================

-- Lectura: quien puede leer el mundialito padre
create policy "items_select"
on public.items
for select
to authenticated
using (public.can_read_mundialito(mundialito_id));

-- Alta: solo el owner en DRAFT
create policy "items_insert"
on public.items
for insert
to authenticated
with check (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- Edición: solo el owner en DRAFT
create policy "items_update"
on public.items
for update
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
)
with check (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- Baja: solo el owner en DRAFT
create policy "items_delete"
on public.items
for delete
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'DRAFT'
  )
);

-- ============================================================
-- VOTES
-- ============================================================
-- Regla clave: cada participante solo puede crear/leer/modificar
-- SUS propios votos, y únicamente con el mundialito en ACTIVE.
-- ============================================================

-- Helper: participant_id del usuario actual dentro de un mundialito
create or replace function public.current_participant_id(target_mundialito_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.participants p
  where p.mundialito_id = target_mundialito_id
    and p.auth_user_id = auth.uid()
  limit 1;
$$;

-- Lectura: el owner ve todos los votos de sus mundialitos;
-- el participante ve solo los suyos.
create policy "votes_select"
on public.votes
for select
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  or participant_id = public.current_participant_id(mundialito_id)
);

-- Creación: solo el propio participante, y solo en ACTIVE
create policy "votes_insert"
on public.votes
for insert
to authenticated
with check (
  participant_id = public.current_participant_id(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'ACTIVE'
  )
);

-- Edición: solo el propio voto, y solo en ACTIVE
create policy "votes_update"
on public.votes
for update
to authenticated
using (
  participant_id = public.current_participant_id(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'ACTIVE'
  )
)
with check (
  participant_id = public.current_participant_id(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status = 'ACTIVE'
  )
);

-- Borrado: el owner puede limpiar votos (corrección/admin);
-- el participante NO borra su voto, solo lo modifica.
create policy "votes_delete"
on public.votes
for delete
to authenticated
using (public.is_mundialito_owner(mundialito_id));

-- ============================================================
-- Permisos
-- ============================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.mundialitos  to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, insert, update, delete on public.items        to authenticated;
grant select, insert, update, delete on public.votes        to authenticated;

-- Los helpers son SECURITY DEFINER: no necesitan permisos de tabla.
-- Se revocan a PUBLIC y se otorgan solo a authenticated, porque todas
-- las policies que los usan están declaradas `to authenticated`.
revoke all on function public.is_mundialito_owner(uuid) from public;
revoke all on function public.is_mundialito_participant(uuid) from public;
revoke all on function public.can_read_mundialito(uuid) from public;
revoke all on function public.current_participant_id(uuid) from public;

grant execute on function public.is_mundialito_owner(uuid) to authenticated;
grant execute on function public.is_mundialito_participant(uuid) to authenticated;
grant execute on function public.can_read_mundialito(uuid) to authenticated;
grant execute on function public.current_participant_id(uuid) to authenticated;