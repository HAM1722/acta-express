// app.js (ESM)
// Bloque 1: PWA – formulario, firma, PDF, compartir, historial
// Bloque 2: Excel maestro (Append con File System Access cuando se pueda; regenerado si no)

imported();
async function imported(){ /* noop to hint module */ }

// ===== UTILIDADES BÁSICAS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Estado en memoria
const state = {
  cfg: {
    ejecutivo: '',
    correo: '',
    geo: false,
  },
  excelHandle: null, // File System Access handle (opción A)
  firmaPad: null,
  firmaPng: null,
  geo: {lat:null,lng:null},
  ultimoPDFBlob: null,
  ultimoActa: null,
};

// IndexedDB para historial
let db; // IDBDatabase
const DB_NAME = 'acta_express_db';
const DB_STORE = 'actas';

init();

async function init(){
  hintPWA();
  await idbOpen();
  bindUI();
  await loadCfg();
  initSignaturePad();
  renderHistorial();
  if(state.cfg.geo){ getGeo(); }
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('./service-worker.js'); }catch{}
  }
}

function hintPWA(){
  const el = $('#pwaHint');
  if(!('serviceWorker' in navigator)){
    el.classList.remove('hidden');
    el.textContent = 'Sugerencia: para usar offline, publica estos archivos en un hosting estático (HTTPS) y se instalará como PWA. Mientras tanto, la app funciona online.';
  }
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

function idbPut(acta){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).put(acta);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
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

// ===== Configuración =====
async function loadCfg(){
  const raw = localStorage.getItem('cfg');
  if(raw){ state.cfg = JSON.parse(raw); }
  $('#cfgEjecutivo').value = state.cfg.ejecutivo||'';
  $('#cfgCorreo').value = state.cfg.correo||'';
  $('#cfgGeo').checked = !!state.cfg.geo;

  // Excel handle (si se guardó)
  const h = localStorage.getItem('excelHandle');
  if(h){
    try{
      state.excelHandle = await window.showOpenFilePicker({ // dummy to get permissions later
        types:[{description:'Excel', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}],
        multiple:false
      });
    }catch{}
  }
  updateExcelEstado();
}

function saveCfg(){
  state.cfg.ejecutivo = $('#cfgEjecutivo').value.trim();
  state.cfg.correo = $('#cfgCorreo').value.trim();
  state.cfg.geo = $('#cfgGeo').checked;
  localStorage.setItem('cfg', JSON.stringify(state.cfg));
}

function bindUI(){
  $('#btnGuardarCfg').addEventListener('click', ()=>{ saveCfg(); toast('Configuración guardada'); });
  $('#btnElegirExcel').addEventListener('click', chooseExcelMaster);
  $('#btnLimpiarExcelHandle').addEventListener('click', ()=>{ localStorage.removeItem('excelMasterName'); toast('Excel maestro olvidado'); updateExcelEstado(); });

  $('#btnLimpiarFirma').addEventListener('click', ()=> state.firmaPad.clear());
  $('#btnGenerarPDF').addEventListener('click', onGenerarPDF);
  $('#btnCompartir').addEventListener('click', onCompartir);
  $('#btnDescargarPDF').addEventListener('click', descargarPDF);
  $('#btnGuardarExcel').addEventListener('click', onGuardarExcelMaestro);
  
  // Agregar botón alternativo de descarga
  $('#btnCompartir').addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    if(!state.ultimoPDFBlob){ toast('Primero genera el PDF'); return; }
    const filename = state.ultimoActa?.archivos?.pdf_filename || 'Acta.pdf';
    const file = new File([state.ultimoPDFBlob], filename, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast('📥 PDF descargado (envíalo por correo manualmente)');
  });
}

function updateExcelEstado(){
  const el = $('#excelEstado');
  const name = localStorage.getItem('excelMasterName');
  el.textContent = name ? `Excel maestro configurado: ${name}` : 'Excel maestro no configurado (opción B: regenerado).';
}

async function chooseExcelMaster(){
  if(!window.showSaveFilePicker){ toast('Tu navegador no soporta acceso directo a archivos. Usaremos el modo "regenerado".'); return; }
  const handle = await window.showSaveFilePicker({
    suggestedName: 'Actas_Master.xlsx',
    types: [{description:'Excel', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]
  });
  localStorage.setItem('excelMasterName', handle.name || 'Actas_Master.xlsx');
  // Guardamos el handle en memoria de sesión (no persistente por seguridad)
  state.excelHandle = handle;
  updateExcelEstado();
  toast('Excel maestro establecido');
}

// ===== Geolocalización (opcional) =====
function getGeo(){
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos=>{
    state.geo.lat = pos.coords.latitude;
    state.geo.lng = pos.coords.longitude;
  },()=>{}, { enableHighAccuracy:false, maximumAge:60000, timeout:5000 });
}

// ===== Firma =====
function initSignaturePad(){
  const canvas = $('#pad');
  resizeCanvas(canvas);
  window.addEventListener('resize', ()=> resizeCanvas(canvas));
  state.firmaPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
}
function resizeCanvas(c){
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  c.width = c.offsetWidth * ratio;
  c.height = 240 * ratio;
  const ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
}

// ===== HASH con Web Crypto =====
async function sha256Base64(str){
  const enc = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

// ===== Generar Acta + PDF =====
async function onGenerarPDF(){
  try{
    $('#estado').textContent = 'Generando PDF...';
    const acta = await buildActaJSON();
    const { blob, filename } = await buildPDF(acta);
    state.ultimoPDFBlob = blob;
    acta.archivos = { pdf_filename: filename };
    await idbPut(acta);
    state.ultimoActa = acta;
    $('#estado').textContent = `PDF listo: ${filename}`;
    renderHistorial();
    toast('PDF generado y guardado en historial');
  }catch(err){
    console.error(err);
    const mensaje = err.message || 'Error generando PDF';
    toast(mensaje);
    $('#estado').textContent = `❌ ${mensaje}`;
  }
}

async function buildActaJSON(){
  const now = new Date();
  const fecha_local = now.toLocaleString();
  const fecha_utc = now.toISOString();
  const id = 'AX-' + fecha_utc.replace(/[-:.TZ]/g,'').slice(0,14);

  if(state.firmaPad.isEmpty()) throw new Error('⚠️ Debe firmar en el recuadro antes de generar el PDF');
  const firmaPng = state.firmaPad.toDataURL('image/png');

  const base = {
    id,
    ejecutivo: {
      nombre: state.cfg.ejecutivo||'',
      correo: state.cfg.correo||'',
    },
    ubicacion: {
      zona: $('#zona').value.trim(),
      barrio: $('#barrio').value.trim(),
      direccion: $('#direccion').value.trim(),
    },
    cliente: {
      numeroContrato: $('#numeroContrato').value.trim(),
      nit: $('#cliNit').value.trim(),
      actividadEconomica: $('#actividadEconomica').value.trim(),
      exencionContribucion: $('#exencionContribucion').value.trim(),
    },
    contacto: {
      nombre: $('#contactoNombre').value.trim(),
      cargo: $('#contactoCargo').value.trim(),
      correo: $('#contactoCorreo').value.trim(),
      celular: $('#contactoCelular').value.trim(),
    },
    temasTratados: {
      energiaEficiente: $('#temaEnergiaEficiente').checked,
      descEnergiaEficiente: $('#descEnergiaEficiente').value.trim(),
      conexionEmcali: $('#temaConexionEmcali').checked,
      descConexionEmcali: $('#descConexionEmcali').value.trim(),
      etiquetaRetiq: $('#temaEtiquetaRetiq').checked,
      descEtiquetaRetiq: $('#descEtiquetaRetiq').value.trim(),
      ahorroEnergia: $('#temaAhorroEnergia').checked,
      descAhorroEnergia: $('#descAhorroEnergia').value.trim(),
      consumoEnergia: $('#temaConsumoEnergia').checked,
      descConsumoEnergia: $('#descConsumoEnergia').value.trim(),
    },
    incidencias: {
      variaciones: $('#incVariaciones').value,
      variacionesCant: $('#incVariacionesCant').value.trim(),
      cortes: $('#incCortes').value,
      cortesCant: $('#incCortesCant').value.trim(),
    },
    observaciones: $('#observaciones').value.trim(),
    visita: {
      fecha_local,
      fecha_utc,
      geo: state.cfg.geo ? { lat: state.geo.lat, lng: state.geo.lng } : { lat:null, lng:null }
    },
    consent: $('#consent').checked === true,
    firma: {
      nombre: $('#firmanteNombre').value.trim(),
      pngDataUrl: firmaPng
    },
    sello: {
      userAgent: navigator.userAgent,
      hash_sha256: '',
      qr_payload: ''
    }
  };

  // Hash sobre copia sin imagen de firma para estabilidad
  const hashObj = JSON.parse(JSON.stringify(base));
  if(hashObj.firma) hashObj.firma.pngDataUrl = '[signed]';
  const hash = await sha256Base64(JSON.stringify(hashObj));
  base.sello.hash_sha256 = hash;
  base.sello.qr_payload = JSON.stringify({ id: base.id, hash });
  return base;
}

async function buildPDF(acta){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const L = 40, T = 40, W = 515; // márgenes aproximados
  const lineHeight = 12; // Altura de línea para fuente 9pt
  const sectionSpacing = 25; // Espacio entre secciones

  let y = T; // Posición Y inicial

  // Función helper para agregar texto y actualizar Y
  function addText(text, isTitle = false) {
    if(isTitle) {
      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
    } else {
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
    }
    const lines = doc.splitTextToSize(text, W);
    doc.text(lines, L, y);
    y += lines.length * lineHeight + (isTitle ? 5 : 0);
  }

  // Encabezado
  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  doc.text('ACTA DE VISITA – FIDELIZACIÓN EMCALI', L, y);
  y += 25;
  
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(`ID: ${acta.id}`, L, y);
  y += lineHeight;
  doc.text(`Fecha: ${acta.visita.fecha_local}`, L, y);
  y += lineHeight * 2;

  // Ejecutivo y Ubicación
  addText('DATOS DEL EJECUTIVO Y UBICACIÓN', true);
  addText(`Ejecutivo: ${acta.ejecutivo.nombre}`);
  addText(`Correo: ${acta.ejecutivo.correo}`);
  addText(`Zona: ${acta.ubicacion.zona} | Barrio: ${acta.ubicacion.barrio}`);
  addText(`Dirección: ${acta.ubicacion.direccion}`);
  y += sectionSpacing;

  // Cliente/Negocio
  addText('DATOS DEL CLIENTE/NEGOCIO', true);
  addText(`N° Contrato: ${acta.cliente.numeroContrato} | NIT: ${acta.cliente.nit}`);
  addText(`Actividad Económica: ${acta.cliente.actividadEconomica}`);
  addText(`Exención de Contribución: ${acta.cliente.exencionContribucion}`);
  y += sectionSpacing;

  // Persona Encargada
  addText('DATOS DE LA PERSONA ENCARGADA', true);
  addText(`Nombre: ${acta.contacto.nombre} | Cargo: ${acta.contacto.cargo}`);
  addText(`Correo: ${acta.contacto.correo} | Celular: ${acta.contacto.celular}`);
  y += sectionSpacing;

  // Temas Tratados
  addText('TEMAS TRATADOS CON EL CLIENTE', true);
  
  let temasTexto = '';
  if(acta.temasTratados.energiaEficiente) {
    temasTexto += '• Energía eficiente:\n  ' + (acta.temasTratados.descEnergiaEficiente || 'Sin descripción') + '\n\n';
  }
  if(acta.temasTratados.conexionEmcali) {
    temasTexto += '• Conexión directa con Emcali:\n  ' + (acta.temasTratados.descConexionEmcali || 'Sin descripción') + '\n\n';
  }
  if(acta.temasTratados.etiquetaRetiq) {
    temasTexto += '• Etiqueta RETIQ:\n  ' + (acta.temasTratados.descEtiquetaRetiq || 'Sin descripción') + '\n\n';
  }
  if(acta.temasTratados.ahorroEnergia) {
    temasTexto += '• Ahorro de energía:\n  ' + (acta.temasTratados.descAhorroEnergia || 'Sin descripción') + '\n\n';
  }
  if(acta.temasTratados.consumoEnergia) {
    temasTexto += '• Consumo de energía:\n  ' + (acta.temasTratados.descConsumoEnergia || 'Sin descripción') + '\n\n';
  }
  
  if(!temasTexto) temasTexto = 'Ningún tema tratado';
  addText(temasTexto);
  y += sectionSpacing;

  // Incidencias
  addText('INCIDENCIAS', true);
  const varText = acta.incidencias.variaciones === 'Sí' ? 
    `Sí (${acta.incidencias.variacionesCant || '0'} veces)` : 
    (acta.incidencias.variaciones || 'No especificado');
  addText(`¿Variaciones y fluctuaciones?: ${varText}`);
  
  const cortesText = acta.incidencias.cortes === 'Sí' ? 
    `Sí (${acta.incidencias.cortesCant || '0'} veces)` : 
    (acta.incidencias.cortes || 'No especificado');
  addText(`¿Cortes de suministro?: ${cortesText}`);
  y += sectionSpacing;

  // Observaciones
  addText('OBSERVACIONES GENERALES', true);
  addText(acta.observaciones || 'Ninguna');
  y += sectionSpacing;

  // Firma
  addText('FIRMA DEL CLIENTE', true);
  y += 10;
  
  const img = acta.firma.pngDataUrl;
  try{
    doc.addImage(img, 'PNG', L, y, 220, 80);
  }catch{}
  y += 90; // Altura de la imagen + margen
  
  addText(`Nombre: ${acta.firma.nombre}`);
  y += 20;

  // QR + Hash
  try {
    if(typeof QRCode !== 'undefined') {
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, acta.sello.qr_payload, { width: 100, margin: 0 });
      const qrData = qrCanvas.toDataURL('image/png');
      doc.addImage(qrData, 'PNG', L+400, y-50, 100, 100);
    }
  } catch(err) {
    console.warn('QRCode no disponible, continuando sin QR');
  }
  
  doc.setFontSize(7);
  const hashLines = doc.splitTextToSize(`Hash SHA-256: ${acta.sello.hash_sha256}`, W-110);
  doc.text(hashLines, L, y);

  // Pie
  doc.setFontSize(8);
  doc.text('Documento generado en sitio y firmado por el cliente. Sistema Acta Express - Emcali.', L, 800);

  const filename = `${acta.id}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}

// ===== Compartir (Outlook / sistema) =====
async function onCompartir(){
  if(!state.ultimoPDFBlob){ toast('Primero genera el PDF'); return; }
  const filename = state.ultimoActa?.archivos?.pdf_filename || 'Acta.pdf';
  
  // SIEMPRE descargar primero el PDF
  const url = URL.createObjectURL(state.ultimoPDFBlob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = filename; 
  a.click();
  URL.revokeObjectURL(url);
  toast('📥 PDF descargado - Adjúntalo a tu correo');
  
  // Intentar Web Share como bonus (no crítico)
  if(navigator.share && navigator.canShare){
    const file = new File([state.ultimoPDFBlob], filename, { type: 'application/pdf' });
    try{
      if(navigator.canShare({ files:[file] })){
        setTimeout(async ()=>{
          try{
            await navigator.share({
              title: 'Acta de visita',
              text: `Acta de visita ${state.ultimoActa?.id || ''} - ${state.ultimoActa?.cliente?.razon || 'Cliente'}`,
              files: [file]
            });
          }catch(e){ 
            console.log('Web Share falló, pero PDF ya está descargado');
          }
        }, 500);
      }
    }catch(e){ 
      console.log('Web Share no disponible');
    }
  }
}

function descargarPDF(){
  if(!state.ultimoPDFBlob){ toast('❌ Primero genera el PDF'); return; }
  const filename = state.ultimoActa?.archivos?.pdf_filename || 'Acta.pdf';
  const url = URL.createObjectURL(state.ultimoPDFBlob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = filename; 
  a.click();
  URL.revokeObjectURL(url);
  toast('📥 PDF descargado: ' + filename);
}

function toast(msg){
  $('#estado').textContent = msg;
}

// ===== Historial =====
async function renderHistorial(){
  const cont = $('#historial');
  cont.innerHTML = '';
  const all = (await idbAll()).sort((a,b)=> (a.visita.fecha_utc < b.visita.fecha_utc ? 1 : -1));
  all.forEach(a=>{
    const div = document.createElement('div');
    div.className='flex items-center gap-2 bg-white border rounded p-2';
    const contactoNombre = a.contacto?.nombre || a.cliente?.razon || '-';
    const contrato = a.cliente?.numeroContrato || 'S/N';
    div.innerHTML = `
      <div class="flex-1">
        <div class="font-medium">${a.id} – ${contactoNombre}</div>
        <div class="text-xs text-slate-500">${a.visita.fecha_local} | Contrato: ${contrato}</div>
      </div>
      <button class="btn btn-xs" data-id="${a.id}" data-act="share">Compartir</button>
      <button class="btn btn-xs btn-outline" data-id="${a.id}" data-act="excel">Añadir a Excel</button>
    `;
    div.addEventListener('click', async (ev)=>{
      const btn = ev.target.closest('button'); if(!btn) return;
      const id = btn.dataset.id; const act = btn.dataset.act;
      if(act==='share'){
        // reconstruir PDF desde registro
        state.ultimoActa = a;
        const { blob, filename } = await buildPDF(a);
        state.ultimoPDFBlob = blob;
        await onCompartir();
      }
      if(act==='excel'){
        await appendToExcelMaster([a]);
      }
    });
    cont.appendChild(div);
  });
}

// ====== BLOQUE 2 – EXCEL MAESTRO ======
async function onGuardarExcelMaestro(){
  const all = await idbAll();
  await appendToExcelMaster(all, { rebuildIfNoHandle:true });
}

async function appendToExcelMaster(actas, opts={}){
  const name = localStorage.getItem('excelMasterName');
  if(window.showSaveFilePicker && state.excelHandle){
    // Opción A: abrir/escribir archivo físico
    try{
      const file = await state.excelHandle.getFile();
      let wb;
      if(file.size > 0){
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type:'array' });
      } else {
        wb = XLSX.utils.book_new();
      }
      const sheets = ensureSheets(wb);
      mergeRowsIntoSheets(wb, actas);
      const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      const writable = await state.excelHandle.createWritable();
      await writable.write(out);
      await writable.close();
      toast(`Excel actualizado${name?' → '+name:''}`);
      return;
    }catch(err){ console.warn('Fallo append físico, usando regenerado', err); }
  }
  // Opción B: regenerado universal (descarga)
  const wb = XLSX.utils.book_new();
  ensureSheets(wb);
  mergeRowsIntoSheets(wb, actas);
  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  const fname = name || 'Actas_Master.xlsx';
  a.href = URL.createObjectURL(blob); a.download = fname; a.click();
  URL.revokeObjectURL(a.href);
  toast('Excel regenerado y descargado');
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
  const rangeA = XLSX.utils.decode_range(wsA['!ref'] || 'A1:A1');

  // Build existing IDs set para anti-duplicados
  const existingIds = new Set();
  for(let R=1; R<=rangeA.e.r; R++){
    const cell = wsA[XLSX.utils.encode_cell({c:0,r:R})];
    if(cell && cell.v) existingIds.add(String(cell.v));
  }

  let rowsA = [];

  for(const a of actas){
    if(existingIds.has(a.id)) continue;
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

  // Ajuste de rango
  const totalCols = 37; // Número de columnas (32 + 5 descripciones de temas)
  wsA['!ref'] = wsA['!ref'] || `A1:${XLSX.utils.encode_col(totalCols-1)}${1+rowsA.length}`;
}

