# 🏆 Mundialito

Aplicación web para crear y participar en mundialitos de cualquier tipo: alfajores, pizzas, hamburguesas, películas, videojuegos, cafés, etc.

La idea central es simple: un grupo de personas se reúne, compara una serie de elementos y los puntúa. Mundialito registra las votaciones y genera resultados, rankings y estadísticas.

La aplicación será **mobile-first**, pensada principalmente para utilizarse desde teléfonos durante una reunión.

## 🎯 Objetivo

Construir una aplicación sencilla, rápida y divertida que permita:

- Crear un Mundialito.
- Definir los participantes.
- Agregar los elementos a comparar.
- Compartir el Mundialito.
- Registrar las puntuaciones de cada participante.
- Calcular automáticamente los resultados.
- Mostrar rankings y estadísticas.

Por ejemplo, seis amigos pueden puntuar ocho alfajores del 1 al 10 y obtener un ganador.

La aplicación no está limitada a alimentos. **Mundialito** es el concepto general.

## 🧭 Principios del proyecto

### Simplicidad

El usuario debe poder crear un Mundialito y empezar a votar en pocos pasos.

### Mobile-first

La aplicación está pensada principalmente para celulares.

### Sin infraestructura innecesaria

No introducir servidores, microservicios, Kubernetes u otras tecnologías complejas si el problema no las necesita.

### Evolución incremental

Primero se construirá un MVP funcional y después se agregarán funcionalidades.

### Código mantenible

Preferir soluciones simples, explícitas y fáciles de entender por encima de abstracciones innecesarias.

### Type safety

Usar TypeScript de forma estricta y evitar `any`, salvo casos justificados.

## 🏗️ Stack tecnológico

| Área | Tecnología o herramienta |
| --- | --- |
| Frontend | Next.js, React y TypeScript |
| Estilos | CSS o sistema de estilos elegido durante la implementación |
| Backend / plataforma | Supabase |
| Base de datos | PostgreSQL |
| Autenticación | Supabase Authentication |
| Tiempo real | Supabase Realtime |
| Seguridad | Supabase Row Level Security (RLS) |
| Tests unitarios | Vitest |
| Tests end-to-end | Playwright |
| Control de versiones | Git y GitHub |
| CI/CD | GitHub Actions |
| Diseño | Figma, cuando sea necesario |
| PWA | Se incorporará en una etapa posterior |

No se implementará inicialmente un backend separado.

## 🗂️ Concepto principal

La entidad central es un **Mundialito**:

```text
Mundialito
├── Participantes
├── Ítems
├── Votaciones
└── Resultados
```

Un Mundialito puede representar cualquier categoría:

- Mundialito de alfajores.
- Mundialito de pizzas.
- Mundialito de películas.
- Mundialito de videojuegos.
- Mundialito de cafés.

La aplicación no debe contener lógica específica para alfajores, pizzas u otras categorías. Debe trabajar con entidades genéricas.

## 🧩 Modelo conceptual

### Mundialito

Representa una competición.

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `name` | Nombre |
| `description` | Descripción |
| `status` | Estado actual |
| `owner` | Propietario |
| `createdAt` | Fecha de creación |
| `updatedAt` | Fecha de última actualización |

Estados iniciales:

- `DRAFT`
- `ACTIVE`
- `FINISHED`

### Participante

Persona que participa en un Mundialito.

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `mundialitoId` | Mundialito al que pertenece |
| `name` | Nombre |
| `userId` | Usuario asociado, opcional inicialmente |

La participación no requiere crear una cuenta: quien recibe el enlace ingresa, se registra escribiendo su nombre y vota sin iniciar sesión.

La lista de participantes es opcional: el owner puede precargarla en `DRAFT`, pero nadie está obligado a aparecer en ella — todo el mundo se registra con su propio nombre al entrar a votar.

El propietario también puede votar una vez iniciada la votación, registrando primero su propio nombre, como cualquier otro participante.

### Ítem

Elemento que se está evaluando.

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `mundialitoId` | Mundialito al que pertenece |
| `name` | Nombre |
| `description` | Descripción opcional |
| `imageUrl` | Imagen opcional |

### Votación

Representa la puntuación de un participante para un ítem.

| Campo | Descripción |
| --- | --- |
| `id` | Identificador único |
| `participantId` | Participante que vota |
| `itemId` | Ítem puntuado |
| `score` | Puntuación de 1 a 10 |
| `createdAt` | Fecha de creación |
| `updatedAt` | Fecha de última actualización |

Debe existir como máximo una votación por combinación `participantId` + `itemId`.

## 📊 Resultados

Los resultados se calculan a partir de las votaciones.

Ejemplo:

| Ítem | Juan | Pedro | Ana | Promedio |
| --- | ---: | ---: | ---: | ---: |
| Havanna | 9 | 8 | 9 | 8.67 |

El sistema debe poder calcular como mínimo:

- Promedio.
- Cantidad de votos.
- Posición en el ranking.
- Puntuación mínima.
- Puntuación máxima.

Las estadísticas más avanzadas se implementarán posteriormente.

## 🔐 Acceso y permisos

### Propietario

El propietario utiliza una cuenta (Supabase Authentication) para administrar su Mundialito.

El propietario de un Mundialito puede:

- Crear Mundialitos.
- Modificar la configuración.
- Agregar y eliminar participantes.
- Agregar y eliminar ítems.
- Iniciar la votación.
- Finalizar el Mundialito.
- Votar una vez iniciada la votación, como un participante más.
- Consultar resultados.

### Participante

Un participante no necesita cuenta ni inicio de sesión. Puede:

- Ingresar al Mundialito mediante el enlace compartido (o su QR).
- Registrarse con su nombre (sin cuenta ni sesión).
- Votar (del 1 al 10) cuando la votación esté activa.
- Modificar su voto mientras la votación esté abierta.
- Modificar su nombre mientras la votación esté abierta.
- Consultar los resultados cuando corresponda.

Un participante nunca tiene permisos de administración: no puede crear, editar ni eliminar el Mundialito, sus participantes o sus ítems, y no puede iniciar ni finalizar la votación.

La seguridad real de los permisos de administración debe implementarse mediante Supabase Row Level Security (RLS) y no depender únicamente del frontend. Las reglas críticas de votación (solo votar con la votación activa y máximo un voto por participante e ítem) también se garantizan en la base de datos, incluso tratándose de votantes sin sesión.

## 🔗 Participación

La aplicación debe permitir compartir un Mundialito mediante un enlace o un QR (el QR simplemente codifica el mismo enlace).

Ejemplo conceptual:

```text
/vote/abc123
```

El enlace es abierto: cualquiera que lo reciba puede ingresar, escribir su nombre y votar. Esto prioriza la simplicidad sobre la integridad técnica del voto y asume confianza entre los participantes. Es una decisión aceptada para el MVP.

Posteriormente se pueden agregar:

- Código corto.
- Invitaciones.
- Deep links.

No implementar estas funcionalidades hasta que el flujo básico funcione.

## 📱 Flujo principal

### Crear un Mundialito

```text
Inicio
  ↓
Crear Mundialito
  ↓
Nombre
  ↓
Agregar participantes (opcional)
  ↓
Agregar ítems
  ↓
Mundialito creado
```

### Participar

```text
Abrir enlace o QR (sin login)
  ↓
Escribir tu nombre
  ↓
Puntuar cada ítem (1-10)
  ↓
Modificar puntajes mientras esté abierto
  ↓
Confirmar votación
```

### Ver resultados

```text
Finalizar votación
  ↓
Calcular resultados
  ↓
Mostrar ranking
  ↓
Mostrar estadísticas
```

## 🚀 MVP

La primera versión debe contener únicamente:

- Crear un Mundialito.
- Editar un Mundialito.
- Agregar participantes.
- Agregar ítems.
- Compartir mediante URL.
- Participar sin iniciar sesión mediante el enlace.
- Registrar puntuaciones.
- Modificar puntuaciones.
- Finalizar la votación.
- Calcular el ranking.
- Mostrar resultados.

No agregar funcionalidades secundarias hasta completar este flujo.

## 🔮 Funcionalidades futuras

Estas funcionalidades están fuera del MVP.

### Modos de competición

- Puntuación del 1 al 10.
- Ranking por posiciones.
- Eliminación directa.
- Grupos.
- Rondas.

### Experiencias

- Cata a ciegas.
- Ocultar el nombre de los ítems.
- Revelar resultados al finalizar.
- Temporizador.

### Social

- Perfiles.
- Historial de Mundialitos.
- Amigos.
- Compartir resultados.

### Estadísticas

- Mayor consenso.
- Elemento más polémico.
- Diferencia entre participantes.
- Evolución de puntuaciones.
- Estadísticas por participante.

### Multimedia

- Imágenes.
- Fotografías.
- Comentarios.
- Etiquetas.

### PWA

- Instalación en celular.
- Funcionamiento offline parcial.
- Caché.

### IA

Posibles funcionalidades futuras:

- Resumen automático de resultados.
- Análisis de preferencias del grupo.
- Detección de resultados controversiales.
- Recomendaciones.
- Generación de descripciones.

La IA no forma parte del MVP.

## 🗄️ Base de datos

La base de datos inicial será PostgreSQL mediante Supabase.

### Modelo conceptual

```text
users
  │
  └── mundialitos
          │
          ├── participants
          │
          └── items
                  │
                  └── votes
```

### Relaciones

```text
mundialito 1 ─── N participants
mundialito 1 ─── N items
participant 1 ─── N votes
item 1 ─── N votes
```

La estructura definitiva de tablas debe mantenerse alineada con este modelo conceptual.

## 🧪 Testing

### Tests unitarios

Vitest se utilizará para probar:

- Cálculo de promedios.
- Ranking.
- Validaciones.
- Reglas de negocio.
- Funciones puras.

Ejemplos de funciones:

```typescript
calculateRanking()
calculateAverage()
validateScore()
```

### Tests end-to-end

Playwright se utilizará para probar los flujos principales:

```text
Crear Mundialito
↓
Agregar participantes
↓
Agregar ítems
↓
Votar
↓
Finalizar
↓
Ver resultados
```

Los tests E2E deben cubrir principalmente el comportamiento del usuario, no detalles internos de implementación.

## 📁 Estructura sugerida

La estructura puede evolucionar, pero inicialmente se busca algo similar a:

```text
/
├── app/
│   ├── page.tsx
│   ├── mundialito/
│   └── ...
│
├── components/
│
├── lib/
│   ├── supabase/
│   ├── calculations/
│   └── validations/
│
├── types/
│
├── tests/
│   ├── unit/
│   └── e2e/
│
├── public/
│
├── supabase/
│   └── migrations/
│
├── .github/
│   └── workflows/
│
├── package.json
└── README.md
```

No crear carpetas o capas adicionales sin necesidad real.

## 📐 Reglas de arquitectura

- La lógica de negocio importante no debe estar dispersa dentro de componentes React.
- Las funciones de cálculo deben ser puras cuando sea posible.
- Las operaciones con Supabase deben estar centralizadas.
- Los componentes deben evitar conocer detalles innecesarios de la base de datos.
- Validar datos tanto en frontend como en backend o base de datos cuando corresponda.
- No confiar en el frontend para aplicar reglas de seguridad.
- Usar RLS para proteger los datos.
- Evitar duplicación de lógica.
- Evitar abstracciones prematuras.
- No introducir una nueva dependencia si una solución existente es suficiente.

## 🤖 Reglas para agentes de IA

Este archivo funciona como fuente de verdad del proyecto.

Antes de modificar código, un agente debe:

1. Leer este README.
2. Revisar la estructura actual del proyecto.
3. Revisar las implementaciones existentes.
4. Evitar modificar decisiones arquitectónicas sin justificación.
5. Priorizar el MVP sobre funcionalidades futuras.
6. No introducir tecnologías nuevas innecesariamente.
7. No crear funcionalidades que no estén relacionadas con el objetivo del proyecto.
8. Mantener TypeScript estricto.
9. Crear o actualizar tests cuando se modifique lógica de negocio.
10. Mantener este README actualizado si cambia una decisión arquitectónica importante.

> **Regla importante:** no implementar funcionalidades futuras simplemente porque aparecen documentadas en este README. La sección de funcionalidades futuras es un roadmap, no una lista de tareas pendientes obligatorias.

## 🚫 Decisiones deliberadamente fuera del MVP

No utilizar inicialmente:

- Kubernetes.
- Microservicios.
- Servidores propios.
- AWS.
- Terraform.
- Redis.
- Kafka.
- RabbitMQ.
- Backend separado.
- Aplicación Android nativa.

Estas tecnologías podrían evaluarse posteriormente si aparece una necesidad real.

## 🎯 Objetivo técnico del proyecto

El proyecto debe servir simultáneamente como:

- Aplicación realmente utilizable entre amigos.
- Proyecto personal para portfolio.
- Ejercicio de desarrollo Full Stack moderno.
- Ejercicio de diseño de base de datos.
- Ejercicio de testing.
- Ejercicio de CI/CD.
- Base para experimentar posteriormente con PWA, Realtime e IA.

La prioridad es construir algo simple, funcional y bien diseñado, y aumentar progresivamente su complejidad.

## 🛣️ Roadmap

- [ ] Definir diseño inicial.
- [ ] Crear proyecto Next.js + TypeScript.
- [ ] Configurar Supabase.
- [ ] Crear modelo PostgreSQL.
- [ ] Implementar creación de Mundialitos.
- [ ] Implementar participantes.
- [ ] Implementar ítems.
- [ ] Implementar votaciones.
- [ ] Implementar resultados.
- [ ] Implementar RLS.
- [ ] Implementar tests unitarios.
- [ ] Implementar tests E2E.
- [ ] Deploy inicial.
- [ ] Compartir mediante URL.
- [ ] Mejorar UX mobile.
- [ ] PWA.
- [ ] Realtime.
- [ ] QR.
- [ ] Estadísticas avanzadas.
- [ ] IA.

## 🏁 Definition of Done: MVP

El MVP se considera terminado cuando:

- Un usuario puede crear un Mundialito.
- Puede agregar participantes.
- Puede agregar ítems.
- Puede compartir el Mundialito.
- Los participantes pueden votar desde sus celulares, sin crear una cuenta.
- Cada participante puede modificar su voto mientras esté permitido.
- El sistema calcula correctamente los resultados.
- El ranking se muestra correctamente.
- Los datos están protegidos mediante RLS.
- Existen tests para la lógica principal.
- Existe al menos un flujo E2E completo.
- La aplicación está desplegada y puede utilizarse desde un celular.

## 💡 Ejemplo

### Mundialito de alfajores

**Participantes:**

```text
Juan
Pedro
Ana
Martín
```

**Ítems:**

```text
Havanna
Cachafaz
Jorgito
Guaymallén
```

Cada participante puntúa del 1 al 10.

**Resultado:**

```text
🏆 Havanna       8.75
🥈 Cachafaz      8.25
🥉 Jorgito       7.50
   Guaymallén    6.25
```

El mismo sistema debe funcionar sin modificaciones para:

```text
🍕 Pizzas
🍔 Hamburguesas
☕ Cafés
🎬 Películas
🎮 Videojuegos
```

El producto es el Mundialito; los alfajores son solamente un caso de uso.
