import { $, toast } from './utils.js';
import { initNav, initTheme, irAVista, onEnterView, onLeaveView, actualizarSyncPorConexion } from './ui.js';
import { state } from './storage.js';

import * as Registro from '../../modules/registro.js';
import * as Scanner from '../../modules/scanner.js';
import * as Estadisticas from '../../modules/estadisticas.js';
import * as Mochilas from '../../modules/mochilas.js';
import * as Github from '../../modules/github.js';

function initHome(){
  const el = $('view-home');
  function render(){
    const total = state.peregrinos.length;
    const asignados = state.peregrinos.filter(p => p.nombre).length;
    const mochilasActivas = state.mochilas.filter(m => !m.horaRetirada).length;
    el.innerHTML = `
      <div class="card" style="text-align:center; padding:22px 16px;">
        <div style="font-size:2rem; margin-bottom:6px;">⛪</div>
        <h2 style="font-size:1.15rem;">Camino a Luján</h2>
        <p class="muted">Control de peregrinos, paradas y mochilas — funciona sin conexión.</p>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="v">${total}</div><div class="l">peregrinos</div></div>
        <div class="stat-box"><div class="v">${asignados}</div><div class="l">con nombre asignado</div></div>
        <div class="stat-box"><div class="v">${mochilasActivas}</div><div class="l">mochilas guardadas</div></div>
        <div class="stat-box"><div class="v">${state.paradaActual ?? '–'}</div><div class="l">parada de este celular</div></div>
      </div>

      <div class="card">
        <h2>Accesos rápidos</h2>
        <button class="btn primary" data-go="escaneo">📷 Escanear</button>
        <button class="btn" data-go="registro">👥 Registro</button>
        <button class="btn" data-go="mochilas">🎒 Mochilas</button>
        <button class="btn" data-go="estadisticas">📊 Estadísticas</button>
      </div>
    `;
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => irAVista(b.dataset.go)));
  }
  render();
  onEnterView('home', render);
}

function initConfigNav(){
  $('btnConfig')?.addEventListener('click', () => irAVista('config'));
  $('btnVolverConfig')?.addEventListener('click', () => irAVista('home'));
}

function wireDetenerCamarasAlSalir(){
  onLeaveView('registro', () => Registro.detenerCamarasRegistro?.());
  onLeaveView('escaneo', () => Scanner.detenerCamaraEscaneo?.());
  onLeaveView('mochilas', () => Mochilas.detenerCamarasMochilas?.());
}

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {
        // si falla (ej. servido desde un origen sin https), la app sigue funcionando igual
      });
    });
  }
}

function init(){
  initNav();
  initTheme();
  initConfigNav();
  initHome();
  Github.init();
  Registro.init();
  Scanner.init();
  Estadisticas.init();
  Mochilas.init();
  wireDetenerCamarasAlSalir();
  actualizarSyncPorConexion();
  registerServiceWorker();
  irAVista('home');
}

document.addEventListener('DOMContentLoaded', init);
