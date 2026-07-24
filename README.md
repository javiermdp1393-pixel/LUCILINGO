# Lucilingo — Mistake Trainer

App personal de repaso espaciado construida sobre los errores reales de inglés del usuario.
Convierte el registro pasivo de errores (en Notion) en un ciclo activo:
**cometo el error → se registra → lo practico hasta que deja de aparecer → se cierra**.

Mascota: **Lucy** 🐱

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| **F0** | Next.js + Supabase + esquema + migración del `Mistake log` | ✅ Hecho |
| **F1** | Sesión de práctica (Leitner + reviews) | ✅ Hecho — **la app ya es útil** |
| F2 | Generación de variantes con IA + validación + flag | ⏳ Pendiente |
| F3 | Escritura libre y alta de errores | ⏳ Pendiente |
| F4 | Pantalla de progreso y métricas | ⏳ Pendiente |
| F5 | Sync incremental con Notion, pulido, export | ⏳ Pendiente |

## Arquitectura

- **Frontend/Backend:** Next.js 16 (App Router) + Tailwind v4, para desplegar en Vercel.
- **BBDD:** Supabase Postgres (fuente de verdad). Proyecto `Lucilingo` (`ojqwxibpklmnzdrsjlsi`).
- **Acceso a datos:** todo pasa por route handlers de servidor con la `service_role` key.
  RLS está activado en todas las tablas **sin políticas para anon**, así que la clave pública
  no puede leer nada; el cliente nunca ve la clave secreta.
- **IA (F2+):** Anthropic SDK, siempre en servidor.

### Nota sobre autenticación

La v1 es de un solo usuario. Todas las tablas llevan `user_id` desde el día uno (constante
`OWNER_USER_ID`), preparadas para enganchar el FK a `auth.users` y un login real de Supabase Auth
sin migración destructiva. En F0/F1 el login todavía no está montado.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local
# Edita .env.local y pega la service_role key (Supabase → Project Settings → API)
npm run dev
```

Abre http://localhost:3000.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto (público). |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta de servidor. **Nunca** en el cliente ni en git. |
| `ANTHROPIC_API_KEY` | Solo para F2+. |

## Modelo de datos

Decisión estructural clave: **separar el error del ejercicio**. Un `mistake` (la regla que falla)
tiene N `items` rotatorios, para consolidar la regla y no memorizar una frase. El estado del
repaso espaciado (Leitner de 5 cajas) vive en `review_state`, 1:1 con `mistake`.

Migraciones en Supabase:
1. `initial_schema` — enums, tablas, índices, triggers, RLS.
2. `build_session_queue_fn` — función que arma la cola de una sesión.
3. `dashboard_stats_fn` — métricas del home.

## Pantallas (F1)

| Ruta | Contenido |
|---|---|
| `/` | Hoy: racha, vencidos, activos, dominados, botón «Empezar sesión». |
| `/session` | Un ítem por pantalla, evaluación y feedback inmediato. |
| `/session/[id]/summary` | Resultado: aciertos, tiempo, categorías flojas. |
| `/log` | Lista de errores con su estado de repaso (solo lectura por ahora). |

## La mascota Lucy

El logo actual es un **placeholder SVG** en `public/brand/lucy.svg`. Para usar la Lucy real:
guarda el PNG en `public/brand/lucy.png` y cambia el `src` en `app/components/Lucy.tsx`.
