# Bitácora de Interacción con Asistentes de IA · Backend API

Registro de sesiones de desarrollo asistido con IA, metodologías aplicadas, validaciones y decisiones tomadas en el backend Next.js.

---

## 1. Registro General de Sesiones

| Sesión / Fecha | Propósito | Evidencia / Prompt | Validación | Decisión |
|---|---|---|---|---|
| **#1 · 14-Nov** | Inicialización del repositorio y reglas de IA | *"Crea la configuración de AGENTS.md, Vitest y Firebase Admin para Next.js"* | Comprobación de runtime Node.js y validación de tipos | Aceptado |
| **#2 · 14-Nov** | Integración de Zod y Vitest | *"Agrega scripts de calidad npm run check con vitest run"* | Ejecución del pipeline de pruebas locales | Aceptado |
| **#3 · 14-Nov** | Estructura de Route Handlers y Firestore | *"Planifica las rutas de auth y ajuste transaccional en /api/productos/:id/ajustar"* | Revisión de aislamiento por ruta `usuarios/{uid}/producto/{id}` | Aceptado |
| **#4 · 20-Nov** | Autenticación mediada por la API (Hito 3 · Tarea 3.1) | *"Implementa /api/auth/registro, /login, /refresh, /yo con validación Zod, verificación con Firebase Admin y suite Vitest"* | `npm run check` 13/13 pruebas pasadas (100%), modularización < 300 líneas, TypeScript strict | Listo para commit |
| **#5 · 20-Nov** | Endpoints de Negocio, Firestore y Sincronización (Hito 3 · Tarea 3.2) | *"Implementa lib/firestoreSchemas, lib/firestoreService (transacciones, bajo_stock, sincronización since), route handlers en /api/productos y /api/movimientos, y suite Vitest con 5 pruebas obligatorias"* | `npm run check` 25/25 pruebas pasadas (100%), 0 advertencias ESLint, archivos ≤ 250 líneas, TypeScript strict | Listo para commit |

---

## 2. Casos Obligatorios de Corrección y Rechazo a la IA (Mínimo 3)

La rúbrica exige documentar al menos 3 instancias donde el equipo **rechazó o corrigió** una propuesta de la IA:

### Caso 1: Rechazo de comando `vercel env pull`
- **Propuesta de la IA:** La IA sugirió ejecutar `vercel env pull` para descargar las variables de entorno de producción localmente y probar la API.
- **Motivo de rechazo:** Violación estricta de las reglas de contención (Sección 2 de la rúbrica): bajar secretos reales al disco de desarrollo compromete la seguridad.
- **Corrección aplicada:** Se utilizó el emulador de Firebase y variables dummy en desarrollo, manteniendo los secretos únicamente en el panel de Vercel.

### Caso 2: Corrección en manejo de errores HTTP internos
- **Propuesta de la IA:** La IA incluyó un bloque `catch (error) { return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 }) }`.
- **Motivo de corrección:** La rúbrica prohíbe filtrar stack traces o detalles internos al cliente en errores 500 por seguridad.
- **Corrección aplicada:** Se cambió por un mensaje genérico `{ error: "Error interno del servidor" }` registrando el log de forma interna y sanitizada.

### Caso 3: Corrección en lectura de UID del usuario
- **Propuesta de la IA:** La IA diseñó el endpoint `/api/productos` recibiendo el `uid` del usuario en el cuerpo de la petición JSON (`req.body.uid`).
- **Motivo de rechazo:** Vulnerabilidad de seguridad crítica (suplantación de identidad). El cliente jamás debe decidir su propio `uid`.
- **Corrección aplicada:** Se forzó la validación estricta del token de Firebase Auth con `getAuth().verifyIdToken()`, extrayendo el `uid` exclusivamente del token verificado.
