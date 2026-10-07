# 📋 Mundialito — Lista de tareas (MVP)

Tracker de trabajo activo. Ordenado de más a menos prioritario por fases.
Al completar una tarea: marcar `- [x]`, agregar la fecha y una nota breve si hubo algo relevante.

## Contexto clave

- **Fuente de verdad**: `README.md` (modelo, permisos, Definition of Done del MVP).
- **Decisión de participación (Opción A)**: link/QR **abierto** → el votante elige su nombre de la lista → vota 1-10 **sin cuenta ni sesión**. El **owner** mantiene login (admin) **y también vota** una vez activa la votación, como un participante más. El participante **nunca** tiene permisos de administración.
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

- [ ] **6.** Migración RLS para votos sin sesión: adaptar policies de `votes` (hoy exigen `authenticated`) para permitir INSERT/UPDATE de votantes anónimos **validando en BD**: mundialito en `ACTIVE` y máximo un voto por `(participantId, itemId)` (la PK compuesta ya lo respalda).
- [ ] **7.** Proxy (`src/proxy.ts`): dejar la ruta pública de participación fuera de `protectedRoutes` — si no, el link abierto manda al votante al login.
- [ ] **8.** Ruta de participación pública (link abierto tipo `/mundialito/[id]` o similar): muestra los ítems y permite identificarse.
- [ ] **9.** Transiciones de status: `DRAFT → ACTIVE → FINISHED`, solo owner (Server Action o `PATCH /api/mundialitos/[id]`) + botones en `src/app/mundialito/[id]/page.tsx`.
- [ ] **10.** Elegir nombre: pantalla para seleccionar un participante de la lista predefinida (identidad del votante para la sesión de voto).
- [ ] **11.** API de votos: `POST`/`PUT` con upsert por PK compuesta `(participantId, itemId)`, score validado 1-10.
- [ ] **12.** Pantalla de votación mobile-first: puntuar cada ítem del 1 al 10, modificar puntajes mientras esté `ACTIVE`, confirmar.
- [ ] **13.** Owner votante: una vez en `ACTIVE`, el owner puede votar como un participante más (sin privilegios sobre su voto).

## Fase 3 — Completar funcionalidades MVP

- [ ] **14.** Editar Mundialito: form de `name`/`description` (solo en `DRAFT`) — hoy no existe ningún `.update()` en `src/`.
- [ ] **15.** Cálculos de resultados: `src/lib/calculations/ranking.ts` con funciones puras — promedio, mínimo, máximo, cantidad de votos, posición con empates (`calculateRanking()`, `calculateAverage()`, `validateScore()`).
- [ ] **16.** Página de resultados: tabla por ítem + ranking, visible cuando el Mundialito esté `FINISHED` (nunca persistir derivados, calcular al vuelo).
- [ ] **17.** Compartir: UI con el link copiable + generación de QR (codifica el mismo enlace).

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
