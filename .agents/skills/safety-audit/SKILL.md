---
name: safety-audit
description: >-
  Audita la seguridad, credenciales de Firebase Admin y calidad del backend API.
---

# Auditoría de Seguridad y Calidad (Backend API)

Sigue este procedimiento para validar el backend:

## 1. Escaneo de Secretos y Fugas
Ejecuta el script de comprobación:
```bash
./.agents/skills/safety-audit/scripts/check-secrets.sh
```
- Comprueba que `.env*` no esté en Git.
- Asegura que claves privadas de Firebase Admin no estén escritas en duro en el código.

## 2. Comprobación del Canario
```bash
./.agents/skills/safety-audit/scripts/run-canary-test.sh
```

## 3. Calidad Automática
Ejecuta el pipeline de calidad:
```bash
npm run check
```
- Valida tipos (`tsc --noEmit`).
- Valida linting (`eslint .`).
- Ejecuta las pruebas unitarias (`vitest run`).
