-- ============================================================
-- 003_public_voting_rls.sql — Votacion publica sin sesion (Opcion A)
-- ============================================================
-- Se aplica sobre 001 + 002. Idempotente: cada policy se dropea
-- antes de crearse, la funcion nueva usa CREATE OR REPLACE y los
-- grants son repetibles. Re-correr este archivo no falla.
--
-- ORDEN OBLIGATORIO: aplicar siempre 001 -> 002 -> 003. 002 y 003
-- comparten los nombres votes_insert/votes_update; re-correr 002
-- despues de 003 restauraria el binding de identidad y romperia
-- el voto anonimo. Supabase aplica en orden y una sola vez, esto
-- solo aplica a re-ejecuciones manuales.
--
-- Principios:
--   - NO se tocan las policies de owner/authenticated de
--     mundialitos/participants/items ni votes_select/votes_delete
--     de 002 (roster/config en DRAFT, borrados). Solo se agregan
--     policies nuevas y se reemplazan votes_insert/votes_update
--     (ver razon abajo).
--   - Lectura publica (*_select_public): renombradas desde
--     *_select_anon y ahora `to anon, authenticated`. El link
--     abierto debe funcionar igual para un usuario LOGUEADO que no
--     es owner ni participante (con solo `to anon` ese usuario ve
--     "no encontrado" en la pantalla de voto). Los drops de abajo
--     tiran ambos nombres para que re-correr este archivo limpie la
--     version anterior ya aplicada.
--   - Auto-registro de participantes en ACTIVE
--     (participants_insert_self / participants_update_self): sin
--     roster predefinido, cualquiera crea su fila escribiendo su
--     nombre. "Propio" = posesion del participantId (localStorage),
--     mismo modelo de confianza que los votos (ver seccion).
--   - Los helpers de 002 quedan intactos y sin editar: las
--     policies anon no usan is_mundialito_* / current_participant_id
--     porque dependen de auth.uid(), que es NULL para anon.
--   - Cross-mundialito (participante de A votando un item de B):
--     el WITH CHECK ancla participante e item al MISMO
--     mundialito_id de la fila. Ademas las FK compuestas de 001
--     (votes_mundialito_participant_fk / votes_mundialito_item_fk)
--     ya lo garantizan a nivel de datos.
-- ============================================================

-- ------------------------------------------------------------
-- Limpieza de policies previas (para re-correr el archivo)
-- ------------------------------------------------------------
drop policy if exists "votes_insert"              on public.votes;
drop policy if exists "votes_update"              on public.votes;
drop policy if exists "votes_select_anon"         on public.votes;
drop policy if exists "votes_select_public"       on public.votes;
drop policy if exists "mundialitos_select_anon"   on public.mundialitos;
drop policy if exists "mundialitos_select_public" on public.mundialitos;
drop policy if exists "participants_select_anon"  on public.participants;
drop policy if exists "participants_select_public" on public.participants;
drop policy if exists "participants_insert_self"  on public.participants;
drop policy if exists "participants_update_self"  on public.participants;
drop policy if exists "items_select_anon"         on public.items;
drop policy if exists "items_select_public"       on public.items;

-- ------------------------------------------------------------
-- Helper nuevo (aditivo): validez de escritura de un voto.
-- SECURITY DEFINER como los helpers de 002: consulta
-- mundialitos/participants/items como dueño de las tablas, sin
-- depender de las policies de lectura del rol que llama.
-- Garantiza:
--   (a) participante e item pertenecen al MISMO mundialito
--   (b) ese mundialito esta en status = 'ACTIVE'
-- ------------------------------------------------------------
create or replace function public.can_vote_in_mundialito(
  target_mundialito_id uuid,
  target_participant_id uuid,
  target_item_id uuid
)
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
      and m.status = 'ACTIVE'
  )
  and exists (
    select 1
    from public.participants p
    where p.mundialito_id = target_mundialito_id
      and p.id = target_participant_id
  )
  and exists (
    select 1
    from public.items i
    where i.mundialito_id = target_mundialito_id
      and i.id = target_item_id
  );
$$;

-- ------------------------------------------------------------
-- Helper nuevo (aditivo): mundialito en ACTIVE.
-- SECURITY DEFINER por el mismo motivo que can_vote_in_mundialito:
-- el rol que llama no necesita poder leer la fila de mundialitos
-- para evaluar una policy de ESCRITURA. Sin esto, un autenticado
-- que no es owner ni participante (y que llega por el link abierto)
-- no podria auto-registrarse aunque el mundo este ACTIVE.
-- ------------------------------------------------------------
create or replace function public.is_mundialito_active(
  target_mundialito_id uuid
)
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
      and m.status = 'ACTIVE'
  );
$$;

-- ============================================================
-- LECTURA PUBLICA DE LA ESTRUCTURA
-- Solo ACTIVE/FINISHED: DRAFT es configuracion del owner, el link
-- abierto no lo revela (las policies anon de 002 no existian, así
-- que esto es puramente aditivo respecto de 002).
-- `to anon, authenticated`: anon y logueado ven exactamente lo
-- mismo — el link es abierto sin importar si el visitante tiene
-- cuenta. DRAFT sigue oculto para ambos (el owner lo lee via 002).
-- ============================================================

create policy "mundialitos_select_public"
on public.mundialitos
for select
to anon, authenticated
using (status in ('ACTIVE', 'FINISHED'));

create policy "participants_select_public"
on public.participants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = public.participants.mundialito_id
      and m.status in ('ACTIVE', 'FINISHED')
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
      and m.status in ('ACTIVE', 'FINISHED')
  )
);

-- ============================================================
-- VOTES
-- ============================================================

-- Lectura publica: solo cuando el mundialito padre esta
-- ACTIVE (votante lee su ballot para modificarlo) o FINISHED.
-- `to anon, authenticated` por la misma razon que la estructura:
-- el prefill del ballot tiene que funcionar para un logueado que
-- llega por el link, no solo para anon.
-- NOTA (Opcion A): a nivel de datos, cualquier visitante con el
-- link puede leer TODOS los votos de ese mundialito en esos
-- estados — el "peeking" es aceptado bajo el modelo de confianza
-- del MVP; la UI no muestra resultados agregados hasta FINISHED.
create policy "votes_select_public"
on public.votes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = public.votes.mundialito_id
      and m.status in ('ACTIVE', 'FINISHED')
  )
);

-- REEMPLAZA a la votes_insert de 002 (TO authenticated + binding
-- via current_participant_id). Esa binding hacia imposible tanto
-- el voto anonimo como el voto del owner "como un participante
-- mas" (Opcion A, task 13). Sin binding de identidad: el modelo
-- de confianza del MVP es el mismo para anon y authenticated.
create policy "votes_insert"
on public.votes
for insert
to anon, authenticated
with check (
  public.can_vote_in_mundialito(mundialito_id, participant_id, item_id)
);

-- REEMPLAZA a la votes_update de 002 (mismo motivo que INSERT).
-- USING y WITH CHECK: la fila existente y la resultante deben
-- seguir validas (mismo mundialito, participante e item, y el
-- mundialito sigue en ACTIVE).
create policy "votes_update"
on public.votes
for update
to anon, authenticated
using (
  public.can_vote_in_mundialito(mundialito_id, participant_id, item_id)
)
with check (
  public.can_vote_in_mundialito(mundialito_id, participant_id, item_id)
);

-- ============================================================
-- PARTICIPANTS — AUTO-REGISTRO (self-registration)
-- ============================================================
-- Flujo nuevo: no hay roster predefinido. Quien entra por el link
-- escribe su nombre, se crea como participante y vota. Reglas:
--   - Solo con el mundialito en ACTIVE (en DRAFT administra el
--     owner via participants_insert/update de 002; en FINISHED
--     todo esta congelado).
--   - auth_user_id queda NULL: el registro es anonimo aunque el
--     visitante tenga cuenta (mismo criterio que los votos: sin
--     binding de identidad).
--   - Nombres duplicados aceptados: dos "Juan" son dos filas.
--
-- "Editar el PROPIO participante" = posesion del participantId
-- (guardado en localStorage al registrarse / devuelto por el POST).
-- No hay identidad anonima verificable en el MVP, asi que este es
-- el mismo modelo de confianza que votes_update: con el link y el
-- id a mano, se puede escribir.
--
-- TRADEOFF ACEPTADO (consistente con Fase 2): participants_
-- select_public hace enumerables los ids mientras ACTIVE, asi que
-- un visitante del link puede renombrar cualquier participante —
-- igual que ya puede reescribir cualquier voto de ese mundialito.
-- Las column grants de mas abajo acotan el danio: solo display_name.
--
-- Policies OR, no pisan a las de 002: el roster del owner en DRAFT
-- sigue funcionando igual.
create policy "participants_insert_self"
on public.participants
for insert
to anon, authenticated
with check (
  auth_user_id is null
  and public.is_mundialito_active(mundialito_id)
);

-- USING: solo filas sin cuenta (nunca tocar un participante
-- vinculado a auth.users) de un mundialito ACTIVE.
-- WITH CHECK: la fila resultante debe seguir sin cuenta y en un
-- ACTIVE — no se puede re-vincular una fila ajena a una cuenta ni
-- moverla a un DRAFT/FINISHED.
-- Limite conocido: una policy no puede comparar fila vieja vs nueva,
-- asi que un authenticated podria mover una fila entre dos mundiales
-- ACTIVE. Lo aceptamos en el mismo modelo de confianza (ademas la FK
-- compuesta de 001 lo bloquea si la fila tiene votos).
create policy "participants_update_self"
on public.participants
for update
to anon, authenticated
using (
  auth_user_id is null
  and public.is_mundialito_active(mundialito_id)
)
with check (
  auth_user_id is null
  and public.is_mundialito_active(mundialito_id)
);

-- ============================================================
-- Permisos (espejo del bloque de grants de 002, para anon)
-- ============================================================
grant usage on schema public to anon;
grant select on public.mundialitos  to anon;
grant select on public.participants to anon;
grant select on public.items        to anon;
-- SELECT para prefill del ballot, INSERT/UPDATE para votar.
-- Sin DELETE: borrar votos sigue siendo cosa del owner
-- (votes_delete de 002, to authenticated, intacta).
grant select, insert, update on public.votes to anon;

-- Auto-registro: grants POR COLUMNA para anon (no existe grant de
-- tabla sobre participants para anon en 002, asi que estos son los
-- UNICOS permisos de escritura que tiene). Con una policy no se
-- pueden prohibir columnas, con grants si: anon puede INSERTar solo
-- (mundialito_id, display_name) y UPDATEar solo display_name. No
-- puede tocar auth_user_id, invite_token_hash ni mover la fila a
-- otro mundialito. Ojo: el INSERT del server NO incluye
-- auth_user_id (queda en default NULL) — si se le agrego al payload,
-- Postgres responderia "permission denied for column".
grant insert (mundialito_id, display_name) on public.participants to anon;
grant update (display_name) on public.participants to anon;

-- El/los helper/s nuevo/s son SECURITY DEFINER: igual que en 002,
-- se revoca EXECUTE a PUBLIC y se otorga solo a los roles que lo
-- usan en policies (anon y authenticated).
revoke all on function public.can_vote_in_mundialito(uuid, uuid, uuid) from public;
grant execute on function public.can_vote_in_mundialito(uuid, uuid, uuid) to anon;
grant execute on function public.can_vote_in_mundialito(uuid, uuid, uuid) to authenticated;

revoke all on function public.is_mundialito_active(uuid) from public;
grant execute on function public.is_mundialito_active(uuid) to anon;
grant execute on function public.is_mundialito_active(uuid) to authenticated;
