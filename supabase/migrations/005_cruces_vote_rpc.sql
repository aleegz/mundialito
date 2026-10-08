-- ------------------------------------------------------------
-- 005_cruces_vote_rpc.sql
-- Voto A/B por RPC en modo CRUCES.
--
-- POR QUE EXISTE:
--   match_votes_select_public NO permite leer votos mientras el cruce
--   esta OPEN (secreto del voto: "el resultado se revela al finalizar").
--   Por eso, un INSERT/upsert desdel cliente con PostgREST no puede
--   usar RETURNING (pide representacion) ni on_conflict (resolucion de
--   conflicto): ambos necesitan VER la fila y RLS la bloquea -> 42501
--   aunque la fila se inserte bien.
--
--   La solucion es un RPC SECURITY DEFINER (como can_vote_in_match):
--   corre como owner de la tabla, hace el upsert real y devuelve solo
--   un booleano. La validacion sigue viva en can_vote_in_match (misma
--   logica que las policies match_votes_insert/update).
--
-- Archivo idempotente (drop-or-replace).
-- ------------------------------------------------------------

-- Limpieza por si se re-corre el archivo
drop function if exists public.cast_match_vote(uuid, uuid, uuid, smallint);

-- Vota o modifica el voto en un cruce.
-- Devuelve true si el voto quedo guardado, false si la validacion
-- rechazo (mundialito no VOTING, cruce no OPEN o de otra ronda,
-- participante excluido, eleccion fuera de los slots, ronda vieja).
--
-- El upsert (PK match_id, participant_id, vote_round) cubre el caso
-- "modificar mi voto" del mismo participante en la misma ronda, y el
-- caso "ronda nueva de desempate" suma una fila nueva (vote_round
-- sube en matches cuando hay empate).
create or replace function public.cast_match_vote(
  p_match_id uuid,
  p_participant_id uuid,
  p_chosen_item_id uuid,
  p_vote_round smallint default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mundialito_id uuid;
  v_round smallint;
  v_ok boolean;
begin
  -- Resuelve la ronda actual del cruce si el cliente no la mando.
  -- (El cliente normalmente la manda: la cargo con el match.)
  select mundialito_id, vote_round
    into v_mundialito_id, v_round
    from public.matches
    where id = p_match_id;
  if not found then
    return false;
  end if;
  if p_vote_round is null then
    p_vote_round := v_round;
  end if;

  -- Misma validacion que dra las policies: ronda actual, slots,
  -- participante JOINED, mundialito VOTING. Fuera -> false (la API
  -- route lo traduce a 409 "la votacion cambio").
  select public.can_vote_in_match(
           p_match_id, p_participant_id, p_chosen_item_id, p_vote_round
         )
    into v_ok;
  if not v_ok then
    return false;
  end if;

  insert into public.match_votes (
    match_id, mundialito_id, participant_id, vote_round, chosen_item_id
  )
  values (
    p_match_id, v_mundialito_id, p_participant_id, p_vote_round, p_chosen_item_id
  )
  on conflict (match_id, participant_id, vote_round)
  do update set
    chosen_item_id = excluded.chosen_item_id;

  return true;
end;
$$;

-- Secreto: solo los roles de las policies lo ejecutan.
revoke all on function public.cast_match_vote(uuid, uuid, uuid, smallint) from public;
grant execute on function public.cast_match_vote(uuid, uuid, uuid, smallint) to anon;
grant execute on function public.cast_match_vote(uuid, uuid, uuid, smallint) to authenticated;