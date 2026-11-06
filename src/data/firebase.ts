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

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firestore: Firestore = getFirestore(app);

export const COLECCIONES = {
  insumos: 'insumos',
  lotes_inventario: 'lotes_inventario',
  recetas: 'recetas',
  servicios_fijos: 'servicios_fijos',
  config_laboral: 'config_laboral',
} as const;