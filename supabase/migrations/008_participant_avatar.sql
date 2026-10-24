-- 008_participant_avatar.sql
-- Persist the visual identity assigned to each participant.
-- Existing rows receive a neutral fallback; new registrations send a
-- generated identity and the API avoids collisions within the tournament.

alter table public.participants
  add column if not exists avatar text;

with numbered as (
  select
    id,
    row_number() over (
      partition by mundialito_id
      order by created_at, id
    ) - 1 as avatar_index
  from public.participants
  where avatar is null
),
avatar_catalog as (
  select array[
    '🦊', '🐙', '🦄', '🐸', '🐯', '🚀', '🍕', '🎲',
    '🌵', '🍩', '🎸', '🛸', '🐼', '🦁', '🐳', '🍉',
    '🌈', '🧩', '🦋', '🍄', '🐨', '🎯', '🌞', '🍿',
    '🦖', '🐝', '🎨', '🪐', '🍀', '🐧', '🎤', '🌶️'
  ] as avatars
)
update public.participants participant
set avatar = avatar_catalog.avatars[
  (numbered.avatar_index % array_length(avatar_catalog.avatars, 1)) + 1
]
from numbered, avatar_catalog
where participant.id = numbered.id;

alter table public.participants
  alter column avatar set not null;

-- 003 intentionally limited anonymous self-registration to the identity
-- columns it needed. Extend that allow-list for the persisted avatar.
grant insert (avatar) on public.participants to anon;

comment on column public.participants.avatar is
  'Emoji avatar assigned to the participant within this Mundialito';
