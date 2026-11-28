# GustoDulce

PWA offline-first de costeo ABC (TDABC) e inventario FEFO para micro-reposteras artesanales de Santa Cruz de la Sierra. Funciona sin internet, se instala en el celular y se ve igual en Android y en iOS.

## Comandos

```bash
npm install
npm run dev        # desarrollo (npm run dev -- --host para probar desde el celular en la misma Wi-Fi)
npm test           # pruebas unitarias y de integración sobre IndexedDB (fake-indexeddb)
npm run coverage   # cobertura con V8
npm run typecheck  # TypeScript estricto
npm run build      # compilación de producción (con Service Worker y manifiesto)
```

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Primeros pasos** | Una cuenta nueva arranca vacía y guía a la repostera: costos y horas → inventario → primera receta → primera cotización. |
| **Inventario** | Alta de insumos nuevos con su primera compra, compras por lote, buscador, semáforo de caducidad (verde / amarillo / rojo), consumo FEFO y registro de merma. |
| **Costos** | Mano de obra (sueldo de referencia ÷ horas al mes) y servicios del mes (luz, agua, gas) convertidos a costo por minuto. |
| **Recetas** | Crear recetas, agregar o quitar ingredientes, tiempos y porciones; costo de la receta, producción con descuento FEFO y retiro de recetas (se conserva el historial). |
| **Cotización** | Sin margen aparte: precio = materia prima + costos indirectos + mano de obra (la ganancia de la repostera), redondeado a Bs 0,50. Las 2 recetas más usadas a la vista y el resto en una lista plegable. Envío a la clienta por WhatsApp (solo producto, porciones y precio). |
| **Roles** | *Repostera* (uso normal) y *administradora* (pestaña **Panel**: métricas agregadas de cada repostera y cuentas demo para pruebas). |
| **Datos de prueba** | La administradora puede cargar ≈ 288 registros en su cuenta: 40 insumos, 30 recetas, 94 compras, 35 cotizaciones y 12 producciones con 88 consumos FEFO. |
| **Inicio de sesión** | Cuenta con correo y contraseña (Firebase Auth). Se entra una vez con internet; después abre sin red. |
| **Respaldo en la nube** | Sincronización con Cloud Firestore cuando hay conexión. |

## Interfaz "Sucia-Friendly"

- **Barra de navegación inferior** con los 4 módulos en este orden: Inventario, Costos, Recetas y Cotización. Siempre visibles y al alcance del pulgar; reemplaza al menú hamburguesa.
- **Selector numérico** con botones − y + de 64 px (mantener presionado acelera) y **escritura manual**: al tocar el número se abre el teclado numérico del celular para escribir la cantidad exacta.
  - Acepta coma o punto decimal (`12,5` o `12.5`) e ignora `Bs`, `%` y unidades escritas por costumbre.
  - Si el valor está fuera del rango permitido, avisa en vez de recortarlo en silencio.
  - ✓ guarda, ✕ cancela y deja el valor anterior.
- **Mismo diseño en Android e iOS**: zonas seguras (notch y barra de gestos) respetadas, campos con letra ≥ 16 px para evitar el zoom automático de iOS, sin estilos nativos de los inputs.
- **Cerrar sesión en dos toques**, para que un roce con la mano sucia no saque a la repostera de la app.
- Áreas táctiles ≥ 48 px con separación ≥ 12 px y paleta de alto contraste crema / café / rosa.

## Arquitectura

- `src/domain/`: dominio puro (costeo, FEFO, libro de movimientos, catálogo LWW, sesión y captura numérica). Sin React, Dexie ni Firebase.
- `src/aplicacion/`: casos de uso, motor de respaldo idempotente y raíz de composición (`contenedor.ts`).
- `src/infra/`: IndexedDB (Dexie), adaptador de Cloud Firestore y adaptador de Firebase Auth (`sesion-firebase.ts`).
- `src/App.tsx`: estado de la app, roles y navegación inferior.
- `src/ui/`: una pantalla por archivo (`PantallaInventario`, `PantallaCostos`, `PantallaRecetas`, `PantallaCotizador`, `PantallaBienvenida`, `PantallaPanel`) y componentes comunes (`comunes.tsx`).
- `src/data/datos-prueba.ts`: generador determinista de datos de prueba y de reposteras demo.
- `src/infra/perfiles-firestore.ts`: perfil público con métricas de cada repostera (`perfiles/{uid}`).
- `src/PuertaSesion.tsx`, `src/PantallaAcceso.tsx`: inicio de sesión, registro y recuperación de contraseña.
- `public/sw.js`, `public/manifest.webmanifest`: PWA instalable y arranque sin conexión.
- `firestore.rules`: reglas de seguridad. Cada usuaria solo accede a `respaldos/{su uid}`; la administradora lee `perfiles/*` (métricas agregadas), nunca los respaldos privados.
- Cada cuenta tiene su propia base IndexedDB en el teléfono (`gustodulce-<uid>`), así dos cuentas en el mismo dispositivo no se mezclan.

Firebase se carga bajo demanda: sin configuración, el SDK ni siquiera se descarga.

## Inicio de sesión y respaldo en la nube (opcional)

Sin configuración, la app funciona 100 % en local y abre sin pantalla de acceso. Para activar el inicio de sesión y el respaldo:

1. En [Firebase Console](https://console.firebase.google.com), crea un proyecto y registra una **app web** (Configuración del proyecto → General → Tus apps → `</>`).
2. **Authentication → Sign-in method** → habilita **Correo electrónico/contraseña**.
3. **Firestore Database** → crea la base de datos (ubicación `southamerica-east1`, modo producción).
4. **Firestore → Reglas** → pega el contenido de `firestore.rules` y publica.
5. Crea `.env.local` en la raíz del proyecto con los datos de tu app web:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_ADMIN_EMAILS=belustianabecerra@gmail.com
   ```

   Hay una plantilla en `.env.example`. `VITE_ADMIN_EMAILS` acepta varios correos separados por coma; cada correo debe estar también en la función `esAdmin()` de `firestore.rules`.

6. Reinicia `npm run dev` (Vite solo lee `.env.local` al arrancar).

`.env.local` está en `.gitignore` y no se sube al repositorio.

## Limitaciones conocidas

- El primer inicio de sesión necesita internet; después la sesión queda guardada en el teléfono.
- Los datos locales (IndexedDB) se separan por cuenta en el teléfono y se respaldan en Firestore; al entrar en otro dispositivo se recuperan con la primera sincronización.
- La administradora se reconoce por su correo (token de Firebase Auth). Para mayor seguridad se puede migrar a *custom claims* con el Admin SDK.
