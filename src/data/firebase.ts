// src/data/firebase.ts
// Réplica remota. Dexie es la fuente de verdad; Firestore solo recibe/entrega
// cambios cuando hay conexión (lo orquestará el futuro SyncService).

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBCGMdvx0Ctm17UYzwsVFVEJp-D_VB7AI8",
  authDomain: "gustodulce.firebaseapp.com",
  projectId: "gustodulce",
  storageBucket: "gustodulce.firebasestorage.app",
  messagingSenderId: "547817795796",
  appId: "1:547817795796:web:83c709dd2d825e66c6cb41"
};

// getApps() evita "Firebase App named '[DEFAULT]' already exists"
// cuando Vite recarga el módulo en caliente (HMR).
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// getFirestore usa caché en memoria por defecto. Es lo correcto aquí:
// activar la persistencia offline de Firestore duplicaría los datos que
// ya guarda Dexie en IndexedDB y crearía dos fuentes de verdad.
export const firestore: Firestore = getFirestore(app);

/** Nombres de colección remotos, idénticos a las tablas de Dexie. */
export const COLECCIONES = {
  insumos: 'insumos',
  lotes_inventario: 'lotes_inventario',
  recetas: 'recetas',
  servicios_fijos: 'servicios_fijos',
  config_laboral: 'config_laboral',
} as const;