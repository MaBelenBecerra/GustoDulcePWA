# GustoDulce PWA
Aplicación Web Progresiva Offline-First diseñada para la gestión financiera y operativa de micro-reposterías artesanales, construida con React, TypeScript y Tailwind CSS v4.

## Arquitectura y Lógica de Dominio
* **Motor de Costeo ABC (TDABC):** Algoritmo determinista que calcula el costo unitario a partir de Materia Prima Directa (con factor de merma), Mano de Obra Directa (minutaria) y prorrateo de Costos Indirectos de Fabricación (CIF).
* **Control Logístico FEFO Multilote:** Módulo de inventarios con deducción automática en cascada bajo el principio First-Expired, First-Out, y alertas cromáticas de proximidad de vencimiento (Semáforo de caducidad).
* **Base de Datos Offline-First:** Persistencia atómica local sin latencia mediante IndexedDB (Dexie.js), con estructura preparada para sincronización asíncrona hacia Firebase Cloud Firestore.

## Patrón de Interfaz "Sucia-Friendly"
Diseño ergonómico Mobile-First adaptado al entorno de cocina. Emplea controles táctiles de gran escala (≥ 48x48 dp), alto contraste visual y selectores numéricos incrementales (+/-) para evitar el uso del teclado alfanumérico denso mientras las manos operan ingredientes.

## Comandos de Desarrollo
- `npm run dev`: Inicia el servidor de desarrollo.
- `npm test`: Ejecuta la suite de pruebas unitarias del dominio en Vitest.
- `npm run build`: Compila la aplicación con validación estricta de TypeScript.