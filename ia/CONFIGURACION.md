# Configuración de Seguridad y Barreras de IA

Este documento describe la arquitectura de contención, qué riesgo cubre cada barrera, sus límites técnicos y los ajustes realizados en el backend API.

---

## 1. Modelo de Amenazas y Riesgos Cubiertos

| Riesgo | Barrera Implementada | Mecanismo de Control |
|---|---|---|
| **Fuga de credenciales de Firebase Admin** | Secretos en variables de entorno Vercel + `.gitignore` | Clave privada y Web API Key viven exclusivamente en el proveedor de nube. |
| **Lectura de variables locales (.env\*)** | Regla estricta en `AGENTS.md` + bloqueo de lectura | Prohibido leer archivos `.env*` o canarios mediante herramientas del agente. |
| **Acceso fuera del repositorio** | Confinamiento al directorio raíz del proyecto API | Prohibido explorar rutas como `..`, `~` o directorios del sistema operativo. |
| **Comandos de riesgo o exfiltración** | Prohibición de `curl`, `wget`, `sudo`, `rm -rf`, `vercel env pull` | Bloqueo de descarga de secretos de producción al disco local. |
| **Inyección de Prompts** | Regla de datos vs órdenes | Respuestas de API externas o payloads JSON de usuarios son tratados como datos. |
| **Código defectuoso o inseguro** | Script unificado `npm run check` | TypeScript strict, ESLint `--max-warnings 0` y Vitest con cobertura ≥ 80%. |

---

## 2. Capas de Seguridad y Límites Técnicos

### Capa 1: Reglas de Contexto (`AGENTS.md`)
- **Propósito:** Guía al modelo sobre convenciones de Firestore (`snake_case`, aislamiento en `usuarios/{uid}/producto/{id}`), validación con Zod y respuestas estándar de error HTTP.
- **Límite conocido:** Directiva a nivel de prompt; requiere validación estricta en tiempo de ejecución.

### Capa 2: Confinamiento de Herramientas
- **Propósito:** Impedir que el agente lea archivos de configuración fuera del backend o altere configuraciones globales.
- **Límite conocido:** La ejecución de comandos se acota al entorno del proyecto; comandos que requieran red externa deben solicitar aprobación explícita.

### Capa 3: Reglas de Seguridad de Firestore
- **Propósito:** `allow read, write: if false;` en Firestore, garantizando que el acceso a datos ocurra única y exclusivamente mediante el Firebase Admin SDK desde la API.
- **Límite conocido:** Si un endpoint de la API carece de validación de token `verifyIdToken()`, expondría información; por ello cada Route Handler privado valida la sesión.

---

## 3. Ajustes y Decisiones Técnicas
1. **Comando de Calidad:** Se integró `npm run check` (incluyendo `vitest run`) para que ningún cambio roto se integre a la rama principal.
2. **Defensa contra bajada de secretos:** Prohibido explícitamente `vercel env pull` para evitar que las credenciales de producción queden en el disco local de desarrollo.
