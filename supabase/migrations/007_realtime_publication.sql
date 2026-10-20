-- ------------------------------------------------------------
-- 007_realtime_publication.sql
-- Supabase Realtime: tablas de las que la UI se refresca sola (#7).
--
-- POR QUE EXISTE:
--   Sin esto el cliente que se suscriba NO recibe ningun evento:
--   supabase_realtime solo emite por las tablas agregadas a la
--   publicacion. La suscripcion de codigo (components/live-refresh)
--   existe desde el lote; este archivo es la mitad de la base.
--
-- Realtime RESPETA RLS: cada suscriptor recibe solo las filas que su
-- rol puede leer. Consecuencias de diseno, no bugs:
--   - anon NO recibe eventos de match_votes mientras el cruce esta
--     OPEN (secreto del voto) => la pantalla de voto sigue usando el
--     polling de 5s para el conteo de 006.
--   - el owner SI los recibe (match_votes_select_owner), asi que su
--     panel se refresca al toque cuando alguien vota.
--
-- No hace falta REPLICA IDENTITY FULL: los eventos no se consumen, solo
-- disparan un router.refresh()/refetch en el cliente — la fila nueva
-- ni siquiera se lee. Basta la PK que todas las tablas ya tienen.
--
-- Archivo idempotente: crea la publicacion si no existe y agrega SOLO
-- las tablas que falten (alter publication falla con 42710 si la tabla
-- ya esta), asi que se puede re-correr en el SQL editor sin drama.
-- ------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'mundialitos', 'participants', 'items', 'matches', 'match_votes'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
    end if;
  end loop;
end $$;

-- votes (modo RANKING) queda fuera A PROPOSITO: el ranking se muestra
-- recien en FINISHED, cuando ya no hay nada que refrescar en vivo.
