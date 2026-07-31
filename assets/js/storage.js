// Capa de almacenamiento.
//
// - getSetting/setSetting: preferencias chicas y no sensibles (ej. tema claro/oscuro),
//   guardadas en localStorage. Esto es seguro acá porque la app se sirve como sitio
//   real (GitHub Pages), no como artifact embebido.
// - state: datos de la app en memoria (peregrinos, registros, mochilas). En esta
//   entrega vive solo en memoria, igual que en la v1. En una futura versión esto se
//   respalda automáticamente en IndexedDB para sobrevivir a que se cierre la app.

import { pad3 } from './utils.js';

export function getSetting(key, fallback){
  try{
    const raw = localStorage.getItem('cl_' + key);
    return raw === null ? fallback : JSON.parse(raw);
  }catch(e){ return fallback; }
}

export function setSetting(key, value){
  try{ localStorage.setItem('cl_' + key, JSON.stringify(value)); }
  catch(e){ /* almacenamiento no disponible: seguimos sin persistir la preferencia */ }
}

export const PREFIX = 'LUJAN-';

// Estado central en memoria. Los módulos de cada sección lo van poblando.
export const state = {
  peregrinos: [],        // {id, nombre, foto}
  fotosPendientesSubir: new Set(),
  registros: [],         // {peregrinoId, parada, ts}
  paradaActual: null,
  mochilas: [],          // {numero, foto, horaGuardada, horaRetirada}
  mochilasPendientesSubir: new Set(),
  peregrinosPorNumero: new Map(), // cache opcional para búsquedas rápidas por número (mochilas)
};

export function nextId(){
  let max = 0;
  state.peregrinos.forEach((p) => {
    const m = /(\d+)$/.exec(p.id);
    if(m) max = Math.max(max, parseInt(m[1], 10));
  });
  return PREFIX + pad3(max + 1);
}

export function normalizarNumero(raw){
  const num = (raw || '').replace(/\D/g, '');
  if(!num) return null;
  return PREFIX + pad3(parseInt(num, 10));
}

