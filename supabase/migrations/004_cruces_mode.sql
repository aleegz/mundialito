-- ============================================================
-- 004_cruces_mode.sql — Modo Eliminacion directa (CRUCES)
-- ============================================================
-- Agrega un segundo modo de competicion sobre la misma entidad
-- mundialito. El flujo RANKING (1-10, DRAFT/ACTIVE/FINISHED) queda
-- INTACTO: el modo nuevo es aditivo y solo se activa cuando
-- mundialitos.mode = 'CRUCES'.
--
-- ORDEN OBLIGATORIO: aplicar siempre 001 -> 002 -> 003 -> 004.
-- Re-correr este archivo no falla (idempotente: drops antes de
-- crear, CREATE OR REPLACE, IF NOT EXISTS, grants repetibles).
--
-- Cambios:
--   1. mundialitos.mode ('RANKING'|'CRUCES') + status ampliado.
--   2. participants.status ('JOINED'|'EXCLUDED').
--   3. Tablas nuevas: matches (llaves/bracket persistido) y
--      match_votes (votos A/B por cruce y ronda de desempate).
--   4. Policies nuevas para CRUCES + predicado de lectura publica
--      ampliado (superset del de 003: RANKING no cambia).
--
-- Decisiones de diseno (documentadas en TASKS 31 / explore):
--   - Sin current_match_id en mundialitos: "cruce actual" se deriva
--     como el unico matches con status='OPEN' (indice parcial
--     matches_one_open_per_mundialito). Una sola fuente de verdad.
--   - Sin estados ROUND_FINISHED ni cruces_status separados: el
--     mundialito queda 'VOTING' durante todo el torneo; una ronda
--     terminada es un hecho de matches (todos RESOLVED).
--   - match_votes PK (match_id, participant_id, vote_round): cada
--     ronda de desempate queda persistida (historial completo),
--     no se pisa la ronda empatada.
--   - Secreto del voto: match_votes NO tiene SELECT anonimo mientras
--     el cruce esta OPEN ("el resultado se revela al finalizar").
--     El owner (authenticated) si lee todo para el tally.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MUNDIALITOS: mode + status ampliado
-- ------------------------------------------------------------

-- Modo de competicion. Default 'RANKING': el flujo existente nunca
-- ve un valor nuevo. Se elige al crear/configurar (task 4).
alter table public.mundialitos
  add column if not exists mode text not null default 'RANKING';

alter table public.mundialitos drop constraint if exists mundialitos_mode_check;
alter table public.mundialitos add constraint mundialitos_mode_check
  check (mode in ('RANKING', 'CRUCES'));

-- Status ampliado con los estados del modo CRUCES. El CHECK inline
-- de 001 quedo nombrado mundialitos_status_check; se reemplaza por
-- la union de ambos flujos:
--   RANKING: DRAFT -> ACTIVE -> FINISHED (intacto)
--   CRUCES:  DRAFT -> PARTICIPANTS_OPEN -> PARTICIPANTS_LOCKED
--            -> DRAWN -> VOTING -> FINISHED
-- El mode decide que secuencia es significativa; el server (PATCH)
-- prohibe transiciones cruzadas de modo.
alter table public.mundialitos drop constraint if exists mundialitos_status_check;
alter table public.mundialitos add constraint mundialitos_status_check
  check (status in ('DRAFT', 'ACTIVE', 'FINISHED',
                    'PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                    'DRAWN', 'VOTING'));

-- ------------------------------------------------------------
-- 2. PARTICIPANTS: status (JOINED / EXCLUDED)
-- ------------------------------------------------------------
-- 'JOINED' = compite y puede votar; 'EXCLUDED' = deja de bloquear
-- la finalizacion de cruces. Sus votos historicos permanecen.
-- RANKING usa el default y lo ignora.
alter table public.participants
  add column if not exists status text not null default 'JOINED';

alter table public.participants drop constraint if exists participants_status_check;
alter table public.participants add constraint participants_status_check
  check (status in ('JOINED', 'EXCLUDED'));

-- ------------------------------------------------------------
-- 3. MATCHES: llaves del torneo (bracket persistido)
-- ------------------------------------------------------------
-- Todos los cruces se crean al sortear (task 9): item_a/item_b
-- NULL en rondas futuras = slot TBD hasta que el feeder resuelva.
-- round/position definen el bracket completo; el feeder de (r,p)
-- es (r-1, 2p) y (r-1, 2p+1) (funciones puras en bracket.ts).
-- Las FK compuestas (mundialito_id, item_*) reusan el unique de
-- items: un item no puede cruzar de mundialito (mismo patron que
-- votes en 001). 4/8/16/32 exactos => cero byes, bracket perfecto.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  mundialito_id uuid not null references public.mundialitos (id) on delete cascade,
  round smallint not null check (round >= 1),
  position smallint not null check (position >= 0),
  item_a_id uuid,
  item_b_id uuid,
  winner_item_id uuid,
  status text not null default 'PENDING'
         check (status in ('PENDING', 'OPEN', 'RESOLVED')),
  vote_round smallint not null default 1 check (vote_round >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Requerido por la FK compuesta de match_votes: (mundialito_id, match_id)
  constraint matches_mundialito_id_id_unique unique (mundialito_id, id),
  -- Una posicion por ronda: define el bracket sin ambiguedad
  constraint matches_round_position_unique unique (mundialito_id, round, position),

  constraint matches_item_a_fk
    foreign key (mundialito_id, item_a_id)
    references public.items (mundialito_id, id) on delete cascade,
  constraint matches_item_b_fk
    foreign key (mundialito_id, item_b_id)
    references public.items (mundialito_id, id) on delete cascade,
  constraint matches_winner_fk
    foreign key (mundialito_id, winner_item_id)
    references public.items (mundialito_id, id) on delete set null,

  -- Un cruce no enfrenta a un item consigo mismo
  constraint matches_distinct_items
    check (item_a_id is null or item_b_id is null or item_a_id <> item_b_id),
  -- El ganador tiene que ser uno de los dos contendientes
  constraint matches_winner_is_slot
    check (winner_item_id is null or winner_item_id = item_a_id or winner_item_id = item_b_id),
  -- Un cruce abierto (OPEN) necesita ambos slots definidos
  constraint matches_open_has_slots
    check (status <> 'OPEN' or (item_a_id is not null and item_b_id is not null)),
  -- RESOLVED y ganador van sincronizados en la BD, no solo en codigo
  constraint matches_resolved_consistent
    check ((status = 'RESOLVED') = (winner_item_id is not null))
);

-- A lo sumo UN cruce abierto por mundialito: el "cruce actual" es
-- inequivoco y ningun avance puede abrir dos a la vez.
create unique index if not exists matches_one_open_per_mundialito
  on public.matches (mundialito_id) where status = 'OPEN';

-- updated_at trigger, mismo helper que 001
drop trigger if exists set_updated_at_matches on public.matches;
create trigger set_updated_at_matches
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. MATCH_VOTES: voto A/B por cruce y ronda de desempate
-- ------------------------------------------------------------
-- PK (match_id, participant_id, vote_round): un participante vota
-- una vez por cruce Y por ronda; cuando hay empate, la ronda nueva
-- suma una fila nueva (vote_round = matches.vote_round) dejando la
-- ronda anterior como historial. Sin esto, un desempate pisaria la
-- ronda empatada y el requisito "conservar desempates" fallaria.
-- mundialito_id denormalizado, igual que votes: las FK compuestas
-- anclan match/participant/item al MISMO mundialito.
create table if not exists public.match_votes (
  match_id uuid not null,
  mundialito_id uuid not null,
  participant_id uuid not null,
  vote_round smallint not null default 1 check (vote_round >= 1),
  chosen_item_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (match_id, participant_id, vote_round),

  constraint match_votes_match_fk
    foreign key (mundialito_id, match_id)
    references public.matches (mundialito_id, id) on delete cascade,
  constraint match_votes_participant_fk
    foreign key (mundialito_id, participant_id)
    references public.participants (mundialito_id, id) on delete cascade,
  constraint match_votes_chosen_fk
    foreign key (mundialito_id, chosen_item_id)
    references public.items (mundialito_id, id) on delete cascade
);

-- Tally / "todos votaron": agrupa por (match_id, vote_round)
create index if not exists match_votes_match_round_idx
  on public.match_votes (match_id, vote_round);

-- updated_at trigger, mismo helper que 001
drop trigger if exists set_updated_at_match_votes on public.match_votes;
create trigger set_updated_at_match_votes
  before update on public.match_votes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. RLS: habilitar (idempotente)
-- ------------------------------------------------------------
alter table public.matches     enable row level security;
alter table public.match_votes enable row level security;

-- ------------------------------------------------------------
-- Limpieza de policies previas (para re-correr el archivo)
-- ------------------------------------------------------------
-- IMPORTANTE: este bloque va DESPUES de crear las tablas. En
-- PostgreSQL, drop policy if exists falla con 42P01 si la TABLA no
-- existe (IF EXISTS solo cubre la policy, no la tabla).
drop policy if exists "matches_select_public"    on public.matches;
drop policy if exists "matches_select"           on public.matches;
drop policy if exists "matches_insert"           on public.matches;
drop policy if exists "matches_update"           on public.matches;
drop policy if exists "matches_delete"           on public.matches;

drop policy if exists "match_votes_select_public" on public.match_votes;
drop policy if exists "match_votes_select_owner"  on public.match_votes;
drop policy if exists "match_votes_insert"        on public.match_votes;
drop policy if exists "match_votes_update"        on public.match_votes;

drop policy if exists "participants_insert_self_cruces" on public.participants;
drop policy if exists "participants_update_self_cruces" on public.participants;
drop policy if exists "participants_update_owner_cruces" on public.participants;

drop policy if exists "mundialitos_select_public"   on public.mundialitos;
drop policy if exists "participants_select_public"  on public.participants;
drop policy if exists "items_select_public"         on public.items;

-- ------------------------------------------------------------
-- 6. Helper nuevo: validez del voto en un cruce
-- ------------------------------------------------------------
-- SECURITY DEFINER como los helpers de 002/003: consulta
-- matches/mundialitos/participants como dueno de las tablas, sin
-- depender de las policies de lectura del rol que llama.
-- Garantiza:
--   (a) el mundialito esta en 'VOTING'
--   (b) el cruce esta OPEN y en la MISMA ronda de voto
--       (rechaza clientes stale de una ronda de desempate anterior)
--   (c) el participante pertenece al mismo mundialito y esta JOINED
--       (excluidos no pueden votar)
--   (d) la opcion elegida es uno de los dos slots del cruce
-- (d) no puede ser un CHECK estatico (cruza tablas), por eso vive
-- aca como helper evaluado en las policies de match_votes.
create or replace function public.can_vote_in_match(
  target_match_id uuid,
  target_participant_id uuid,
  target_item_id uuid,
  target_vote_round smallint
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches mt
    join public.mundialitos m on m.id = mt.mundialito_id
    where mt.id = target_match_id
      and m.status = 'VOTING'
      and mt.status = 'OPEN'
      and mt.vote_round = target_vote_round
      and (target_item_id = mt.item_a_id or target_item_id = mt.item_b_id)
      and exists (
        select 1
        from public.participants p
        where p.id = target_participant_id
          and p.mundialito_id = mt.mundialito_id
          and p.status = 'JOINED'
      )
  );
$$;

-- ------------------------------------------------------------
-- 7. MATCHES — policies
-- ------------------------------------------------------------
-- El bracket se hace publico desde DRAWN (sorteo hecho) hasta el
-- final. PARTICIPANTS_LOCKED no tiene filas todavia, no hace falta.
create policy "matches_select_public"
on public.matches
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.status in ('DRAWN', 'VOTING', 'FINISHED')
  )
);

-- Owner: CRUD completo sobre las llaves de sus mundialitos.
create policy "matches_select"
on public.matches
for select
to authenticated
using (public.is_mundialito_owner(mundialito_id));

create policy "matches_insert"
on public.matches
for insert
to authenticated
with check (public.is_mundialito_owner(mundialito_id));

create policy "matches_update"
on public.matches
for update
to authenticated
using (public.is_mundialito_owner(mundialito_id))
with check (public.is_mundialito_owner(mundialito_id));

create policy "matches_delete"
on public.matches
for delete
to authenticated
using (public.is_mundialito_owner(mundialito_id));

-- ------------------------------------------------------------
-- 8. MATCH_VOTES — policies
-- ------------------------------------------------------------

-- Lectura publica SOLO cuando el cruce esta RESOLVED (resultado
-- revelado) o el mundialito FINISHED (historial). Mientras OPEN,
-- nadie anonimo lee votos: "el resultado se revela al finalizar".
-- Los votantes guardan su eleccion en localStorage; con identidad
-- no verificable, "leer tu propio voto" permitiria enumerar ids y
-- leer los de todos.
create policy "match_votes_select_public"
on public.match_votes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.matches mt
    join public.mundialitos m on m.id = mt.mundialito_id
    where mt.id = match_id
      and (mt.status = 'RESOLVED' or m.status = 'FINISHED')
  )
);

-- El owner lee todo, siempre (necesario para el tally al finalizar
-- y para ver quien falta votar).
create policy "match_votes_select_owner"
on public.match_votes
for select
to authenticated
using (public.is_mundialito_owner(mundialito_id));

create policy "match_votes_insert"
on public.match_votes
for insert
to anon, authenticated
with check (
  public.can_vote_in_match(match_id, participant_id, chosen_item_id, vote_round)
);

-- Voto modificable mientras el cruce siga OPEN y en la misma ronda.
create policy "match_votes_update"
on public.match_votes
for update
to anon, authenticated
using (
  public.can_vote_in_match(match_id, participant_id, chosen_item_id, vote_round)
)
with check (
  public.can_vote_in_match(match_id, participant_id, chosen_item_id, vote_round)
);

-- ------------------------------------------------------------
-- 9. PARTICIPANTS — self-registration CRUCES + exclusion del owner
-- ------------------------------------------------------------
-- OR con las policies de 002/003: el roster del owner en DRAFT y el
-- auto-registro RANKING en ACTIVE siguen funcionando igual.

-- Sumarse por el link mientras la inscripcion esta abierta
-- (espejo de participants_insert_self de 003, pero para CRUCES).
create policy "participants_insert_self_cruces"
on public.participants
for insert
to anon, authenticated
with check (
  auth_user_id is null
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.mode = 'CRUCES'
      and m.status = 'PARTICIPANTS_OPEN'
  )
);

-- Renombrarse mientras la inscripcion este abierta
-- (espejo de participants_update_self de 003, para CRUCES).
create policy "participants_update_self_cruces"
on public.participants
for update
to anon, authenticated
using (
  auth_user_id is null
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.mode = 'CRUCES'
      and m.status = 'PARTICIPANTS_OPEN'
  )
)
with check (
  auth_user_id is null
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.mode = 'CRUCES'
      and m.status = 'PARTICIPANTS_OPEN'
  )
);

-- Excluir / re-incluir participantes durante el torneo (usado por
-- POST /api/participants/[id]/exclude e /include). Solo el owner,
-- solo en estados de torneo (nunca DRAFT: ahi administra el roster
-- con participants_update de 002; nunca FINISHED: todo congelado).
create policy "participants_update_owner_cruces"
on public.participants
for update
to authenticated
using (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.mode = 'CRUCES'
      and m.status in ('PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                       'DRAWN', 'VOTING')
  )
)
with check (
  public.is_mundialito_owner(mundialito_id)
  and exists (
    select 1
    from public.mundialitos m
    where m.id = mundialito_id
      and m.mode = 'CRUCES'
      and m.status in ('PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                       'DRAWN', 'VOTING')
  )
);

-- ------------------------------------------------------------
-- 10. LECTURA PUBLICA AMPLIADA (recrea las de 003 como superset)
-- ------------------------------------------------------------
-- 003 publicaba la estructura solo en ACTIVE/FINISHED. Para CRUCES
-- el link se comparte desde PARTICIPANTS_OPEN, asi que el predicado
-- se amplia con los estados nuevos. Es superset del anterior:
-- RANKING queda identico y DRAFT sigue oculto.
create policy "mundialitos_select_public"
on public.mundialitos
for select
to anon, authenticated
using (status in ('ACTIVE', 'FINISHED',
                  'PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                  'DRAWN', 'VOTING'));

create policy "participants_select_public"
on public.participants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = public.participants.mundialito_id
      and m.status in ('ACTIVE', 'FINISHED',
                       'PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                       'DRAWN', 'VOTING')
  )
);

create policy "items_select_public"
on public.items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = public.items.mundialito_id
      and m.status in ('ACTIVE', 'FINISHED',
                       'PARTICIPANTS_OPEN', 'PARTICIPANTS_LOCKED',
                       'DRAWN', 'VOTING')
  )
);

-- ------------------------------------------------------------
-- 11. Permisos
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.matches     to authenticated;
grant select, insert, update        on public.match_votes  to authenticated;

-- anon: ve el bracket (matches SELECT), vota y lee resultados
-- (match_votes SELECT/INSERT/UPDATE). Sin DELETE, como votes.
grant select on public.matches                to anon;
grant select, insert, update on public.match_votes to anon;

-- El helper nuevo es SECURITY DEFINER: se revoca a PUBLIC y se
-- otorga solo a los roles que lo usan en policies (anon y
-- authenticated), mismo criterio que 002/003.
revoke all on function public.can_vote_in_match(uuid, uuid, uuid, smallint) from public;
grant execute on function public.can_vote_in_match(uuid, uuid, uuid, smallint) to anon;
grant execute on function public.can_vote_in_match(uuid, uuid, uuid, smallint) to authenticated;