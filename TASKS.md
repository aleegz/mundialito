# 📋 Mundialito — Lista de tareas (MVP)

Tracker de trabajo activo. Ordenado de más a menos prioritario por fases.
Al completar una tarea: marcar `- [x]`, agregar la fecha y una nota breve si hubo algo relevante.

## Contexto clave

- **Fuente de verdad**: `README.md` (modelo, permisos, Definition of Done del MVP).
- **Decisión de participación (Opción A, ajustada a self-registration)**: link/QR **abierto** → el votante entra y **escribe su nombre** (se auto-registra, sin roster predefinido) → vota 1-10 **sin cuenta ni sesión**. El **owner** mantiene login (admin) **y también vota** una vez activa la votación: pone su nombre como cualquier visitante. El participante **nunca** tiene permisos de administración.
- **Reglas**: TypeScript estricto, funciones puras para cálculos, RLS como seguridad real, sin funcionalidades futuras hasta cerrar el MVP, tests al tocar lógica de negocio.

---

## Fase 1 — Bugs y cimientos (bloquean todo lo demás)

- [x] **1.** Fix redirect roto: `src/app/mundialito/new/page.tsx` redirige errores a `/mundialito/nuevo` pero la ruta es `/new` → todo error cae en 404 (3 lugares: líneas ~35, ~39, ~54). — ✅ 2026-10-07. Los 3 corregidos; verificado: cero string de ruta `nuevo` en `src/`.
- [x] **2.** Crear página `/register` (signup con Supabase Auth) — solo existe `/login`, el owner no puede darse de alta. — ✅ 2026-10-07. `src/app/register/page.tsx` + link "Registrate" en login. Validación server-side (regex email + password ≥ 8), maneja sesión / confirmación de email / errores por query param. Smoke: `GET /register` → 200 con formulario.
- [x] **3.** Fix DELETE con éxito fantasma: `src/app/api/items/[itemId]/route.ts` y `src/app/api/participants/[participantId]/route.ts` devuelven `deleted: true` aunque RLS filtre 0 filas (verificar filas afectadas). — ✅ 2026-10-07. `.delete().select("id")` → 0 filas = 404 con body idéntico (sin oráculo de existencia); consumidores actualizados (cierran diálogo + `router.refresh()`).
- [x] **4.** Resolver inconsistencia de migraciones: borrar la migración vacía `supabase/migrations/20261002022641_initial_schema.sql` (0 bytes) y atender la referencia a "003" en `002_rls.sql:49` que apunta a una migración inexistente. — ✅ 2026-10-07. Migración vacía borrada. Hallazgo: `invite_token_hash` SÍ lo crea el `001` (línea 24) — solo era un comentario colgante en 002 → comment-fix; **cero policies tocadas** (verificado línea por línea en la auditoría).
- [ ] **5.** 🔒 Acción manual: rotar la password de Supabase que quedó en texto plano en `notes.txt` y eliminarla del disco (no está trackeada en git, pero no debe quedar en el repo). — 🔶 2026-10-07: password **redactada** en `notes.txt:184`. **PENDIENTE: rotarla en el dashboard de Supabase** (redactar el archivo no invalida la credencial vieja).

**Pendientes menores de la auditoría (PASS WITH FINDINGS — 2026-10-07):**

- [ ] **25.** Guard en el proxy: un usuario **logueado** que abra `/register` debe ser redirigido a `/` (espejar el guard GET que ya existe para `/login` en `src/lib/supabase/middleware.ts`) — si no, un signUp puede pisar su sesión activa.
- [ ] **26.** Mapear errores de signup a mensaje genérico en español en `src/app/register/page.tsx` (el `error.message` crudo expone "User already registered" → enumeración de cuentas). Opcional: placeholder "Password" → "Contraseña" en register **y** login.
- [ ] **27.** Bug pre-existente (no introducido por la Fase 1): en `delete-*-button.tsx`, el camino de error no-404 hace `setConfirming(false)` pero el `<small>` del error solo se renderiza mientras `confirming=true` → el error se setea y se desmonta al toque = **fallo silencioso**. Mantener `confirming=true` en error o mover el mensaje fuera del bloque de confirmación.

## Fase 2 — Participación sin login (Opción A) + owner votante

- [x] **6.** Migración RLS para votos sin sesión: adaptar policies de `votes` (hoy exigen `authenticated`) para permitir INSERT/UPDATE de votantes anónimos **validando en BD**: mundialito en `ACTIVE` y máximo un voto por `(participantId, itemId)` (la PK compuesta ya lo respalda). — ✅ 2026-10-07. `supabase/migrations/003_public_voting_rls.sql`: helper `can_vote_in_mundialito` (SECURITY DEFINER: mismo mundialito + ACTIVE), policies `TO anon, authenticated` sin binding de identidad, SELECT anon solo ACTIVE/FINISHED, grants espejo de 002, idempotente. `002_rls.sql` intacto (diff vacío). **✅ APLICADA 2026-10-07 vía SQL editor + verificada en vivo por la suite funcional.**
- [x] **7.** Proxy (`src/proxy.ts`): dejar la ruta pública de participación fuera de `protectedRoutes` — si no, el link abierto manda al votante al login. — ✅ 2026-10-07. Sin cambios necesarios: `/vote/*` nunca estuvo protegido; `/mundialito` sigue en `protectedRoutes` (verificado).
- [x] **8.** Ruta de participación pública (link abierto tipo `/mundialito/[id]` o similar): muestra los ítems y permite identificarse. — ✅ 2026-10-07. `/vote/[mundialitoId]` (page + vote-client). NOTA aceptada: un anónimo en DRAFT ve "no encontrado" — consistente con el principio sin oráculo (no puede distinguir DRAFT de inexistente); el mensaje "aún no comenzó" queda para el owner logueado.
- [x] **9.** Transiciones de status: `DRAFT → ACTIVE → FINISHED`, solo owner (Server Action o `PATCH /api/mundialitos/[id]`) + botones en `src/app/mundialito/[id]/page.tsx`. — ✅ 2026-10-07. `PATCH /api/mundialitos/[id]`: solo transiciones válidas con CAS (sin races), 401/403/409 server-side, bloquea iniciar con 0 participantes o 0 ítems (error en español). `status-actions.tsx` con confirmación en dos pasos. — 🔄 2026-10-08: **requisito de participantes relajado** (ver task 10): para iniciar solo se exige ≥1 ítem; los participantes se auto-registran en ACTIVE.
- [x] **10.** Elegir nombre: pantalla para seleccionar un participante de la lista predefinida (identidad del votante para la sesión de voto). — ✅ 2026-10-07. Roster con botones grandes, `localStorage` claveado por mundialito, control "Cambiar de nombre". — 🔄 2026-10-08: **reemplazado por auto-registro**. Pantalla "Tu nombre" → `POST /api/participants {name}` crea el participante (duplicados permitidos) y el `participantId` vuelve a `localStorage`. "Editar nombre" = `PATCH /api/participants/[id]` (renombra la propia fila en ACTIVE); "Votar con otro nombre" descarta la identidad local.
- [x] **11.** API de votos: `POST`/`PUT` con upsert por PK compuesta `(participantId, itemId)`, score validado 1-10. — ✅ 2026-10-07. `PUT /api/votes`: bulk upsert atómico multi-row; validación server-side completa (UUIDs, no vacío, duplicados, entero 1–10, status → 409 con mensaje español); errores RLS mapeados (42501→403 etc.) sin filtrar PostgREST. `GET /api/votes` para prefill (400 en params malos, nunca 500).
- [x] **12.** Pantalla de votación mobile-first: puntuar cada ítem del 1 al 10, modificar puntajes mientras esté `ACTIVE`, confirmar. — ✅ 2026-10-07. Ballot con botones 1–10 tocables, prefill desde GET, un solo "Confirmar votación" → PUT, estados DRAFT/FINISHED, vista amigable para id inválido. Smoke: `/vote/<uuid>` → 200, `GET /api/votes` → 200 `{"votes":[]}`.
- [x] **13.** Owner votante: una vez en `ACTIVE`, el owner puede votar como un participante más (sin privilegios sobre su voto). — ✅ 2026-10-07. Policies `TO anon, authenticated` sin binding → el owner logueado vota idéntico a un anónimo; prefill funciona vía su policy de SELECT de 002.

**✅ Verificación funcional Fase 2 (2026-10-07, actualizada 2026-10-08): suite 72 pass / 0 fail / 2 skip** — batería end-to-end contra dev server + Supabase remoto: RLS 003 anon (27 checks: DRAFT oculto, ACTIVE/FINISHED legibles, INSERT voto con CHECK/FK, UPDATE propio voto, DELETE/UPDATE de estructura bloqueados con efecto verificado as owner, + auto-registro: UPDATE display_name permitido en ACTIVE, column grant de `auth_user_id` rechazado, DRAFT immutable), transiciones PATCH (12: 404 sin oráculo, 400/401, 409 vacío, CAS, sin vuelta atrás, **activar con 0 participantes → 200**), API self-registration (7: POST `{name}` sin sesión → 200, duplicados, validaciones, DRAFT → 404 sin oráculo, PATCH rename), matriz PUT/GET /api/votes (20), UI smoke (3), teardown (2). Suite temporal en `C:\Users\Ale\AppData\Local\Temp\opencode\test-phase2.mjs` (no se commitea — Vitest llega en Fase 4). **2 checks omitidos** (PATCH-07/08: 404 ajeno vs 403 participante no-owner) requieren 2da identidad → desactivar "Confirm email" los habilita. **2026-10-08:** bug de campo — la sección de self-registration de 003 no estaba aplicada en la base (RPC `is_mundialito_active` devolvía PGRST202) → el POST de registro respondía 403; re-aplicada la 003 y agregados SR-01..07 + RLS-20b/20c como regresión.

**Pendientes menores de la auditoría Fase 2 (PASS WITH FINDINGS — 2026-10-07):**

- [ ] **28.** (SUGGESTION) `PUT /api/votes` acepta un ballot **parcial** server-side (el cliente exige completo, pero un caller directo puede enviar subset): verificar opcionalmente que los `itemId` enviados cubran exactamente los ítems del mundialito antes del upsert.
- [ ] **29.** (SUGGESTION) `vote-client.tsx` — `fetchExistingVotes` traga todos los errores devolviendo `{}`: una falla transitoria muestra ballot vacío y el votante puede confundirse. Mostrar estado de error de carga en vez de fallback silencioso.

> **Tradeoffs aceptados de la Fase 2 (documentados):** cualquier usuario autenticado puede escribir votos en un mundialito ACTIVE sin binding de identidad (necesario para el voto del owner — task 13); re-correr 002 manualmente después de 003 restauraría el binding (comment en el header de 003); "peeking" de votos anónimos mientras ACTIVE (modelo de confianza Opción A). **Auto-registro (2026-10-08):** crear/renombrar participantes en ACTIVE también funciona sin binding — "propio" = posesión del id (localStorage); los ids de participantes son enumerables mientras ACTIVE, así que un visitante del link podría renombrar a otro participante (los grants por columna de 003 limitan el daño a `display_name`).

## Fase 3 — Completar funcionalidades MVP

- [x] **14.** Editar Mundialito: form de `name`/`description` (solo en `DRAFT`) — hoy no existe ningún `.update()` en `src/`. — ✅ 2026-10-08. `PUT /api/mundialitos/[id]` solo en DRAFT (409 si no), `edit-mundialito-form.tsx` en la página del owner.
- [x] **15.** Cálculos de resultados: `src/lib/calculations/ranking.ts` con funciones puras — promedio, mínimo, máximo, cantidad de votos, posición con empates (`calculateRanking()`, `calculateAverage()`, `validateScore()`). — ✅ 2026-10-08. Competition ranking (empates comparten posición, siguiente se salta), cubierto por los checks de la suite.
- [x] **16.** Página de resultados: tabla por ítem + ranking, visible cuando el Mundialito esté `FINISHED` (nunca persistir derivados, calcular al vuelo). — ✅ 2026-10-08. Vista FINISHED en `vote-client.tsx` con ranking + tabla por ítem, todo calculado al vuelo.
- [x] **17.** Compartir: UI con el link copiable + generación de QR (codifica el mismo enlace). — ✅ 2026-10-08. `share-links.tsx` con QR (`qrcode`, único dep nuevo aprobado) y copy-to-clipboard.

## Fase 4 — Testing

- [ ] **18.** Setup Vitest + tests unitarios de `calculations/` y validaciones (score 1-10, nombres vacíos, empates en ranking).
- [ ] **19.** Setup Playwright + 1 flujo E2E completo: crear Mundialito → participantes → ítems → activar → votar → finalizar → ver resultados.

## Fase 5 — CI/CD y deploy

- [ ] **20.** GitHub Actions: lint + typecheck + tests + build en cada PR/push.
- [ ] **21.** Deploy (Vercel u otro) + verificación real de uso desde un celular.

## Fase 6 — Higiene

- [ ] **22.** Borrar directorios vacíos relicquia del "deshacer" del 6/10: `src/app/api/{invites,votes,mundialitos,participants/claim}`, `src/app/join/[token]`, `src/app/register`, `src/components`, `src/lib/calculations` (los que sigan vacíos al momento de tocar esta tarea).
- [ ] **23.** Decidir destino de las páginas de prueba `/rls-test` y `/supabase-test` (sacarlas de producción o protegerlas).
- [ ] **24.** Agregar `.env.example` con las variables referenciadas (sin valores).

---

## Completadas

| # | Tarea | Fecha | Nota |
| --- | --- | --- | --- |
| — | — | — | — |
