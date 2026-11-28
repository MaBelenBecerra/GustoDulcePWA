import { redondear, SUELDO_MINIMO_BS, sumarDias } from '../domain';
import type { ConfiguracionCostos, CotizacionGuardada, FechaISO, Insumo, Lote, MetricasCuenta, Receta, UnidadBase } from '../domain';
import type { Semilla } from '../aplicacion/servicio';

function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type FilaInsumo = [id: string, nombre: string, unidad: UnidadBase, presentacion: number, precio: number, merma: number, vidaDias: number];

const FILAS_INSUMOS: readonly FilaInsumo[] = [
  ['harina', 'Harina de trigo', 'g', 1000, 9, 0.02, 120],
  ['azucar', 'Azúcar blanca', 'g', 1000, 8, 0, 365],
  ['huevo', 'Huevo', 'u', 30, 32, 0.03, 21],
  ['mantequilla', 'Mantequilla', 'g', 200, 18, 0.02, 45],
  ['leche', 'Leche entera', 'ml', 1000, 8, 0, 7],
  ['cacao', 'Cacao en polvo', 'g', 250, 25, 0, 240],
  ['polvo', 'Polvo de hornear', 'g', 100, 6, 0, 365],
  ['margarina', 'Margarina', 'g', 500, 16, 0.01, 90],
  ['azucar-impalpable', 'Azúcar impalpable', 'g', 500, 10, 0.01, 365],
  ['azucar-morena', 'Azúcar morena', 'g', 1000, 11, 0, 365],
  ['maicena', 'Maicena', 'g', 400, 9, 0, 365],
  ['bicarbonato', 'Bicarbonato de sodio', 'g', 100, 4, 0, 365],
  ['vainilla', 'Esencia de vainilla', 'ml', 120, 12, 0, 365],
  ['canela', 'Canela molida', 'g', 50, 7, 0, 365],
  ['sal', 'Sal fina', 'g', 1000, 3, 0, 730],
  ['aceite', 'Aceite vegetal', 'ml', 900, 15, 0.01, 180],
  ['leche-condensada', 'Leche condensada', 'g', 395, 14, 0.02, 180],
  ['leche-evaporada', 'Leche evaporada', 'g', 410, 12, 0.01, 180],
  ['crema-leche', 'Crema de leche', 'ml', 1000, 38, 0.02, 15],
  ['queso-crema', 'Queso crema', 'g', 400, 30, 0.02, 25],
  ['dulce-leche', 'Dulce de leche', 'g', 1000, 32, 0.02, 90],
  ['chocolate-cobertura', 'Chocolate de cobertura', 'g', 1000, 75, 0.02, 270],
  ['chips-chocolate', 'Chips de chocolate', 'g', 250, 20, 0, 270],
  ['coco', 'Coco rallado', 'g', 250, 13, 0, 120],
  ['nueces', 'Nueces', 'g', 250, 35, 0.03, 120],
  ['almendras', 'Almendras', 'g', 250, 40, 0.02, 180],
  ['pasas', 'Pasas de uva', 'g', 250, 12, 0, 180],
  ['mani', 'Maní tostado', 'g', 500, 18, 0.02, 120],
  ['frutilla', 'Frutilla fresca', 'g', 1000, 25, 0.15, 4],
  ['durazno-almibar', 'Durazno en almíbar', 'g', 820, 22, 0.35, 365],
  ['limon', 'Limón', 'u', 10, 5, 0.1, 15],
  ['naranja', 'Naranja', 'u', 10, 8, 0.1, 15],
  ['platano', 'Plátano', 'u', 12, 6, 0.2, 6],
  ['zanahoria', 'Zanahoria', 'g', 1000, 6, 0.12, 20],
  ['manzana', 'Manzana', 'u', 6, 9, 0.15, 25],
  ['avena', 'Avena en hojuelas', 'g', 500, 9, 0, 240],
  ['gelatina', 'Gelatina sin sabor', 'g', 30, 6, 0, 365],
  ['fondant', 'Fondant blanco', 'g', 1000, 45, 0.08, 180],
  ['colorante', 'Colorante en gel', 'ml', 30, 15, 0.05, 365],
  ['galletas-maria', 'Galletas María', 'g', 400, 9, 0.02, 180],
];

export const INSUMOS_PRUEBA: readonly Insumo[] = FILAS_INSUMOS.map(([id, nombre, unidad, cantidad, precio, merma]) => ({
  id,
  nombre,
  unidad,
  presentacion: { cantidad, precio },
  merma,
}));

type Ing = [insumoId: string, cantidad: number];
type FilaReceta = [id: string, nombre: string, porciones: number, minElab: number, minHorno: number, ingredientes: Ing[]];

const FILAS_RECETAS: readonly FilaReceta[] = [
  ['torta-chocolate', 'Torta de chocolate', 12, 50, 45, [['harina', 300], ['azucar', 250], ['huevo', 4], ['mantequilla', 150], ['leche', 240], ['cacao', 60], ['polvo', 10]]],
  ['brownies', 'Brownies', 16, 30, 30, [['harina', 120], ['azucar', 200], ['huevo', 3], ['mantequilla', 180], ['cacao', 80]]],
  ['bizcochuelo', 'Bizcochuelo de vainilla', 10, 25, 35, [['harina', 250], ['azucar', 200], ['huevo', 5], ['leche', 120], ['polvo', 8], ['vainilla', 5]]],
  ['tres-leches', 'Torta tres leches', 15, 60, 40, [['harina', 250], ['azucar', 250], ['huevo', 6], ['leche', 400], ['leche-condensada', 395], ['leche-evaporada', 410], ['crema-leche', 250], ['vainilla', 5], ['polvo', 8]]],
  ['selva-negra', 'Torta selva negra', 16, 90, 45, [['harina', 280], ['azucar', 300], ['huevo', 6], ['cacao', 70], ['crema-leche', 500], ['chocolate-cobertura', 150], ['durazno-almibar', 300], ['mantequilla', 100]]],
  ['cheesecake-frutilla', 'Cheesecake de frutilla', 12, 45, 60, [['galletas-maria', 250], ['mantequilla', 100], ['queso-crema', 600], ['azucar', 180], ['huevo', 3], ['crema-leche', 200], ['frutilla', 300]]],
  ['pie-limon', 'Pie de limón', 10, 50, 25, [['harina', 220], ['mantequilla', 120], ['leche-condensada', 395], ['limon', 5], ['huevo', 4], ['azucar', 120]]],
  ['alfajores', 'Alfajores de maicena', 30, 70, 12, [['maicena', 300], ['harina', 200], ['mantequilla', 200], ['azucar-impalpable', 120], ['huevo', 3], ['dulce-leche', 400], ['coco', 80], ['polvo', 6]]],
  ['cupcakes-vainilla', 'Cupcakes de vainilla', 12, 40, 22, [['harina', 200], ['azucar', 180], ['huevo', 3], ['mantequilla', 120], ['leche', 120], ['vainilla', 5], ['polvo', 8], ['azucar-impalpable', 250]]],
  ['cupcakes-chocolate', 'Cupcakes de chocolate', 12, 40, 22, [['harina', 180], ['azucar', 200], ['huevo', 3], ['aceite', 100], ['leche', 150], ['cacao', 50], ['polvo', 8], ['chocolate-cobertura', 100]]],
  ['galletas-chips', 'Galletas con chips', 24, 30, 12, [['harina', 280], ['mantequilla', 170], ['azucar-morena', 150], ['azucar', 80], ['huevo', 2], ['chips-chocolate', 200], ['bicarbonato', 4], ['sal', 2]]],
  ['galletas-avena', 'Galletas de avena y pasas', 24, 30, 14, [['avena', 250], ['harina', 150], ['mantequilla', 150], ['azucar-morena', 160], ['huevo', 2], ['pasas', 120], ['canela', 4], ['bicarbonato', 4]]],
  ['brazo-gitano', 'Brazo gitano', 10, 45, 12, [['harina', 120], ['azucar', 150], ['huevo', 5], ['dulce-leche', 350], ['azucar-impalpable', 30]]],
  ['budin-naranja', 'Budín de naranja', 10, 25, 50, [['harina', 280], ['azucar', 220], ['huevo', 4], ['aceite', 120], ['naranja', 3], ['polvo', 10]]],
  ['queque-platano', 'Queque de plátano', 10, 25, 55, [['harina', 250], ['azucar-morena', 180], ['huevo', 2], ['platano', 4], ['aceite', 100], ['bicarbonato', 5], ['nueces', 80], ['canela', 3]]],
  ['torta-zanahoria', 'Torta de zanahoria', 14, 45, 50, [['harina', 280], ['azucar-morena', 250], ['huevo', 4], ['aceite', 200], ['zanahoria', 350], ['nueces', 100], ['canela', 6], ['polvo', 8], ['queso-crema', 300], ['azucar-impalpable', 150]]],
  ['rollos-canela', 'Rollos de canela', 12, 60, 25, [['harina', 500], ['leche', 250], ['mantequilla', 120], ['azucar-morena', 150], ['huevo', 2], ['canela', 15], ['sal', 5], ['azucar-impalpable', 150]]],
  ['pie-manzana', 'Pie de manzana', 10, 55, 45, [['harina', 300], ['mantequilla', 180], ['manzana', 6], ['azucar', 150], ['canela', 6], ['huevo', 1]]],
  ['tartaleta-frutilla', 'Tartaleta de frutilla', 10, 50, 25, [['harina', 220], ['mantequilla', 120], ['azucar', 140], ['huevo', 3], ['leche', 400], ['maicena', 40], ['frutilla', 400], ['gelatina', 10]]],
  ['mousse-chocolate', 'Mousse de chocolate', 10, 40, 0, [['chocolate-cobertura', 250], ['crema-leche', 400], ['huevo', 4], ['azucar', 80], ['gelatina', 8]]],
  ['flan', 'Flan casero', 8, 25, 50, [['leche', 500], ['leche-condensada', 395], ['huevo', 5], ['azucar', 150], ['vainilla', 5]]],
  ['torta-fondant', 'Torta de cumpleaños con fondant', 25, 150, 50, [['harina', 500], ['azucar', 450], ['huevo', 9], ['mantequilla', 300], ['leche', 300], ['polvo', 15], ['fondant', 800], ['colorante', 6], ['dulce-leche', 500]]],
  ['marquesa', 'Marquesa de chocolate', 12, 40, 0, [['galletas-maria', 400], ['chocolate-cobertura', 200], ['mantequilla', 150], ['crema-leche', 300], ['huevo', 3], ['azucar', 100]]],
  ['torta-coco', 'Torta de coco', 12, 40, 45, [['harina', 250], ['azucar', 220], ['huevo', 4], ['coco', 150], ['leche-condensada', 395], ['mantequilla', 120], ['polvo', 8]]],
  ['muffins-arandano', 'Muffins de avena y plátano', 12, 25, 22, [['avena', 150], ['harina', 150], ['platano', 3], ['azucar-morena', 120], ['huevo', 2], ['aceite', 80], ['polvo', 8]]],
  ['torta-almendras', 'Torta de almendras', 12, 50, 45, [['almendras', 200], ['harina', 150], ['azucar', 200], ['huevo', 5], ['mantequilla', 150], ['vainilla', 5]]],
  ['turron-mani', 'Turrón de maní', 20, 45, 0, [['mani', 400], ['azucar', 400], ['huevo', 2], ['vainilla', 5]]],
  ['pionono-crema', 'Pionono de crema y durazno', 10, 45, 12, [['harina', 120], ['azucar', 150], ['huevo', 5], ['crema-leche', 300], ['durazno-almibar', 400]]],
  ['galletas-decoradas', 'Galletas decoradas', 30, 120, 12, [['harina', 450], ['mantequilla', 220], ['azucar-impalpable', 400], ['huevo', 3], ['vainilla', 5], ['colorante', 6]]],
  ['torta-dulce-leche', 'Torta de dulce de leche', 14, 60, 40, [['harina', 280], ['azucar', 250], ['huevo', 5], ['mantequilla', 150], ['leche', 200], ['dulce-leche', 600], ['nueces', 100], ['polvo', 10]]],
];

export const RECETAS_PRUEBA: readonly Receta[] = FILAS_RECETAS.map(([id, nombre, porciones, minutosElaboracion, minutosHorneado, ingredientes]) => ({
  id,
  nombre,
  porciones,
  minutosElaboracion,
  minutosHorneado,
  ingredientes: ingredientes.map(([insumoId, cantidad]) => ({ insumoId, cantidad })),
}));

export const CONFIGURACION_PRUEBA: ConfiguracionCostos = {
  sueldoMensual: SUELDO_MINIMO_BS,
  horasTrabajoMes: 120,
  servicios: { luz: 180, agua: 60, gas: 45 },
};

export function crearLotesPrueba(hoy: FechaISO): Lote[] {
  const azar = aleatorio(2026);
  const lotes: Lote[] = [];
  FILAS_INSUMOS.forEach(([insumoId, , , presentacion, precio, , vida], indice) => {
    const compras = indice % 3 === 0 ? 3 : 2;
    for (let n = 0; n < compras; n++) {
      const hace = n === 0 ? Math.min(vida + 2, 20 + Math.floor(azar() * 40)) : Math.floor(azar() * 6);
      const presentaciones = 2 + Math.floor(azar() * 4);
      const variacion = 0.92 + azar() * 0.16;
      const cantidad = presentacion * presentaciones;
      const vence = n === 0 ? vida - hace : vida - hace + Math.floor(azar() * 5);
      lotes.push({
        id: `L-p-${insumoId}-${n + 1}`,
        insumoId,
        cantidadInicial: cantidad,
        cantidadDisponible: cantidad,
        costoUnitario: redondear((precio * variacion) / presentacion, 6),
        fechaIngreso: sumarDias(hoy, -hace),
        fechaVencimiento: sumarDias(hoy, Math.max(vence, -10)),
      });
    }
  });
  return lotes.filter((l) => l.fechaVencimiento >= l.fechaIngreso);
}

const CLIENTAS = [
  'Doña Rosa', 'Carla M.', 'Mariela', 'Sra. Justiniano', 'Paola V.', 'Fernanda', 'Don Hugo', 'Ximena',
  'Colegio La Salle', 'Andrea R.', 'Familia Suárez', 'Lucía', 'Cumpleaños Mateo', 'Gabriela', 'Oficina Banco',
];

export function crearCotizacionesPrueba(hoy: FechaISO, cantidad = 35): CotizacionGuardada[] {
  const azar = aleatorio(591);
  const pesos = RECETAS_PRUEBA.map((_, i) => 1 / (1 + i * 0.35));
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const elegir = () => {
    let x = azar() * totalPeso;
    for (let i = 0; i < pesos.length; i++) {
      x -= pesos[i]!;
      if (x <= 0) return RECETAS_PRUEBA[i]!;
    }
    return RECETAS_PRUEBA[0]!;
  };
  return Array.from({ length: cantidad }, (_, n) => {
    const receta = elegir();
    const porciones = Math.max(1, Math.round(receta.porciones * (0.5 + azar() * 1.5)));
    const precioPorcion = 6 + Math.floor(azar() * 20) / 2;
    return {
      id: `q-p-${String(n + 1).padStart(3, '0')}`,
      recetaId: receta.id,
      porciones,
      precioTotal: redondear(porciones * precioPorcion, 2),
      cliente: CLIENTAS[Math.floor(azar() * CLIENTAS.length)]!,
      fecha: sumarDias(hoy, -Math.floor(azar() * 60)),
    };
  });
}

export const PRODUCCIONES_PRUEBA: readonly { recetaId: string; veces: number }[] = [
  { recetaId: 'torta-chocolate', veces: 2 },
  { recetaId: 'tres-leches', veces: 1 },
  { recetaId: 'brownies', veces: 2 },
  { recetaId: 'alfajores', veces: 1 },
  { recetaId: 'cupcakes-vainilla', veces: 1 },
  { recetaId: 'galletas-chips', veces: 2 },
  { recetaId: 'bizcochuelo', veces: 1 },
  { recetaId: 'cheesecake-frutilla', veces: 1 },
  { recetaId: 'budin-naranja', veces: 1 },
  { recetaId: 'torta-zanahoria', veces: 1 },
  { recetaId: 'flan', veces: 2 },
  { recetaId: 'galletas-avena', veces: 1 },
  { recetaId: 'selva-negra', veces: 1 },
  { recetaId: 'pie-limon', veces: 1 },
  { recetaId: 'rollos-canela', veces: 1 },
];

export function crearDatosPrueba(hoy: FechaISO): Semilla {
  return {
    insumos: INSUMOS_PRUEBA,
    recetas: RECETAS_PRUEBA,
    configuracion: CONFIGURACION_PRUEBA,
    lotes: crearLotesPrueba(hoy),
    cotizaciones: crearCotizacionesPrueba(hoy),
    producciones: PRODUCCIONES_PRUEBA,
  };
}

export function crearPerfilesDemo(ahora: number): {
  uid: string;
  nombre: string;
  correo: string;
  rol: 'repostera';
  metricas: MetricasCuenta;
  ultimaActividad: number;
}[] {
  const azar = aleatorio(77);
  const nombres = ['Dulces Rosita', 'Tortas Mariela', 'La Casa del Alfajor', 'Pastelería Ximena', 'Delicias Paola', 'Cupcakes Fer'];
  return nombres.map((nombre, i) => {
    const insumos = 8 + Math.floor(azar() * 30);
    const recetas = 2 + Math.floor(azar() * 20);
    const cotizaciones = Math.floor(azar() * 45);
    return {
      uid: `demo-${i + 1}`,
      nombre,
      correo: `demo${i + 1}@gustodulce.test`,
      rol: 'repostera',
      metricas: {
        insumos,
        recetas,
        lotesActivos: insumos + Math.floor(azar() * insumos),
        producciones: Math.floor(azar() * 30),
        cotizaciones,
        montoCotizado: redondear(cotizaciones * (80 + azar() * 120), 2),
        valorInventario: redondear(200 + azar() * 1500, 2),
        mermaAcumulada: redondear(azar() * 120, 2),
        insumosPorVencer: Math.floor(azar() * 5),
        registros: insumos * 3 + recetas + cotizaciones,
      },
      ultimaActividad: ahora - Math.floor(azar() * 14) * 86_400_000,
    };
  });
}
