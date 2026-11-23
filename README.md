# GustoDulce

PWA offline-first de costeo ABC (TDABC) e inventario FEFO para micro-reposteras artesanales.

## Comandos

```bash
npm install
npm run dev        # desarrollo
npm test           # 118 pruebas (106 unitarias + 12 de integración sobre IndexedDB)
npm run coverage   # cobertura con V8
npm run typecheck  # TypeScript estricto
npm run build      # compilación de producción (con Service Worker y manifiesto)
```

## Arquitectura

- `src/domain/`: dominio puro (costeo, FEFO, libro de movimientos, catálogo LWW). Sin React, Dexie ni Firebase.
- `src/aplicacion/`: casos de uso, motor de respaldo idempotente y raíz de composición.
- `src/infra/`: IndexedDB (Dexie) y adaptador de Cloud Firestore.
- `src/App.tsx`: interfaz Sucia-Friendly con barra de navegación inferior.
- `src/PuertaSesion.tsx`, `src/PantallaAcceso.tsx`: inicio de sesión con Firebase Auth (correo y contraseña).
- `public/sw.js`, `public/manifest.webmanifest`: PWA instalable y arranque sin conexión.
- `firestore.rules`: reglas de seguridad del respaldo.

## Respaldo en la nube (opcional)

Sin configuración, la app funciona 100 % en local y abre sin pantalla de acceso. Para activar el inicio de sesión y el respaldo, crea `.env.local` y activa **Authentication → Correo/Contraseña** en Firebase Console:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```
