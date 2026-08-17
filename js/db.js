// db.js — persistencia local con IndexedDB. Sin librerías.
//
// Estrategia: al arrancar se carga TODO en memoria y se trabaja contra un
// almacén en memoria; las escrituras se persisten al vuelo. Los datos de una
// persona son minúsculos (unos cientos de actividades, unos miles de registros
// al año), así que cabe de sobra y a cambio la interfaz responde al instante,
// sin esperas asíncronas en cada toque.
//
// Los nombres de almacén y de campo son los mismos que tendrán las entidades
// de SwiftData en la app nativa, para que migrar sea copiar.

const NOMBRE_BD = 'app-habitos';
const VERSION = 1;

export const ALMACENES = { ACTIVIDADES: 'actividades', REGISTROS: 'registros', AJUSTES: 'ajustes' };

let bd = null;

export function hayIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

export function abrir() {
  if (bd) return Promise.resolve(bd);
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION);

    peticion.onupgradeneeded = (evento) => {
      const db = evento.target.result;
      if (!db.objectStoreNames.contains(ALMACENES.ACTIVIDADES)) {
        db.createObjectStore(ALMACENES.ACTIVIDADES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ALMACENES.REGISTROS)) {
        const registros = db.createObjectStore(ALMACENES.REGISTROS, { keyPath: 'id' });
        registros.createIndex('porFecha', 'fecha');
        registros.createIndex('porActividad', 'actividadId');
      }
      if (!db.objectStoreNames.contains(ALMACENES.AJUSTES)) {
        db.createObjectStore(ALMACENES.AJUSTES, { keyPath: 'clave' });
      }
    };

    peticion.onsuccess = () => {
      bd = peticion.result;
      bd.onversionchange = () => { bd.close(); bd = null; };
      resolve(bd);
    };
    peticion.onerror = () => reject(peticion.error);
  });
}

function transaccion(almacen, modo = 'readonly') {
  return bd.transaction(almacen, modo).objectStore(almacen);
}

function promesa(peticion) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

export async function leerTodo(almacen) {
  await abrir();
  return promesa(transaccion(almacen).getAll());
}

export async function guardar(almacen, objeto) {
  await abrir();
  return promesa(transaccion(almacen, 'readwrite').put(objeto));
}

export async function guardarVarios(almacen, objetos) {
  await abrir();
  const tx = bd.transaction(almacen, 'readwrite');
  const store = tx.objectStore(almacen);
  for (const o of objetos) store.put(o);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function borrar(almacen, clave) {
  await abrir();
  return promesa(transaccion(almacen, 'readwrite').delete(clave));
}

export async function vaciarTodo() {
  await abrir();
  for (const almacen of Object.values(ALMACENES)) {
    await promesa(transaccion(almacen, 'readwrite').clear());
  }
}

export async function leerAjuste(clave, porDefecto = null) {
  await abrir();
  const fila = await promesa(transaccion(ALMACENES.AJUSTES).get(clave));
  return fila ? fila.valor : porDefecto;
}

export function guardarAjuste(clave, valor) {
  return guardar(ALMACENES.AJUSTES, { clave, valor });
}

/**
 * Copia de seguridad completa en un objeto plano. La Fase 2 traerá sync de
 * verdad; hasta entonces esto es la única red de seguridad que hay, así que
 * existe desde el primer día.
 */
export async function exportar() {
  const [actividades, registros] = await Promise.all([
    leerTodo(ALMACENES.ACTIVIDADES),
    leerTodo(ALMACENES.REGISTROS),
  ]);
  return { version: VERSION, exportadoEn: new Date().toISOString(), actividades, registros };
}

export async function importar(datos) {
  if (!datos || !Array.isArray(datos.actividades)) throw new Error('El archivo no tiene el formato esperado.');
  await vaciarTodo();
  await guardarVarios(ALMACENES.ACTIVIDADES, datos.actividades);
  await guardarVarios(ALMACENES.REGISTROS, datos.registros ?? []);
}
