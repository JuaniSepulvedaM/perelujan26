// Módulo de Estadísticas (Entrega 4): embudo por parada, tiempos promedio,
// tabla de detalle, faltantes, exportar CSV.

import { $, escapeHtml, fmtTime, fmtDuration, toast, downloadText, readFileAsJSON } from '../assets/js/utils.js';
import { state } from '../assets/js/storage.js';
import { ghConfig, ghBajarJSON } from './github.js';

let statsPeregrinos = [];
let statsRegistros = [];

export function init(){
  const el = document.getElementById('view-estadisticas');
  el.innerHTML = `
    <div class="card">
      <h2>🔄 Traer todo desde GitHub</h2>
      <p class="muted">Baja la lista de peregrinos y los registros de las 4 paradas que estén subidos. Necesita internet.</p>
      <button class="btn primary" id="btnGhTraerTodo">⬇️ Traer todo desde GitHub</button>
      <p class="muted" id="ghEstadoStats">Todavía no sincronizaste en esta sesión.</p>
    </div>

    <div class="card">
      <h2>...o usar los datos ya cargados / importar archivos</h2>
      <p class="muted">Si ya usaste Registro/Escaneo en este mismo celular, podés graficar directamente lo que ya está en memoria.</p>
      <button class="btn" id="btnUsarDatosLocales">Usar los datos de este celular</button>
      <div class="divider"></div>
      <button class="btn ghost" id="btnImportarListaStats">📂 Importar peregrinos.json</button>
      <input type="file" accept=".json" id="fileImportarListaStats" style="display:none;">
      <p class="muted" id="statsListaStatus">No importada todavía.</p>
      <button class="btn ghost" id="btnImportarRegistrosStats">📂 Importar registros_parada_*.json (varios a la vez)</button>
      <input type="file" accept=".json" id="fileImportarRegistrosStats" multiple style="display:none;">
      <div id="statsRegistrosStatus" class="muted" style="margin-top:8px;">Ninguno importado todavía.</div>
    </div>

    <div id="statsResultado" style="display:none;">
      <div class="card">
        <h2>Recorrido general</h2>
        <div id="funnelBars"></div>
      </div>

      <div class="card">
        <div class="stat-grid">
          <div class="stat-box"><div class="v" id="statTotal">0</div><div class="l">peregrinos</div></div>
          <div class="stat-box"><div class="v" id="statCompletaron">0</div><div class="l">completaron las 4</div></div>
          <div class="stat-box"><div class="v" id="statTiempoProm">–</div><div class="l">tiempo total promedio</div></div>
          <div class="stat-box"><div class="v" id="statTramoLento">–</div><div class="l">tramo más lento (prom.)</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Detalle por persona</h2>
        <div style="overflow-x:auto;"><table id="tablaDetalle" style="width:100%; border-collapse:collapse; font-size:.82rem;"></table></div>
        <button class="btn" id="btnExportarCSV">💾 Exportar tabla como CSV</button>
      </div>

      <div class="card">
        <h2>Faltantes por parada</h2>
        <div id="faltantesPorParada"></div>
      </div>
    </div>
  `;

  $('btnGhTraerTodo').addEventListener('click', traerTodoDesdeGithub);
  $('btnUsarDatosLocales').addEventListener('click', () => {
    statsPeregrinos = state.peregrinos.filter((p) => p.nombre);
    statsRegistros = [...state.registros];
    $('statsListaStatus').textContent = `Usando ${statsPeregrinos.length} peregrinos de este celular.`;
    $('statsRegistrosStatus').textContent = `Usando ${statsRegistros.length} registros de este celular.`;
    tryRenderStats();
  });
  $('btnImportarListaStats').addEventListener('click', () => $('fileImportarListaStats').click());
  $('fileImportarListaStats').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    try{
      const data = await readFileAsJSON(f);
      statsPeregrinos = (data.peregrinos || []).filter((p) => p.nombre);
      $('statsListaStatus').textContent = `Importada: ${statsPeregrinos.length} peregrinos.`;
      tryRenderStats();
    }catch(err){ toast('Archivo inválido'); }
  });
  $('btnImportarRegistrosStats').addEventListener('click', () => $('fileImportarRegistrosStats').click());
  $('fileImportarRegistrosStats').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    let resumen = [];
    for(const f of files){
      try{
        const data = await readFileAsJSON(f);
        const regs = data.registros || [];
        regs.forEach((r) => statsRegistros.push(r));
        resumen.push(`${f.name}: ${regs.length} registros (Parada ${data.parada})`);
      }catch(err){ resumen.push(`${f.name}: ERROR, archivo inválido`); }
    }
    $('statsRegistrosStatus').innerHTML = resumen.map((r) => `• ${r}`).join('<br>') + `<br><b>Total acumulado: ${statsRegistros.length} registros.</b>`;
    tryRenderStats();
  });
}

async function traerTodoDesdeGithub(){
  const { repo, branch, file } = ghConfig();
  if(!repo){ toast('Repositorio no configurado en ⚙️ Configuración'); return; }
  $('ghEstadoStats').textContent = 'Bajando…';
  let resumen = [];
  try{
    const dataPeregrinos = await ghBajarJSON(repo, branch, file);
    statsPeregrinos = (dataPeregrinos.peregrinos || []).filter((p) => p.nombre);
    $('statsListaStatus').textContent = `Importada: ${statsPeregrinos.length} peregrinos.`;
    resumen.push(`peregrinos: ${statsPeregrinos.length} personas`);
  }catch(err){
    $('ghEstadoStats').textContent = 'No se pudo bajar la lista de peregrinos (¿hay conexión?).';
    toast('Error al bajar de GitHub');
    return;
  }
  statsRegistros = [];
  for(let i = 1; i <= 4; i++){
    const nombreArchivo = `registros_parada_${i}.json`;
    try{
      const data = await ghBajarJSON(repo, branch, nombreArchivo);
      (data.registros || []).forEach((r) => statsRegistros.push(r));
      resumen.push(`${nombreArchivo}: ${(data.registros || []).length} registros`);
    }catch(err){ resumen.push(`${nombreArchivo}: no encontrado todavía`); }
  }
  $('statsRegistrosStatus').innerHTML = resumen.slice(1).map((r) => '• ' + r).join('<br>') + `<br><b>Total acumulado: ${statsRegistros.length} registros.</b>`;
  $('ghEstadoStats').textContent = 'Traído correctamente a las ' + fmtTime(Date.now()) + '.';
  toast('Datos actualizados desde GitHub');
  tryRenderStats();
}

function tryRenderStats(){
  if(statsPeregrinos.length === 0 || statsRegistros.length === 0) return;
  $('statsResultado').style.display = 'block';

  const byPerson = {};
  statsPeregrinos.forEach((p) => byPerson[p.id] = { p, t: { 1: null, 2: null, 3: null, 4: null } });
  statsRegistros.forEach((r) => {
    if(byPerson[r.peregrinoId]){
      const cur = byPerson[r.peregrinoId].t[r.parada];
      if(cur == null || r.ts > cur) byPerson[r.peregrinoId].t[r.parada] = r.ts;
    }
  });
  const rows = Object.values(byPerson);
  const total = rows.length;

  // embudo con barras
  const funnel = $('funnelBars');
  funnel.innerHTML = [1,2,3,4].map((i) => {
    const pasaron = rows.filter((r) => r.t[i] != null).length;
    const pct = total ? Math.round((pasaron / total) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label"><span>Parada ${i}</span><span>${pasaron}/${total} · ${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
    </div>`;
  }).join('');

  const completaron = rows.filter((r) => r.t[1] && r.t[2] && r.t[3] && r.t[4]).length;
  $('statTotal').textContent = total;
  $('statCompletaron').textContent = completaron;

  const totales = rows.filter((r) => r.t[1] && r.t[4]).map((r) => r.t[4] - r.t[1]);
  const promTotal = totales.length ? totales.reduce((a, b) => a + b, 0) / totales.length : null;
  $('statTiempoProm').textContent = fmtDuration(promTotal);

  const tramos = [[1,2],[2,3],[3,4]].map(([a,b]) => {
    const vals = rows.filter((r) => r.t[a] && r.t[b]).map((r) => r.t[b] - r.t[a]);
    const prom = vals.length ? vals.reduce((x,y)=>x+y,0)/vals.length : null;
    return { a, b, prom };
  });
  const peor = tramos.filter((t) => t.prom != null).sort((x,y) => y.prom - x.prom)[0];
  $('statTramoLento').textContent = peor ? `P${peor.a}→P${peor.b} (${fmtDuration(peor.prom)})` : '–';

  const tabla = $('tablaDetalle');
  const head = `<tr><th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">Nombre</th><th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">ID</th>${[1,2,3,4].map(i=>`<th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">P${i}</th>`).join('')}<th style="text-align:left;padding:8px 6px;border-bottom:1px solid var(--outline);">P1→P4</th></tr>`;
  const body = rows.map((r) => {
    const cells = [1,2,3,4].map((i) => r.t[i] != null
      ? `<td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${fmtTime(r.t[i])}</td>`
      : `<td style="padding:8px 6px;border-bottom:1px solid var(--outline);color:var(--danger);">falta</td>`).join('');
    const totalTiempo = (r.t[1] && r.t[4]) ? fmtDuration(r.t[4] - r.t[1]) : '–';
    return `<tr><td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${escapeHtml(r.p.nombre)}</td><td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${r.p.id}</td>${cells}<td style="padding:8px 6px;border-bottom:1px solid var(--outline);">${totalTiempo}</td></tr>`;
  }).join('');
  tabla.innerHTML = head + body;

  const faltWrap = $('faltantesPorParada'); faltWrap.innerHTML = '';
  for(let i=1;i<=4;i++){
    const falt = rows.filter((r) => r.t[i] == null);
    const box = document.createElement('div');
    box.innerHTML = `<h3 style="font-size:.9rem; margin:10px 0 6px;">Parada ${i} — faltan ${falt.length}</h3>` +
      (falt.length ? `<div class="muted">${falt.map((f) => escapeHtml(f.p.nombre)).join(', ')}</div>` : `<div class="muted">Pasaron todos ✅</div>`);
    faltWrap.appendChild(box);
  }

  $('btnExportarCSV').onclick = () => {
    let csv = 'Nombre,ID,Parada1,Parada2,Parada3,Parada4,TiempoTotal\n';
    rows.forEach((r) => {
      const c = [1,2,3,4].map((i) => r.t[i] != null ? new Date(r.t[i]).toLocaleString('es-AR') : 'FALTA');
      const totalTiempo = (r.t[1] && r.t[4]) ? fmtDuration(r.t[4] - r.t[1]) : '-';
      csv += `"${r.p.nombre}","${r.p.id}","${c[0]}","${c[1]}","${c[2]}","${c[3]}","${totalTiempo}"\n`;
    });
    downloadText(csv, 'estadisticas_peregrinacion.csv', 'text/csv');
  };
}
