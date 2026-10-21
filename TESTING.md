# Tests

## Unitarios (Vitest)

Lógica pura (`src/lib/**`): cálculos, validaciones, formato. Sin DOM, sin
Supabase, sin dev server.

```bash
npm run test:run     # una corrida (lo que valida el flujo de trabajo)
npm test             # modo watch
npm run test:ui      # UI de Vitest
```

Los archivos son `src/**/*.test.ts`. Hoy son **76 tests en 5 archivos**.

> El proyecto **no tiene jsdom**: si tu test necesita `document` o
> `window`, va a Playwright, no acá. Es la razón por la que el clipboard y
> el alta optimista no tienen test unitario.

## E2E (Playwright)

Un flujo real en un Chromium real contra el **proyecto de Supabase real**:

```
crear torneo → cargar ítems → activar → votar → finalizar → ver resultados
```

```bash
npm run test:e2e      # levanta el dev server solo (o reusa el que tengas abierto)
npm run test:e2e:ui   # modo UI, para ver paso a paso
```

También quedó `npx playwright test e2e/full-flow.spec.ts` para correr un
solo archivo.

### Antes de correrlo la primera vez

1. **Chromium**: `npx playwright install chromium`
2. **Usuario de test**: creá una cuenta con `/register` en tu proyecto
   (o desde el dashboard de Supabase). Tiene que ser **de test**, no tu
   cuenta de todos los días.
3. **Variables** en `.env.local` (ver `.env.example`):

   ```
   E2E_EMAIL=usuario-de-test@tudominio.com
   E2E_PASSWORD=...
   ```

   Sin estas dos, Playwright falla con un mensaje explícito.
4. **El dev server tiene que poder llegar a Supabase**: si `NEXT_PUBLIC_*`
   está mal, el setup de auth falla primero y se ve claro.

### Qué hacer con los datos que deja

Cada corrida crea un mundialito real llamado `[E2E] <fecha ISO>` porque
la app no tiene borrado de torneos. Limpieza cuando molesten:

```sql
delete from mundialitos where name like '[E2E] %';
```

Cascadea a participantes, ítems, votos y matches.

### Detalles que conviene saber

- **Un solo worker, sin retries.** Dos corridas en paralelo se pisan
  (mismo usuario, misma base) y un retry deja *otro* torneo. Un fallo se
  mira una vez, no se reintenta a ciegas.
- **La sesión vive en `.auth/owner.json`** (gitignored). Son cookies
  válidas de tu usuario de test: no se commitean.
- **En fallo**: trace + screenshot quedan en `test-results/`.
  Abrilos con `npx playwright show-trace test-results/<carpeta>/trace.zip`.
- El flujo usa **RANKING** a propósito: es el camino lineal. CRUCES
  (inscripción → sorteo → votación) merece su propio spec.
