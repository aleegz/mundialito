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
--     de 002. Solo se agregan policies nuevas para anon y se
--     reemplazan votes_insert/votes_update (ver razon abajo).
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
drop policy if exists "votes_insert"           on public.votes;
drop policy if exists "votes_update"           on public.votes;
drop policy if exists "votes_select_anon"      on public.votes;
drop policy if exists "mundialitos_select_anon"  on public.mundialitos;
drop policy if exists "participants_select_anon" on public.participants;
drop policy if exists "items_select_anon"        on public.items;

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

-- ============================================================
-- LECTURA ANONIMA DE LA ESTRUCTURA
-- Solo ACTIVE/FINISHED: DRAFT es configuracion del owner, el link
-- abierto no lo revela (las policies anon de 002 no existian, así
-- que esto es puramente aditivo).
-- ============================================================

create policy "mundialitos_select_anon"
on public.mundialitos
for select
to anon
using (status in ('ACTIVE', 'FINISHED'));

create policy "participants_select_anon"
on public.participants
for select
to anon
using (
  exists (
    select 1
    from public.mundialitos m
    where m.id = public.participants.mundialito_id
      and m.status in ('ACTIVE', 'FINISHED')
  )
);

create policy "items_select_anon"
on public.items
for select
to anon
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

-- Lectura anonima: solo cuando el mundialito padre esta
-- ACTIVE (votante lee su ballot para modificarlo) o FINISHED.
-- NOTA (Opcion A): a nivel de datos, cualquier anonimo con el
-- link puede leer TODOS los votos de ese mundialito en esos
-- estados — el "peeking" es aceptado bajo el modelo de confianza
-- del MVP; la UI no muestra resultados agregados hasta FINISHED.
create policy "votes_select_anon"
on public.votes
for select
to anon
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

-- El helper nuevo es SECURITY DEFINER: igual que en 002, se
-- revoca EXECUTE a PUBLIC y se otorga solo a los roles que lo
-- usan en policies (anon y authenticated).
revoke all on function public.can_vote_in_mundialito(uuid, uuid, uuid) from public;
grant execute on function public.can_vote_in_mundialito(uuid, uuid, uuid) to anon;
grant execute on function public.can_vote_in_mundialito(uuid, uuid, uuid) to authenticated;
