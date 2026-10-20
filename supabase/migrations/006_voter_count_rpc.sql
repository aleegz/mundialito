-- ------------------------------------------------------------
-- 006_voter_count_rpc.sql
-- Conteo de votantes de un cruce, legible desde anon.
--
-- POR QUE EXISTE:
--   match_votes_select_public (004) no deja LEER match_votes mientras
--   el cruce esta OPEN: es el secreto del voto ("el resultado se
--   revela al finalizar"). Por eso un count con PostgREST desde la
--   pantalla de voto devuelve 0 mientras mas votos hay.
--
--   La RPC es SECURITY DEFINER (mismo criterio que can_vote_in_match
--   de 004 y cast_match_vote de 005): corre como duena de la tabla y
--   devuelve SOLO un numero. Cuantos votaron es avance de la
--   votacion; nunca una eleccion, que es lo que sigue siendo secreto.
--
-- Archivo idempotente (drop-or-replace), como 005.
-- ------------------------------------------------------------

-- Limpieza por si se re-corre el archivo
drop function if exists public.match_voter_count(uuid, smallint);

-- Votantes del cruce en su ronda actual.
--   p_match_id     cruce a consultar.
--   p_vote_round   ronda opcional: si no viene, se usa la vigente en
--                  matches (el cliente normalmente la manda, porque ya
--                  tiene el match cargado).
-- Devuelve un integer: la cantidad de filas, que por la PK
-- (match_id, participant_id, vote_round) es a lo sumo UNA por
-- participante, o sea votantes distintos de verdad.
create or replace function public.match_voter_count(
  p_match_id uuid,
  p_vote_round smallint default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.match_votes
  where match_id = p_match_id
    and vote_round = coalesce(
      p_vote_round,
      (select vote_round from public.matches where id = p_match_id)
    );
$$;

-- Secreto: el rol anonimo solo obtiene el conteo. Mismo criterio que
-- 005: se revoca PUBLIC y se otorga a los dos roles de las policies.
revoke all on function public.match_voter_count(uuid, smallint) from public;
grant execute on function public.match_voter_count(uuid, smallint) to anon;
grant execute on function public.match_voter_count(uuid, smallint) to authenticated;
