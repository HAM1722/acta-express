// dashboard.js - Análisis y reportes del Excel maestro
imported();
async function imported(){ /* noop to hint module */ }

// ===== UTILIDADES =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Estado global
const state = {
  data: {
    actas: [],
    compromisos: [],
    filtrada: {
      actas: [],
      compromisos: []
    }
  },
  charts: {},
  filtros: {
    fechaDesde: null,
    fechaHasta: null,
    motivo: '',
    ejecutivo: ''
  }
};

// IndexedDB
let db;
const DB_NAME = 'acta_express_db';
const DB_STORE = 'actas';

// ===== INICIALIZACIÓN =====
init();

async function init(){
  try{
    await idbOpen();
    bindUI();
    setupDateFilters();
    // Cargar datos automáticamente
    await loadDataFromIndexedDB();
  }catch(err){
    console.error('Error en init:', err);
    $('#estadoDatos').textContent = '❌ Error inicializando dashboard: ' + err.message;
  }
}

function bindUI(){
  $('#btnCargarDatos').addEventListener('click', loadDataFromIndexedDB);
  $('#btnGenerarReporte').addEventListener('click', generarReportePDF);
  $('#btnExportarExcelMaestro').addEventListener('click', exportarExcelMaestro);
  $('#btnDebug').addEventListener('click', debugInfo);
  $('#btnAplicarFiltros').addEventListener('click', aplicarFiltros);
  $('#btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
  $('#btnBorrarTodas').addEventListener('click', borrarTodasActas);
}

// ===== IndexedDB =====
function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(DB_STORE)){
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=>{ db = req.result; resolve(); };
    req.onerror = ()=> reject(req.error);
  });
}

function idbAll(){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}

function idbClear(){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,'readwrite');
    const req = tx.objectStore(DB_STORE).clear();
    req.onsuccess=()=>resolve();
    req.onerror=()=>reject(req.error);
  });
}

function setupDateFilters(){
  // Fecha desde: hace 3 meses
  const hace3Meses = new Date();
  hace3Meses.setMonth(hace3Meses.getMonth() - 3);
  $('#filtroFechaDesde').value = hace3Meses.toISOString().split('T')[0];
  
  // Fecha hasta: hoy
  $('#filtroFechaHasta').value = new Date().toISOString().split('T')[0];
}

// ===== CARGA DESDE INDEXEDDB =====
async function loadDataFromIndexedDB(){
  try{
    $('#estadoDatos').textContent = '📖 Cargando datos del historial...';
    
    console.log('Intentando cargar datos de IndexedDB...');
    const actasRaw = await idbAll();
    console.log('Datos cargados:', actasRaw);
    
    if(actasRaw.length === 0){
      $('#estadoDatos').textContent = '⚠️ No hay actas en el historial. Ve a la página principal, genera algunas actas y vuelve aquí.';
      return;
    }
    
    // Convertir formato de IndexedDB al formato esperado por el dashboard
    // Compatible con formato nuevo y formato antiguo
    state.data.actas = actasRaw.map(acta => {
      // Detectar si es formato nuevo o antiguo
      const isNewFormat = acta.contacto && acta.temasTratados;
      
      if(isNewFormat) {
        // Formato nuevo - fidelización Emcali
        return {
          id_acta: acta.id,
          fecha_local: acta.visita?.fecha_local || '',
          fecha_utc: acta.visita?.fecha_utc || '',
          ejecutivo_nombre: acta.ejecutivo?.nombre || '',
          ejecutivo_correo: acta.ejecutivo?.correo || '',
          zona: acta.ubicacion?.zona || '',
          barrio: acta.ubicacion?.barrio || '',
          direccion: acta.ubicacion?.direccion || '',
          numero_contrato: acta.cliente?.numeroContrato || '',
          cliente_nit: acta.cliente?.nit || '',
          actividad_economica: acta.cliente?.actividadEconomica || '',
          exencion_contribucion: acta.cliente?.exencionContribucion || '',
          contacto_nombre: acta.contacto?.nombre || '',
          contacto_cargo: acta.contacto?.cargo || '',
          contacto_correo: acta.contacto?.correo || '',
          contacto_celular: acta.contacto?.celular || '',
          tema_energia_eficiente: acta.temasTratados?.energiaEficiente ? 'Sí' : 'No',
          desc_energia_eficiente: acta.temasTratados?.descEnergiaEficiente || '',
          tema_conexion_emcali: acta.temasTratados?.conexionEmcali ? 'Sí' : 'No',
          desc_conexion_emcali: acta.temasTratados?.descConexionEmcali || '',
          tema_etiqueta_retiq: acta.temasTratados?.etiquetaRetiq ? 'Sí' : 'No',
          desc_etiqueta_retiq: acta.temasTratados?.descEtiquetaRetiq || '',
          tema_ahorro_energia: acta.temasTratados?.ahorroEnergia ? 'Sí' : 'No',
          desc_ahorro_energia: acta.temasTratados?.descAhorroEnergia || '',
          tema_consumo_energia: acta.temasTratados?.consumoEnergia ? 'Sí' : 'No',
          desc_consumo_energia: acta.temasTratados?.descConsumoEnergia || '',
          incidencias_variaciones: acta.incidencias?.variaciones || '',
          incidencias_variaciones_cant: acta.incidencias?.variacionesCant || '',
          incidencias_cortes: acta.incidencias?.cortes || '',
          incidencias_cortes_cant: acta.incidencias?.cortesCant || '',
          observaciones: acta.observaciones || '',
          firmante_nombre: acta.firma?.nombre || '',
          geo_lat: acta.visita?.geo?.lat || '',
          geo_lng: acta.visita?.geo?.lng || '',
          hash_sha256: acta.sello?.hash_sha256 || '',
          pdf_filename: acta.archivos?.pdf_filename || '',
          formato: 'nuevo'
        };
      } else {
        // Formato antiguo - compatibilidad
        return {
          id_acta: acta.id,
          fecha_local: acta.visita?.fecha_local || '',
          fecha_utc: acta.visita?.fecha_utc || '',
          ejecutivo_nombre: acta.ejecutivo?.nombre || '',
          ejecutivo_correo: acta.ejecutivo?.correo || '',
          zona: '',
          barrio: '',
          direccion: '',
          numero_contrato: '',
          cliente_nit: acta.cliente?.nit || '',
          actividad_economica: '',
          exencion_contribucion: '',
          contacto_nombre: acta.cliente?.contacto || 'Sin contacto',
          contacto_cargo: '',
          contacto_correo: acta.cliente?.email || '',
          contacto_celular: '',
          tema_energia_eficiente: 'No',
          desc_energia_eficiente: '',
          tema_conexion_emcali: 'No',
          desc_conexion_emcali: '',
          tema_etiqueta_retiq: 'No',
          desc_etiqueta_retiq: '',
          tema_ahorro_energia: 'No',
          desc_ahorro_energia: '',
          tema_consumo_energia: 'No',
          desc_consumo_energia: '',
          incidencias_variaciones: '',
          incidencias_variaciones_cant: '',
          incidencias_cortes: '',
          incidencias_cortes_cant: '',
          observaciones: '',
          firmante_nombre: acta.firma?.nombre || '',
          geo_lat: acta.visita?.geo?.lat || '',
          geo_lng: acta.visita?.geo?.lng || '',
          hash_sha256: acta.sello?.hash_sha256 || '',
          pdf_filename: acta.archivos?.pdf_filename || '',
          formato: 'antiguo'
        };
      }
    });
    
    // Crear compromisos expandidos
    state.data.compromisos = [];
    actasRaw.forEach(acta => {
      (acta.contenido?.compromisos || []).forEach(comp => {
        state.data.compromisos.push({
          id_acta: acta.id,
          compromiso: comp.texto || '',
          fecha_compromiso: comp.fecha || '',
          estado: 'pendiente' // Por defecto
        });
      });
    });

    // Contar formatos
    const nuevas = state.data.actas.filter(a => a.formato === 'nuevo').length;
    const antiguas = state.data.actas.filter(a => a.formato === 'antiguo').length;
    
    $('#estadoDatos').textContent = `✅ Cargadas ${state.data.actas.length} actas (${nuevas} nuevas, ${antiguas} antiguas) y ${state.data.compromisos.length} compromisos`;
    
    // Aplicar filtros iniciales
    aplicarFiltros();
    
    console.log('Datos procesados:', state.data.actas.length, 'actas,', state.data.compromisos.length, 'compromisos');
    
    // Mostrar interfaz
    mostrarDashboard();
    
    // Generar gráficos
    generarGraficos();
    
    // Llenar filtros
    llenarFiltros();
    
    // Llenar tablas
    llenarTablas();
    
    $('#btnGenerarReporte').disabled = false;
    
  }catch(err){
    console.error(err);
    $('#estadoDatos').textContent = `❌ Error: ${err.message}`;
    toast('Error cargando datos');
  }
}

function mostrarDashboard(){
  console.log('Mostrando dashboard...');
  
  const elementos = ['#resumenGeneral', '#graficos', '#tablas', '#filtros'];
  elementos.forEach(selector => {
    const el = $(selector);
    if(el) {
      el.classList.remove('hidden');
      console.log('Mostrado:', selector);
    } else {
      console.error('Elemento no encontrado:', selector);
    }
  });
}

// ===== ANÁLISIS Y ESTADÍSTICAS =====
function calcularResumen(){
  const actas = state.data.filtrada.actas;
  
  // Total actas
  $('#totalActas').textContent = actas.length;
  
  // Zonas únicas
  const zonasUnicas = new Set(actas.map(a => a.zona).filter(Boolean));
  $('#totalCompromisos').textContent = zonasUnicas.size;
  
  // Contactos únicos
  const contactosUnicos = new Set(actas.map(a => a.contacto_nombre).filter(Boolean));
  $('#clientesUnicos').textContent = contactosUnicos.size;
  
  // Promedio de temas tratados por acta
  let totalTemas = 0;
  actas.forEach(acta => {
    if(acta.tema_energia_eficiente === 'Sí') totalTemas++;
    if(acta.tema_conexion_emcali === 'Sí') totalTemas++;
    if(acta.tema_etiqueta_retiq === 'Sí') totalTemas++;
    if(acta.tema_ahorro_energia === 'Sí') totalTemas++;
    if(acta.tema_consumo_energia === 'Sí') totalTemas++;
  });
  const promedio = actas.length > 0 ? (totalTemas / actas.length).toFixed(1) : '0';
  $('#promedioCompromisos').textContent = promedio;
}

function llenarFiltros(){
  const actas = state.data.actas;
  
  // Zonas únicas
  const zonas = [...new Set(actas.map(a => a.zona).filter(Boolean))];
  const selectMotivo = $('#filtroMotivo');
  selectMotivo.innerHTML = '<option value="">Todas las zonas</option>';
  zonas.forEach(zona => {
    const option = document.createElement('option');
    option.value = zona;
    option.textContent = zona;
    selectMotivo.appendChild(option);
  });
  
  // Ejecutivos únicos
  const ejecutivos = [...new Set(actas.map(a => a.ejecutivo_nombre || 'Sin asignar').filter(Boolean))];
  const selectEjecutivo = $('#filtroEjecutivo');
  selectEjecutivo.innerHTML = '<option value="">Todos</option>';
  ejecutivos.forEach(ejecutivo => {
    const option = document.createElement('option');
    option.value = ejecutivo;
    option.textContent = ejecutivo;
    selectEjecutivo.appendChild(option);
  });
}

// ===== FILTROS =====
function aplicarFiltros(){
  const actas = state.data.actas;
  const compromisos = state.data.compromisos;
  
  // Obtener filtros
  state.filtros.fechaDesde = $('#filtroFechaDesde').value;
  state.filtros.fechaHasta = $('#filtroFechaHasta').value;
  state.filtros.zona = $('#filtroMotivo').value; // Usamos el select de motivo para zonas
  state.filtros.ejecutivo = $('#filtroEjecutivo').value;
  
  // Aplicar filtros a actas
  let actasFiltradas = actas.filter(acta => {
    // Filtro por fecha
    if(state.filtros.fechaDesde && acta.fecha_local){
      const fechaActa = new Date(acta.fecha_local);
      const fechaDesde = new Date(state.filtros.fechaDesde);
      if(fechaActa < fechaDesde) return false;
    }
    
    if(state.filtros.fechaHasta && acta.fecha_local){
      const fechaActa = new Date(acta.fecha_local);
      const fechaHasta = new Date(state.filtros.fechaHasta);
      if(fechaActa > fechaHasta) return false;
    }
    
    // Filtro por zona
    if(state.filtros.zona && acta.zona !== state.filtros.zona){
      return false;
    }
    
    // Filtro por ejecutivo
    if(state.filtros.ejecutivo && acta.ejecutivo_nombre !== state.filtros.ejecutivo){
      return false;
    }
    
    return true;
  });
  
  // Filtrar compromisos basado en actas filtradas
  const idsActasFiltradas = new Set(actasFiltradas.map(a => a.id_acta));
  const compromisosFiltrados = compromisos.filter(c => idsActasFiltradas.has(c.id_acta));
  
  state.data.filtrada.actas = actasFiltradas;
  state.data.filtrada.compromisos = compromisosFiltrados;
  
  // Actualizar resumen y gráficos
  calcularResumen();
  generarGraficos();
  llenarTablas();
  
  toast(`Filtros aplicados: ${actasFiltradas.length} actas, ${compromisosFiltrados.length} compromisos`);
}

function limpiarFiltros(){
  $('#filtroFechaDesde').value = '';
  $('#filtroFechaHasta').value = '';
  $('#filtroMotivo').value = ''; // Zonas
  $('#filtroEjecutivo').value = '';
  
  state.data.filtrada.actas = state.data.actas;
  state.data.filtrada.compromisos = state.data.compromisos;
  
  calcularResumen();
  generarGraficos();
  llenarTablas();
  
  toast('Filtros limpiados');
}

// ===== GRÁFICOS =====
function generarGraficos(){
  const actas = state.data.filtrada.actas;
  const compromisos = state.data.filtrada.compromisos;
  
  generarGraficoActasMes(actas);
  generarGraficoZonas(actas);
  generarGraficoTopContactos(actas);
  generarGraficoTemasTratados(actas);
}

function generarGraficoActasMes(actas){
  const ctx = $('#chartActasMes').getContext('2d');
  
  // Agrupar por mes
  const porMes = {};
  actas.forEach(acta => {
    if(acta.fecha_local){
      const fecha = new Date(acta.fecha_local);
      const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      porMes[mes] = (porMes[mes] || 0) + 1;
    }
  });
  
  const labels = Object.keys(porMes).sort();
  const data = labels.map(mes => porMes[mes]);
  
  if(state.charts.actasMes){
    state.charts.actasMes.destroy();
  }
  
  state.charts.actasMes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Actas',
        data: data,
        backgroundColor: 'rgba(14, 165, 233, 0.8)',
        borderColor: 'rgba(14, 165, 233, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function generarGraficoZonas(actas){
  const ctx = $('#chartMotivos').getContext('2d');
  
  // Contar zonas
  const zonas = {};
  actas.forEach(acta => {
    const zona = acta.zona || 'Sin zona';
    zonas[zona] = (zonas[zona] || 0) + 1;
  });
  
  const labels = Object.keys(zonas);
  const data = Object.values(zonas);
  
  if(state.charts.zonas){
    state.charts.zonas.destroy();
  }
  
  state.charts.zonas = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(14, 165, 233, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(168, 85, 247, 0.8)'
        ]
      }]
    },
    options: {
      responsive: true
    }
  });
}

function generarGraficoTopContactos(actas){
  const ctx = $('#chartTopClientes').getContext('2d');
  
  // Contar por contacto
  const porContacto = {};
  actas.forEach(acta => {
    const contacto = acta.contacto_nombre || 'Sin contacto';
    porContacto[contacto] = (porContacto[contacto] || 0) + 1;
  });
  
  // Top 10
  const sorted = Object.entries(porContacto)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  
  const labels = sorted.map(([contacto]) => contacto);
  const data = sorted.map(([,count]) => count);
  
  if(state.charts.topContactos){
    state.charts.topContactos.destroy();
  }
  
  state.charts.topContactos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Visitas',
        data: data,
        backgroundColor: 'rgba(14, 165, 233, 0.8)'
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y'
    }
  });
}

function generarGraficoTemasTratados(actas){
  const ctx = $('#chartCompromisosEstado').getContext('2d');
  
  // Contar temas tratados
  const temas = {
    'Energía Eficiente': 0,
    'Conexión Emcali': 0,
    'Etiqueta RETIQ': 0,
    'Ahorro Energía': 0,
    'Consumo Energía': 0
  };
  
  actas.forEach(acta => {
    if(acta.tema_energia_eficiente === 'Sí') temas['Energía Eficiente']++;
    if(acta.tema_conexion_emcali === 'Sí') temas['Conexión Emcali']++;
    if(acta.tema_etiqueta_retiq === 'Sí') temas['Etiqueta RETIQ']++;
    if(acta.tema_ahorro_energia === 'Sí') temas['Ahorro Energía']++;
    if(acta.tema_consumo_energia === 'Sí') temas['Consumo Energía']++;
  });
  
  const labels = Object.keys(temas);
  const data = Object.values(temas);
  
  if(state.charts.temasTratados){
    state.charts.temasTratados.destroy();
  }
  
  state.charts.temasTratados = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(14, 165, 233, 0.8)',   // azul
          'rgba(34, 197, 94, 0.8)',    // verde
          'rgba(251, 191, 36, 0.8)',   // amarillo
          'rgba(239, 68, 68, 0.8)',    // rojo
          'rgba(168, 85, 247, 0.8)'    // morado
        ]
      }]
    },
    options: {
      responsive: true
    }
  });
}

// ===== TABLAS =====
function llenarTablas(){
  llenarTablaActasRecientes();
}

function llenarTablaActasRecientes(){
  const tbody = $('#tablaActasRecientes');
  tbody.innerHTML = '';
  
  const actas = state.data.filtrada.actas
    .sort((a, b) => {
      // Ordenar por fecha UTC si está disponible, sino por fecha local
      const fechaA = new Date(a.fecha_utc || a.fecha_local);
      const fechaB = new Date(b.fecha_utc || b.fecha_local);
      return fechaB - fechaA;
    })
    .slice(0, 10);
  
  actas.forEach(acta => {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-slate-50';
    row.innerHTML = `
      <td class="p-2 font-mono text-xs">${acta.id_acta || '-'}</td>
      <td class="p-2">${acta.contacto_nombre || '-'}</td>
      <td class="p-2 text-sm">${formatearFecha(acta.fecha_local)}</td>
      <td class="p-2">${acta.numero_contrato || '-'}</td>
      <td class="p-2">${acta.zona || '-'}</td>
      <td class="p-2">${acta.ejecutivo_nombre || '-'}</td>
    `;
    tbody.appendChild(row);
  });
}


// ===== UTILIDADES =====
function formatearFecha(fecha){
  if(!fecha) return '-';
  try{
    // Si la fecha viene como string "Invalid Date", intentar parsearla
    const fechaObj = new Date(fecha);
    if(isNaN(fechaObj.getTime())) {
      return fecha; // Retornar el string original si no se puede parsear
    }
    return fechaObj.toLocaleDateString('es-ES');
  }catch{
    return fecha;
  }
}

function calcularDiasVencido(fechaLimite){
  if(!fechaLimite) return 0;
  try{
    const fecha = new Date(fechaLimite);
    const hoy = new Date();
    const diffTime = hoy - fecha;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }catch{
    return 0;
  }
}

async function exportarExcelMaestro(){
  try{
    toast('📥 Generando Excel maestro...');
    
    // Usar la misma función que en app.js
    const all = await idbAll();
    await appendToExcelMaster(all, { rebuildIfNoHandle: true });
    
  }catch(err){
    console.error(err);
    toast('❌ Error generando Excel maestro');
  }
}

// Función copiada de app.js para generar Excel maestro
async function appendToExcelMaster(actas, opts={}){
  const name = localStorage.getItem('excelMasterName') || 'Actas_Master.xlsx';
  
  // Opción B: regenerado universal (descarga)
  const wb = XLSX.utils.book_new();
  ensureSheets(wb);
  mergeRowsIntoSheets(wb, actas);
  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  const fname = name;
  a.href = URL.createObjectURL(blob); a.download = fname; a.click();
  URL.revokeObjectURL(a.href);
  toast('📥 Excel maestro descargado: ' + fname);
}

function ensureSheets(wb){
  if(!wb.SheetNames.includes('Actas')){
    const ws = XLSX.utils.aoa_to_sheet([[
      'id_acta','fecha_local','fecha_utc','ejecutivo_nombre','ejecutivo_correo',
      'zona','barrio','direccion',
      'numero_contrato','nit','actividad_economica','exencion_contribucion',
      'contacto_nombre','contacto_cargo','contacto_correo','contacto_celular',
      'tema_energia_eficiente','desc_energia_eficiente',
      'tema_conexion_emcali','desc_conexion_emcali',
      'tema_etiqueta_retiq','desc_etiqueta_retiq',
      'tema_ahorro_energia','desc_ahorro_energia',
      'tema_consumo_energia','desc_consumo_energia',
      'incidencias_variaciones','incidencias_variaciones_cant','incidencias_cortes','incidencias_cortes_cant',
      'observaciones','firmante_nombre',
      'geo_lat','geo_lng','hash_sha256','pdf_filename'
    ]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Actas');
  }
  return wb.Sheets;
}

function mergeRowsIntoSheets(wb, actas){
  const wsA = wb.Sheets['Actas'];
  
  let rowsA = [];

  for(const a of actas){
    rowsA.push([
      a.id,
      a.visita?.fecha_local||'',
      a.visita?.fecha_utc||'',
      a.ejecutivo?.nombre||'',
      a.ejecutivo?.correo||'',
      a.ubicacion?.zona||'',
      a.ubicacion?.barrio||'',
      a.ubicacion?.direccion||'',
      a.cliente?.numeroContrato||'',
      a.cliente?.nit||'',
      a.cliente?.actividadEconomica||'',
      a.cliente?.exencionContribucion||'',
      a.contacto?.nombre||'',
      a.contacto?.cargo||'',
      a.contacto?.correo||'',
      a.contacto?.celular||'',
      a.temasTratados?.energiaEficiente ? 'Sí' : 'No',
      a.temasTratados?.descEnergiaEficiente||'',
      a.temasTratados?.conexionEmcali ? 'Sí' : 'No',
      a.temasTratados?.descConexionEmcali||'',
      a.temasTratados?.etiquetaRetiq ? 'Sí' : 'No',
      a.temasTratados?.descEtiquetaRetiq||'',
      a.temasTratados?.ahorroEnergia ? 'Sí' : 'No',
      a.temasTratados?.descAhorroEnergia||'',
      a.temasTratados?.consumoEnergia ? 'Sí' : 'No',
      a.temasTratados?.descConsumoEnergia||'',
      a.incidencias?.variaciones||'',
      a.incidencias?.variacionesCant||'',
      a.incidencias?.cortes||'',
      a.incidencias?.cortesCant||'',
      a.observaciones||'',
      a.firma?.nombre||'',
      a.visita?.geo?.lat||'',
      a.visita?.geo?.lng||'',
      a.sello?.hash_sha256||'',
      a.archivos?.pdf_filename||''
    ]);
  }

  if(rowsA.length){
    XLSX.utils.sheet_add_aoa(wsA, rowsA, { origin: -1 });
  }

  // Ajuste de rango - 37 columnas
  const totalCols = 37;
  wsA['!ref'] = wsA['!ref'] || `A1:${XLSX.utils.encode_col(totalCols-1)}${1+rowsA.length}`;
}

function debugInfo(){
  console.log('=== DEBUG INFO ===');
  console.log('DB:', db);
  console.log('State:', state);
  console.log('Actas cargadas:', state.data.actas.length);
  console.log('Compromisos cargados:', state.data.compromisos.length);
  
  // Mostrar información de formatos
  const nuevas = state.data.actas.filter(a => a.formato === 'nuevo').length;
  const antiguas = state.data.actas.filter(a => a.formato === 'antiguo').length;
  console.log(`=== FORMATOS DETECTADOS ===`);
  console.log(`Formato nuevo: ${nuevas} actas`);
  console.log(`Formato antiguo: ${antiguas} actas`);
  
  // Mostrar las primeras 3 actas para debug
  if(state.data.actas.length > 0) {
    console.log('=== PRIMERA ACTA (formato dashboard) ===');
    console.log(state.data.actas[0]);
    
    console.log('=== CAMPOS CLAVE ===');
    console.log('formato:', state.data.actas[0].formato);
    console.log('contacto_nombre:', state.data.actas[0].contacto_nombre);
    console.log('numero_contrato:', state.data.actas[0].numero_contrato);
    console.log('zona:', state.data.actas[0].zona);
    console.log('tema_energia_eficiente:', state.data.actas[0].tema_energia_eficiente);
    console.log('tema_conexion_emcali:', state.data.actas[0].tema_conexion_emcali);
  }
  
  // Mostrar datos raw de IndexedDB
  idbAll().then(rawData => {
    console.log('=== DATOS RAW DE INDEXEDDB ===');
    if(rawData.length > 0) {
      console.log('Primera acta raw:', rawData[0]);
      console.log('Estructura de la primera acta:');
      console.log('- ejecutivo:', rawData[0].ejecutivo);
      console.log('- ubicacion:', rawData[0].ubicacion);
      console.log('- cliente:', rawData[0].cliente);
      console.log('- contacto:', rawData[0].contacto);
      console.log('- temasTratados:', rawData[0].temasTratados);
      console.log('- incidencias:', rawData[0].incidencias);
    }
  });
  
  console.log('Elementos del DOM:');
  console.log('- #resumenGeneral:', $('#resumenGeneral'));
  console.log('- #graficos:', $('#graficos'));
  console.log('- #tablas:', $('#tablas'));
  console.log('- #filtros:', $('#filtros'));
  
  $('#estadoDatos').textContent = `Debug: ${state.data.actas.length} actas. Ver consola para más detalles.`;
}

async function borrarTodasActas(){
  try{
    // Confirmar antes de borrar
    const confirmar = confirm('⚠️ ¿Estás seguro de que quieres borrar TODAS las actas?\n\nEsta acción NO se puede deshacer.');
    if(!confirmar) return;
    
    $('#estadoDatos').textContent = '🗑️ Borrando todas las actas...';
    
    // Contar actas antes de borrar
    const totalActas = await idbAll();
    const cantidad = totalActas.length;
    
    // Borrar todas las actas
    await idbClear();
    
    // Limpiar estado
    state.data.actas = [];
    state.data.compromisos = [];
    state.data.filtrada.actas = [];
    state.data.filtrada.compromisos = [];
    
    // Ocultar dashboard
    const elementos = ['#resumenGeneral', '#graficos', '#tablas', '#filtros'];
    elementos.forEach(selector => {
      const el = $(selector);
      if(el) el.classList.add('hidden');
    });
    
    $('#estadoDatos').textContent = `✅ Se borraron ${cantidad} actas correctamente`;
    toast(`✅ Se borraron ${cantidad} actas correctamente`);
    
    console.log(`Se borraron ${cantidad} actas del IndexedDB`);
    
  }catch(err){
    console.error('Error borrando actas:', err);
    $('#estadoDatos').textContent = `❌ Error borrando actas: ${err.message}`;
    toast('❌ Error borrando actas');
  }
}

function toast(msg){
  $('#estadoDatos').textContent = msg;
  setTimeout(() => {
    $('#estadoDatos').textContent = '';
  }, 3000);
}

// ===== REPORTE PDF =====
async function generarReportePDF(){
  try{
    toast('📄 Generando reporte PDF...');
    
    // Aquí podrías implementar la generación de PDF usando jsPDF
    // Por ahora, exportar a Excel
    const workbook = XLSX.utils.book_new();
    
    // Hoja de resumen
    const resumenData = [
      ['Métrica', 'Valor'],
      ['Total Actas', state.data.filtrada.actas.length],
      ['Total Compromisos', state.data.filtrada.compromisos.length],
      ['Clientes Únicos', new Set(state.data.filtrada.actas.map(a => a.cliente_razon)).size],
      ['Promedio Compromisos/Acta', (state.data.filtrada.compromisos.length / state.data.filtrada.actas.length).toFixed(1)]
    ];
    
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');
    
    // Hoja de actas filtradas
    const wsActas = XLSX.utils.json_to_sheet(state.data.filtrada.actas);
    XLSX.utils.book_append_sheet(workbook, wsActas, 'Actas Filtradas');
    
    // Hoja de compromisos filtrados
    const wsCompromisos = XLSX.utils.json_to_sheet(state.data.filtrada.compromisos);
    XLSX.utils.book_append_sheet(workbook, wsCompromisos, 'Compromisos Filtrados');
    
    // Descargar
    const fecha = new Date().toISOString().split('T')[0];
    const filename = `Reporte_Acta_Express_${fecha}.xlsx`;
    XLSX.writeFile(workbook, filename);
    
    toast('✅ Reporte descargado: ' + filename);
    
  }catch(err){
    console.error(err);
    toast('❌ Error generando reporte');
  }
}
