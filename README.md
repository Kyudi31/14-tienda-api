# API REST y Route Handlers · Inventario de Tienda de Barrio

Backend serverless para la aplicación móvil de gestión de inventario para tiendas de barrio. Provee autenticación mediada, sincronización bidireccional offline-first, registro atómico de movimientos de kardex y recálculo automático de alertas de bajo stock.

---

## 1. Arquitectura del Sistema

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router) con TypeScript en modo estricto.
- **Runtime:** `export const runtime = "nodejs"` en todos los Route Handlers para compatibilidad completa con Node.js `crypto` y el Firebase Admin SDK.
- **Plataforma de Despliegue:** [Vercel](https://vercel.com/) (Serverless Functions con despliegue continuo).
- **Base de Datos y Autenticación:** [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) v14 (`firebase-admin/app`, `firebase-admin/auth`, `firebase-admin/firestore`).
  - **Auth:** Verificación de sesiones mediante JWT ID Tokens (`verifyIdToken()`).
  - **Firestore:** Acceso privilegiado de servidor. Las reglas de seguridad de Firestore en la nube bloquean todo acceso directo del cliente (`allow read, write: if false;`), obligando a que toda operación pase por esta API.
- **Validación de Esquemas:** [Zod](https://zod.dev/) v4 para parseo estricto, eliminación de campos maliciosos no declarados (`.strip()`) y tipado seguro inferido.
- **Aislamiento Multi-Tenant:** Estructura jerárquica en subcolecciones `usuarios/{uid}/producto/{id}` y `usuarios/{uid}/movimiento_stock/{id}`. El `uid` se extrae exclusivamente del token verificado.

```
                          ┌─────────────────────────┐
                          │   Android Mobile App    │
                          │      (Kotlin/Room)      │
                          └───────────┬─────────────┘
                                      │ HTTPS / Bearer JWT
                                      ▼
                      ┌─────────────────────────────────┐
                      │    Next.js API (App Router)     │
                      │  - runtime = 'nodejs' (Vercel)  │
                      │  - Zod Validation (.strip)      │
                      │  - Firebase Admin SDK           │
                      └───────┬─────────────────┬───────┘
                              │                 │
         verifyIdToken(token) │                 │ runTransaction(...)
                              ▼                 ▼
                     ┌────────────────┐ ┌────────────────────────┐
                     │ Firebase Auth  │ │  Cloud Firestore       │
                     │ (Google Cloud) │ │  usuarios/{uid}/...    │
                     └────────────────┘ └────────────────────────┘
```

---

## 2. Variables de Entorno y Seguridad de Credenciales

### Variables Requeridas en Vercel (Producción)

| Variable | Tipo | Propósito | Ejemplo / Formato |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | String | Identificador del proyecto en Google Cloud / Firebase | `inventario-tienda-prod` |
| `FIREBASE_CLIENT_EMAIL` | String | Correo de la cuenta de servicio de Firebase Admin SDK | `firebase-adminsdk-xxx@proj.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | String | Clave privada RSA de la cuenta de servicio | `"-----BEGIN PRIVATE KEY-----\nMIIEvgI...\n-----END PRIVATE KEY-----\n"` |
| `FIREBASE_WEB_API_KEY` | String | Web API Key pública del proyecto para Auth REST API | `AIzaSyD-xxxxxxxxxxxxxxxxxxxxxxxxx` |

> [!NOTE]
> En entornos de desarrollo y suites de pruebas automatizadas (Vitest), el sistema implementa mocks en memoria y fallbacks (`lib/firebaseAdmin.ts`), permitiendo ejecutar pruebas sin requerir credenciales activas en disco.

### Seguridad Crítica: ¿Por qué NUNCA se guardan en el APK ni en Git?

1. **Riesgo en el APK de Android:**
   - Un archivo APK distribuido a clientes es susceptible de decompilación inmediata con herramientas estándar como `jadx`, `apktool` o `strings`.
   - Cualquier secreto o clave de cuenta de servicio incrustado en `strings.xml`, `BuildConfig` o código compilado queda expuesto públicamente en cuestión de segundos.
2. **Poder Absoluto de la Cuenta de Servicio:**
   - La clave privada (`FIREBASE_PRIVATE_KEY`) otorga permisos administrativos globales sobre Google Cloud y Firebase Admin SDK, **bypaseando todas las reglas de seguridad de Firestore**.
   - Su compromiso permitiría a un atacante borrar, modificar o exfiltrar toda la base de datos de todos los usuarios de la aplicación.
3. **Persistencia en el Historial de Git:**
   - Incluir credenciales en repositorios de Git (incluso privados) propaga los secretos a través del historial de commits, forks y clones locales, exponiéndolos a bots automatizados de scraping.
4. **Principio de Confianza Cero (Zero Trust):**
   - El cliente móvil solo recibe un token temporal de sesión de corta duración (1 hora). Las credenciales maestras residen exclusivamente en las variables de entorno cifradas de Vercel.

---

## 3. Catálogo de Endpoints

Todas las rutas privadas requieren la cabecera:
```http
Authorization: Bearer <idToken>
```

### 3.1. Autenticación (`/api/auth`)

#### `POST /api/auth/registro`
Registra un nuevo usuario en Firebase Auth y devuelve tokens de acceso.
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "tendero@tienda.com",
    "password": "PasswordSeguro123"
  }
  ```
- **Respuesta Exitosa (201 Created):**
  ```json
  {
    "token": "<firebase_id_token>",
    "refreshToken": "<firebase_refresh_token>",
    "expiraEnSeg": 3600,
    "usuario": {
      "id": "uid_generado_firebase",
      "email": "tendero@tienda.com"
    }
  }
  ```
- **Errores:**
  - `400 Bad Request`: Datos de entrada inválidos (por ejemplo, contraseña menor a 8 caracteres). Retorna `{ "error": "Datos de entrada inválidos", "detalles": [...] }`.
  - `409 Conflict`: El correo ya se encuentra registrado. Retorna `{ "error": "El correo electrónico ya se encuentra registrado" }`.

#### `POST /api/auth/login`
Inicia sesión con credenciales y entrega credenciales temporales.
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "email": "tendero@tienda.com",
    "password": "PasswordSeguro123"
  }
  ```
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "token": "<firebase_id_token>",
    "refreshToken": "<firebase_refresh_token>",
    "expiraEnSeg": 3600,
    "usuario": {
      "id": "uid_firebase",
      "email": "tendero@tienda.com"
    }
  }
  ```
- **Errores:**
  - `401 Unauthorized`: Credenciales inválidas. Retorna `{ "error": "Credenciales inválidas" }`.

#### `POST /api/auth/refresh`
Renueva el ID Token vencido utilizando el token de actualización.
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "refreshToken": "<firebase_refresh_token>"
  }
  ```
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "token": "<nuevo_firebase_id_token>",
    "refreshToken": "<nuevo_refresh_token>",
    "expiraEnSeg": 3600
  }
  ```
- **Errores:**
  - `401 Unauthorized`: Token de actualización inválido o expirado.

#### `GET /api/auth/yo`
Verifica criptográficamente el JWT del usuario autenticado.
- **Headers:** `Authorization: Bearer <idToken>`
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "usuario": {
      "id": "uid_autenticado",
      "email": "tendero@tienda.com",
      "rol": "usuario"
    }
  }
  ```
- **Errores:**
  - `401 Unauthorized`: Token no proporcionado, malformado o vencido.

---

### 3.2. Endpoints de Negocio e Inventario

#### `POST /api/productos/:id/ajustar`
Ejecuta un ajuste de stock mediante **transacción atómica en Firestore** (`db.runTransaction`), recalculando el estado de alerta `bajo_stock` y creando concurrentemente el registro en la colección de movimientos.
- **Headers:** `Authorization: Bearer <idToken>`, `Content-Type: application/json`
- **Parámetro URL:** `:id` (ID del producto en la tienda del usuario).
- **Body:**
  ```json
  {
    "delta": -5,
    "motivo": "Venta mostrador"
  }
  ```
- **Reglas de Negocio:**
  - `delta` debe ser un entero distinto de `0`.
  - La transacción calcula `nuevoStock = stock_actual + delta`.
  - Si `nuevoStock < 0`, la transacción aborta inmediatamente y retorna `400 Bad Request` ("Stock insuficiente").
  - Si el producto tiene `deleted_at != null` o no existe, retorna `404 Not Found`.
  - Actualiza `stock = nuevoStock` y recalcula `bajo_stock = (nuevoStock <= minimo)`.
  - Genera automáticamente un documento en `usuarios/{uid}/movimiento_stock` dentro del mismo commit atómico.
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "producto": {
      "id": "prod_123",
      "codigo": "7701234567890",
      "nombre": "Arroz Diana 1kg",
      "precio_centavos": 4500,
      "stock": 3,
      "minimo": 5,
      "bajo_stock": true,
      "created_at": "2026-11-20T00:00:00.000Z",
      "updated_at": "2026-11-20T01:30:00.000Z",
      "deleted_at": null
    },
    "movimiento": {
      "id": "mov_987",
      "producto_id": "prod_123",
      "delta": -5,
      "motivo": "Venta mostrador",
      "created_at": "2026-11-20T01:30:00.000Z",
      "updated_at": "2026-11-20T01:30:00.000Z",
      "deleted_at": null
    }
  }
  ```

#### `GET /api/productos/bajo-stock`
Retorna la lista de productos del usuario autenticado que requieren reabastecimiento (`bajo_stock == true`), excluyendo aquellos con borrado lógico.
- **Headers:** `Authorization: Bearer <idToken>`
- **Respuesta Exitosa (200 OK):**
  ```json
  [
    {
      "id": "prod_123",
      "codigo": "7701234567890",
      "nombre": "Arroz Diana 1kg",
      "precio_centavos": 4500,
      "stock": 3,
      "minimo": 5,
      "bajo_stock": true,
      "created_at": "2026-11-20T00:00:00.000Z",
      "updated_at": "2026-11-20T01:30:00.000Z",
      "deleted_at": null
    }
  ]
  ```

---

### 3.3. Sincronización Offline-First (Productos y Movimientos)

Diseñado para sincronización delta bidireccional entre la base de datos local SQLite/Room y Firestore.

#### `GET /api/productos?since=<ISO_TIMESTAMP>`
Obtiene los productos creados, modificados o marcados para eliminación desde una fecha específica.
- **Headers:** `Authorization: Bearer <idToken>`
- **Query Params:**
  - `since` *(opcional)*: Marca de tiempo ISO-8601 (ej. `2026-11-20T00:00:00.000Z`). Si se omite, retorna la totalidad de registros (límite 500).
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "prod_123",
        "codigo": "7701234567890",
        "nombre": "Arroz Diana 1kg",
        "precio_centavos": 4500,
        "stock": 10,
        "minimo": 5,
        "bajo_stock": false,
        "created_at": "2026-11-20T00:00:00.000Z",
        "updated_at": "2026-11-20T01:00:00.000Z",
        "deleted_at": null
      }
    ],
    "servidor_ahora": "2026-11-20T01:45:00.000Z"
  }
  ```

#### `PUT /api/productos/:id`
Guarda o actualiza un producto de forma **idempotente** (upsert con ID determinado por el cliente).
- **Headers:** `Authorization: Bearer <idToken>`, `Content-Type: application/json`
- **Body:**
  ```json
  {
    "codigo": "7701234567890",
    "nombre": "Aceite Vegetal 900ml",
    "precio_centavos": 8500,
    "stock": 12,
    "minimo": 4
  }
  ```
- **Comportamiento:** Valida con Zod, purga cualquier campo no declarado (`strip()`), calcula reactivamente `bajo_stock = (stock <= minimo)` y preserva el `created_at` original si el documento ya existía.
- **Respuesta Exitosa (200 OK):** Objeto `ProductoDoc` guardado.

#### `DELETE /api/productos/:id`
Aplica **borrado lógico (soft delete)** al producto, estableciendo `deleted_at` con la marca de tiempo ISO actual y actualizando `updated_at`. Permite que los dispositivos móviles sincronicen la eliminación sin pérdida de trazabilidad.
- **Headers:** `Authorization: Bearer <idToken>`
- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "id": "prod_123",
    "deleted_at": "2026-11-20T01:50:00.000Z"
  }
  ```
- **Errores:** `404 Not Found` si el producto no existe o ya estaba marcado como eliminado.

#### Endpoints Equivalentes para Movimientos (`/api/movimientos`)
- `GET /api/movimientos?since=<ISO_TIMESTAMP>`: Retorna `{ items: MovimientoDoc[], servidor_ahora: string }`.
- `PUT /api/movimientos/:id`: Inserción/actualización idempotente de movimiento (`producto_id`, `delta`, `motivo`).
- `DELETE /api/movimientos/:id`: Borrado lógico del movimiento.

---

### 3.4. Formato Estandarizado de Respuestas de Error

Todas las respuestas de error en la API siguen un formato estricto:
```json
{
  "error": "Mensaje descriptivo del error",
  "detalles": [
    {
      "campo": "password",
      "mensaje": "La contraseña debe tener al menos 8 caracteres"
    }
  ]
}
```
En errores imprevistos (500), la respuesta es siempre `{ "error": "Error interno del servidor" }`, protegiendo la infraestructura de filtraciones de stack traces o rutas internas.

---

## 4. Instrucciones de Ejecución Local, Pruebas y Despliegue

### Requisitos Previos
- [Node.js](https://nodejs.org/) v20 o superior.
- Gestor de paquetes `npm` (incluido con Node).

### 4.1. Instalación y Ejecución Local
```bash
# 1. Clonar el repositorio y navegar a la carpeta de la API
cd 14-inventario-tienda-api

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo en http://localhost:3000
npm run dev
```

### 4.2. Verificación de Calidad y Pruebas
El proyecto cuenta con un script de auditoría integral:
```bash
# Ejecutar la suite completa de pruebas unitarias (Vitest)
npm test

# Pipeline de calidad unificado (TypeScript strict + ESLint + Vitest 25/25)
npm run check
```

### 4.3. Despliegue en Vercel
```bash
# Iniciar sesión en Vercel CLI (si no se ha hecho previamente)
npx vercel login

# Vincular proyecto existente
npx vercel link

# Configurar variables de entorno requeridas en Vercel
npx vercel env add FIREBASE_PROJECT_ID production
npx vercel env add FIREBASE_CLIENT_EMAIL production
npx vercel env add FIREBASE_PRIVATE_KEY production
npx vercel env add FIREBASE_WEB_API_KEY production

# Desplegar a producción
npx vercel --prod
```
