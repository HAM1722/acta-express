// app.js - Acta Express PWA
// Bloque 1: PWA – formulario, firma, PDF, compartir, historial
// Bloque 2: Excel maestro (Append con File System Access cuando se pueda; regenerado si no)

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
    backupAuto: true, // Backup automático habilitado por defecto
    backupInterval: 24, // Horas entre backups automáticos
    backupIncremental: true, // Backup incremental habilitado
  },
  excelHandle: null, // File System Access handle (opción A)
  firmaPad: null,
  firmaPng: null,
  geo: {lat:null,lng:null},
  ultimoPDFBlob: null,
  ultimoActa: null,
  backupTimer: null, // Timer para backup automático
  cloudAuth: null, // Autenticación en la nube
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
  verificarEstadoFirma(); // Verificar si hay firma guardada
  initSignaturePad();
  renderHistorial();
  if(state.cfg.geo){ getGeo(); }
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('./service-worker.js'); }catch{}
  }
  
  
  // Iniciar sistema de backup automático
  iniciarBackupAutomatico();
  
  // Limpiar recursos al cerrar la página
  window.addEventListener('beforeunload', () => {
    if(window.firmaBackupInterval) {
      clearInterval(window.firmaBackupInterval);
    }
    if(window.firmaResizeHandler) {
      window.removeEventListener('resize', window.firmaResizeHandler);
    }
    if(state.backupTimer) {
      clearInterval(state.backupTimer);
    }
  });
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

async function limpiarDuplicadosIndexedDB(){
  try {
    const allActas = await idbAll();
    const uniqueActas = [];
    const seenContent = new Set();
    
    for(const acta of allActas) {
      const contentHash = `${acta.cliente?.numeroContrato||''}_${acta.cliente?.nit||''}_${acta.visita?.fecha_local||''}`;
      
      if(!seenContent.has(contentHash)) {
        seenContent.add(contentHash);
        uniqueActas.push(acta);
      } else {
        console.log(`Eliminando duplicado: ${acta.id} - ${acta.cliente?.numeroContrato}`);
      }
    }
    
    if(uniqueActas.length !== allActas.length) {
      // Limpiar la base de datos y reinsertar solo las únicas
      const tx = db.transaction(DB_STORE, 'readwrite');
      await new Promise((resolve, reject) => {
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      
      // Reinsertar las actas únicas
      for(const acta of uniqueActas) {
        await idbPut(acta);
      }
      
      const duplicadosEliminados = allActas.length - uniqueActas.length;
      toast(`✅ Limpieza completada: ${duplicadosEliminados} duplicados eliminados`);
      console.log(`Limpieza completada: ${duplicadosEliminados} duplicados eliminados`);
      return duplicadosEliminados;
    } else {
      toast('✅ No se encontraron duplicados');
      return 0;
    }
  } catch(error) {
    console.error('Error limpiando duplicados:', error);
    toast('❌ Error limpiando duplicados');
    return -1;
  }
}

// ===== Configuración =====
async function loadCfg(){
  const raw = localStorage.getItem('cfg');
  if(raw){ state.cfg = JSON.parse(raw); }
  $('#cfgEjecutivo').value = state.cfg.ejecutivo||'';
  $('#cfgCorreo').value = state.cfg.correo||'';
  $('#cfgGeo').checked = !!state.cfg.geo;
  $('#cfgBackupAuto').checked = state.cfg.backupAuto !== false; // Por defecto true
  $('#cfgBackupInterval').value = state.cfg.backupInterval || 24;
  $('#cfgBackupIncremental').checked = state.cfg.backupIncremental !== false; // Por defecto true

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
  state.cfg.backupAuto = $('#cfgBackupAuto').checked;
  state.cfg.backupInterval = parseInt($('#cfgBackupInterval').value) || 24;
  state.cfg.backupIncremental = $('#cfgBackupIncremental').checked;
  localStorage.setItem('cfg', JSON.stringify(state.cfg));
  
  // Reiniciar backup automático si cambió la configuración
  if(state.backupTimer) {
    clearInterval(state.backupTimer);
  }
  iniciarBackupAutomatico();
}

function bindUI(){
  $('#btnGuardarCfg').addEventListener('click', ()=>{ saveCfg(); toast('Configuración guardada'); });
  $('#btnElegirExcel').addEventListener('click', chooseExcelMaster);
  $('#btnLimpiarExcelHandle').addEventListener('click', ()=>{ localStorage.removeItem('excelMasterName'); toast('Excel maestro olvidado'); updateExcelEstado(); });

  $('#btnLimpiarFirma').addEventListener('click', ()=> {
    if(state.firmaPad && !state.firmaPad.isEmpty()) {
      // Confirmar antes de limpiar
      const confirmar = confirm('⚠️ ¿Estás seguro de que quieres limpiar la firma?\n\nEsta acción NO se puede deshacer automáticamente.');
      if(confirmar) {
        state.firmaPad.clear();
        mostrarEstadoFirma(false);
        
        // Limpiar todos los backups
        localStorage.removeItem('firmaBackup');
        localStorage.removeItem('firmaBackup2');
        localStorage.removeItem('firmaBackup3');
        localStorage.removeItem('firmaBackupTemporal');
        localStorage.removeItem('firmaGuardada');
        localStorage.removeItem('timestampFirma');
        sessionStorage.removeItem('firmaSessionBackup');
        
        console.log('Firma limpiada completamente');
        $('#estado').textContent = 'Firma limpiada';
      }
    } else {
      $('#estado').textContent = 'No hay firma para limpiar';
    }
  });
  
  $('#btnProbarFirma').addEventListener('click', ()=> {
    if(state.firmaPad && !state.firmaPad.isEmpty()) {
      const firmaData = state.firmaPad.toDataURL('image/png');
      console.log('Firma capturada:', firmaData.length, 'caracteres');
      console.log('Primeros 100 caracteres:', firmaData.substring(0, 100));
      
      // Mostrar información en pantalla
      $('#estado').textContent = `✅ Firma capturada: ${firmaData.length} caracteres`;
      
      // Crear imagen de prueba
      const img = document.createElement('img');
      img.src = firmaData;
      img.style.maxWidth = '200px';
      img.style.border = '1px solid #ccc';
      img.style.margin = '10px';
      
      // Mostrar imagen temporalmente
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '50%';
      container.style.left = '50%';
      container.style.transform = 'translate(-50%, -50%)';
      container.style.background = 'white';
      container.style.padding = '20px';
      container.style.border = '2px solid #333';
      container.style.zIndex = '9999';
      container.innerHTML = '<p>Vista previa de la firma:</p>';
      container.appendChild(img);
      
      document.body.appendChild(container);
      setTimeout(() => {
        document.body.removeChild(container);
      }, 3000);
      
    } else {
      $('#estado').textContent = '❌ No hay firma para probar. Firma primero.';
    }
  });
  
  $('#btnRestaurarFirma').addEventListener('click', ()=> {
    const firmaBackup = localStorage.getItem('firmaBackup');
    if(firmaBackup && firmaBackup.length > 1000) {
      const canvas = $('#pad');
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        if(state.firmaPad) {
          state.firmaPad.fromDataURL(firmaBackup);
        }
        $('#estado').textContent = '✅ Firma restaurada desde backup';
        mostrarEstadoFirma(true);
        console.log('Firma restaurada manualmente');
      };
      img.src = firmaBackup;
    } else {
      $('#estado').textContent = '❌ No hay backup de firma disponible';
    }
  });
  $('#btnGenerarPDF').addEventListener('click', onGenerarPDF);
  $('#btnCompartir').addEventListener('click', onCompartir);
  $('#btnDescargarPDF').addEventListener('click', descargarPDF);
  $('#btnGuardarExcel').addEventListener('click', onGuardarExcelMaestro);
  $('#btnBackupManual').addEventListener('click', backupManual);
  $('#btnBackupLocalStorage').addEventListener('click', backupLocalStorage);
  $('#btnRestaurarBackup').addEventListener('click', restaurarBackup);
  // Botón original de limpiar duplicados (en la sección de generar PDF)
  $('#btnLimpiarDuplicados').addEventListener('click', async () => {
    const confirmar = confirm('⚠️ ¿Estás seguro de que quieres limpiar duplicados?\n\nEsta acción eliminará registros duplicados del historial local. Los archivos Excel no se verán afectados.');
    if(confirmar) {
      $('#estado').textContent = 'Limpiando duplicados...';
      const duplicadosEliminados = await limpiarDuplicadosIndexedDB();
      renderHistorial();
      if(duplicadosEliminados >= 0) {
        $('#estado').textContent = `✅ Limpieza completada: ${duplicadosEliminados} duplicados eliminados`;
      }
    }
  });

  // Botón de limpiar duplicados en la sección de historial
  $('#btnLimpiarDuplicadosHistorial').addEventListener('click', async () => {
    const confirmar = confirm('⚠️ ¿Estás seguro de que quieres limpiar duplicados?\n\nEsta acción eliminará registros duplicados del historial local. Los archivos Excel no se verán afectados.');
    if(confirmar) {
      $('#estado').textContent = 'Limpiando duplicados...';
      const duplicadosEliminados = await limpiarDuplicadosIndexedDB();
      renderHistorial();
      if(duplicadosEliminados >= 0) {
        $('#estado').textContent = `✅ Limpieza completada: ${duplicadosEliminados} duplicados eliminados`;
      }
    }
  });

  // Botón de limpiar todo el historial
  $('#btnLimpiarHistorial').addEventListener('click', async () => {
    const confirmar = confirm('⚠️ ¿Estás SEGURO de que quieres eliminar TODO el historial?\n\nEsta acción eliminará TODAS las actas del historial local.\nLos archivos Excel no se verán afectados.\n\nEsta acción NO se puede deshacer.');
    if(confirmar) {
      const confirmar2 = confirm('⚠️ ÚLTIMA CONFIRMACIÓN:\n\n¿Estás completamente seguro de que quieres eliminar TODAS las actas?');
      if(confirmar2) {
        $('#estado').textContent = 'Limpiando historial completo...';
        await limpiarHistorialCompleto();
        $('#estado').textContent = '✅ Historial completamente limpiado';
      }
    }
  });
  
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
  if(!canvas) {
    console.warn('Canvas de firma no encontrado');
    return;
  }
  
  // Limpiar eventos anteriores para evitar duplicados
  if(window.firmaResizeHandler) {
    window.removeEventListener('resize', window.firmaResizeHandler);
  }
  
  resizeCanvas(canvas);
  
  // Configuración optimizada para móviles
  state.firmaPad = new SignaturePad(canvas, { 
    backgroundColor: 'rgb(255,255,255)',
    penColor: 'rgb(0,0,0)',
    minWidth: 2.0,
    maxWidth: 4.0,
    throttle: 16,
    velocityFilterWeight: 0.7
  });
  
  // Sistema de backup simplificado pero efectivo
  let backupTimeout;
  let isSigning = false;
  
  state.firmaPad.addEventListener('beginStroke', () => {
    clearTimeout(backupTimeout);
    isSigning = true;
    console.log('Iniciando firma...');
  });
  
  state.firmaPad.addEventListener('endStroke', () => {
    isSigning = false;
    clearTimeout(backupTimeout);
    backupTimeout = setTimeout(() => {
      if(!state.firmaPad.isEmpty()) {
        const firmaBackup = state.firmaPad.toDataURL();
        localStorage.setItem('firmaBackup', firmaBackup);
        localStorage.setItem('firmaBackup2', firmaBackup);
        sessionStorage.setItem('firmaSessionBackup', firmaBackup);
        localStorage.setItem('firmaGuardada', 'true');
        localStorage.setItem('timestampFirma', Date.now().toString());
        mostrarEstadoFirma(true);
        console.log('✅ Backup de firma guardado');
      }
    }, 100);
  });
  
  // Backup continuo mientras se está firmando
  if(window.firmaBackupInterval) {
    clearInterval(window.firmaBackupInterval);
  }
  window.firmaBackupInterval = setInterval(() => {
    if(isSigning && !state.firmaPad.isEmpty()) {
      const firmaBackup = state.firmaPad.toDataURL();
      localStorage.setItem('firmaBackupTemporal', firmaBackup);
    }
  }, 200);
  
  // Manejar redimensionamiento SIN perder la firma
  window.firmaResizeHandler = () => {
    resizeCanvas(canvas);
  };
  window.addEventListener('resize', window.firmaResizeHandler);
  
  // Restaurar firma desde backup al inicializar
  const firmaBackup = localStorage.getItem('firmaBackup');
  if(firmaBackup && firmaBackup.length > 1000) {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      if(state.firmaPad) {
        state.firmaPad.fromDataURL(firmaBackup);
      }
      console.log('✅ Firma restaurada desde backup');
    };
    img.src = firmaBackup;
  }
  
  console.log('SignaturePad inicializado correctamente');
}

// Función para mostrar el estado de la firma
function mostrarEstadoFirma(tieneFirma) {
  const statusEl = $('#firmaStatus');
  if(statusEl) {
    if(tieneFirma) {
      statusEl.classList.remove('hidden');
      statusEl.textContent = '✅ Firma guardada';
      statusEl.className = 'bg-green-100 text-green-800 px-2 py-1 rounded text-xs';
    } else {
      statusEl.classList.add('hidden');
    }
  }
}

// Verificar estado de firma al cargar la página
function verificarEstadoFirma() {
  const firmaGuardada = localStorage.getItem('firmaGuardada') === 'true';
  const timestamp = localStorage.getItem('timestampFirma');
  
  if(firmaGuardada && timestamp) {
    const tiempoTranscurrido = Date.now() - parseInt(timestamp);
    const horasTranscurridas = tiempoTranscurrido / (1000 * 60 * 60);
    
    // Si han pasado menos de 24 horas, mostrar que hay firma guardada
    if(horasTranscurridas < 24) {
      mostrarEstadoFirma(true);
      console.log('Firma guardada detectada, tiempo transcurrido:', horasTranscurridas.toFixed(2), 'horas');
    } else {
      // Limpiar firma antigua
      localStorage.removeItem('firmaGuardada');
      localStorage.removeItem('timestampFirma');
      console.log('Firma antigua limpiada');
    }
  }
}
function resizeCanvas(c){
  // Guardar la firma ANTES de redimensionar
  const firmaActual = state.firmaPad && !state.firmaPad.isEmpty() ? state.firmaPad.toDataURL() : null;
  
  const rect = c.getBoundingClientRect();
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  
  // Establecer tamaño físico del canvas
  c.width = rect.width * ratio;
  c.height = 240 * ratio;
  
  // Establecer tamaño CSS
  c.style.width = rect.width + 'px';
  c.style.height = '240px';
  
  const ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
  
  // Configurar contexto para mejor calidad en móviles
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Restaurar la firma si existía
  if(firmaActual) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      // Reinicializar SignaturePad con la firma restaurada
      if(state.firmaPad) {
        state.firmaPad.clear();
        state.firmaPad.fromDataURL(firmaActual);
      }
    };
    img.src = firmaActual;
  }
  
  console.log('Canvas redimensionado:', c.width, 'x', c.height, 'ratio:', ratio);
}

// ===== SISTEMA DE BACKUP AUTOMÁTICO =====
function iniciarBackupAutomatico() {
  if(!state.cfg.backupAuto) return;
  
  const intervaloMs = (state.cfg.backupInterval || 24) * 60 * 60 * 1000; // Convertir horas a ms
  
  // Backup inmediato si han pasado más de 24 horas desde el último
  const ultimoBackup = localStorage.getItem('ultimoBackupAutomatico');
  const ahora = Date.now();
  if(!ultimoBackup || (ahora - parseInt(ultimoBackup)) > intervaloMs) {
    setTimeout(() => backupAutomatico(), 5000); // Esperar 5 segundos para que cargue la app
  }
  
  // Programar backups periódicos
  state.backupTimer = setInterval(() => {
    backupAutomatico();
  }, intervaloMs);
  
  console.log(`Backup automático configurado cada ${state.cfg.backupInterval} horas`);
}

async function backupAutomatico() {
  try {
    const allActas = await idbAll();
    if(allActas.length === 0) {
      console.log('No hay actas para hacer backup automático');
      return;
    }
    
    // Backup a localStorage
    await backupLocalStorage();
    
    // Backup a Excel si está configurado
    if(state.excelHandle || localStorage.getItem('excelMasterName')) {
      await appendToExcelMaster(allActas, { rebuildIfNoHandle: true });
    }
    
    // Backup incremental a la nube si está habilitado
    
    localStorage.setItem('ultimoBackupAutomatico', Date.now().toString());
    console.log(`✅ Backup automático completado: ${allActas.length} actas`);
    
    // Notificar al usuario solo si hay muchas actas nuevas
    const ultimaNotificacion = localStorage.getItem('ultimaNotificacionBackup');
    const ahora = Date.now();
    if(!ultimaNotificacion || (ahora - parseInt(ultimaNotificacion)) > 24 * 60 * 60 * 1000) {
      toast(`🔄 Backup automático: ${allActas.length} actas respaldadas`);
      localStorage.setItem('ultimaNotificacionBackup', ahora.toString());
    }
  } catch(error) {
    console.error('Error en backup automático:', error);
  }
}

async function backupManual() {
  try {
    $('#estado').textContent = 'Creando backup manual...';
    const allActas = await idbAll();
    
    if(allActas.length === 0) {
      toast('❌ No hay actas para respaldar');
      return;
    }
    
    // Backup múltiple
    await backupLocalStorage();
    await appendToExcelMaster(allActas, { rebuildIfNoHandle: true });
    
    // Backup a la nube si está habilitado
    
    // Backup JSON adicional
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      totalActas: allActas.length,
      actas: allActas
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_actas_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    localStorage.setItem('ultimoBackupAutomatico', Date.now().toString());
    toast(`✅ Backup manual completado: ${allActas.length} actas respaldadas`);
    $('#estado').textContent = `Backup manual completado: ${allActas.length} actas`;
  } catch(error) {
    console.error('Error en backup manual:', error);
    toast('❌ Error creando backup manual');
    $('#estado').textContent = 'Error en backup manual';
  }
}

async function backupLocalStorage() {
  try {
    const allActas = await idbAll();
    const backupData = {
      timestamp: Date.now(),
      version: '1.0',
      totalActas: allActas.length,
      actas: allActas
    };
    
    // Guardar en localStorage con compresión básica
    const compressed = JSON.stringify(backupData);
    localStorage.setItem('backupActas', compressed);
    localStorage.setItem('backupActasTimestamp', Date.now().toString());
    
    console.log(`Backup localStorage: ${allActas.length} actas guardadas`);
    return true;
  } catch(error) {
    console.error('Error en backup localStorage:', error);
    return false;
  }
}

async function restaurarBackup() {
  try {
    const backupData = localStorage.getItem('backupActas');
    if(!backupData) {
      toast('❌ No hay backup disponible en localStorage');
      return;
    }
    
    const confirmar = confirm('⚠️ ¿Estás seguro de que quieres restaurar el backup?\n\nEsta acción sobrescribirá todas las actas actuales.\nEsta acción NO se puede deshacer.');
    if(!confirmar) return;
    
    $('#estado').textContent = 'Restaurando backup...';
    
    const backup = JSON.parse(backupData);
    const actas = backup.actas || [];
    
    if(actas.length === 0) {
      toast('❌ El backup está vacío');
      return;
    }
    
    // Limpiar base de datos actual
    const tx = db.transaction(DB_STORE, 'readwrite');
    await new Promise((resolve, reject) => {
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    
    // Restaurar actas del backup
    for(const acta of actas) {
      await idbPut(acta);
    }
    
    await renderHistorial();
    toast(`✅ Backup restaurado: ${actas.length} actas recuperadas`);
    $('#estado').textContent = `Backup restaurado: ${actas.length} actas`;
  } catch(error) {
    console.error('Error restaurando backup:', error);
    toast('❌ Error restaurando backup');
    $('#estado').textContent = 'Error restaurando backup';
  }
}




async function simularSubidaNube(blob, filename) {
  // Simular subida a la nube
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Simulando subida a la nube: ${filename} (${blob.size} bytes)`);
      resolve();
    }, 2000);
  });
}

async function simularDescargaNube() {
  // Simular descarga desde la nube
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Simulando descarga desde la nube');
      resolve(null); // En implementación real devolvería los datos
    }, 1500);
  });
}

async function restaurarBackupDesdeNube(backupData) {
  try {
    const actas = backupData.actas || [];
    
    if(actas.length === 0) {
      toast('❌ El backup de la nube está vacío');
      return;
    }
    
    // Limpiar base de datos actual
    const tx = db.transaction(DB_STORE, 'readwrite');
    await new Promise((resolve, reject) => {
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    
    // Restaurar actas del backup
    for(const acta of actas) {
      await idbPut(acta);
    }
    
    await renderHistorial();
    toast(`✅ Backup restaurado desde la nube: ${actas.length} actas recuperadas`);
  } catch(error) {
    console.error('Error restaurando backup desde la nube:', error);
    toast('❌ Error restaurando backup desde la nube');
  }
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
    
    // Verificar que hay firma antes de generar PDF
    if(!state.firmaPad || state.firmaPad.isEmpty()) {
      // Intentar restaurar firma desde backup antes de fallar
      const firmaBackup = localStorage.getItem('firmaBackup');
      if(firmaBackup && firmaBackup.length > 1000) {
        const canvas = $('#pad');
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          if(state.firmaPad) {
            state.firmaPad.fromDataURL(firmaBackup);
          }
          console.log('Firma restaurada automáticamente antes de generar PDF');
        };
        img.src = firmaBackup;
      } else {
        throw new Error('⚠️ Debe firmar en el recuadro antes de generar el PDF');
      }
    }
    
    // Verificar si ya existe una acta similar (mismo cliente, misma fecha) para evitar duplicados
    const actaData = await buildActaJSON();
    const existingActas = await idbAll();
    const similarActa = existingActas.find(a => 
      a.cliente?.numeroContrato === actaData.cliente.numeroContrato &&
      a.cliente?.nit === actaData.cliente.nit &&
      a.visita?.fecha_local === actaData.visita.fecha_local
    );
    
    if(similarActa) {
      const confirmar = confirm(`⚠️ Ya existe una acta para este cliente (${actaData.cliente.numeroContrato}) en la misma fecha.\n\n¿Deseas generar una nueva acta de todas formas?`);
      if(!confirmar) {
        $('#estado').textContent = 'Generación de PDF cancelada';
        toast('Generación cancelada - ya existe una acta similar');
        return;
      }
    }
    
    const { blob, filename } = await buildPDF(actaData);
    state.ultimoPDFBlob = blob;
    actaData.archivos = { pdf_filename: filename };
    await idbPut(actaData);
    state.ultimoActa = actaData;
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
  
  // Capturar firma con mejor calidad para móviles
  let firmaPng;
  try {
    // Intentar con alta calidad primero
    firmaPng = state.firmaPad.toDataURL('image/png', { 
      quality: 1.0,
      pixelRatio: 2.0 
    });
    
    // Si la imagen es muy pequeña, intentar sin compresión
    if(firmaPng.length < 1000) {
      firmaPng = state.firmaPad.toDataURL('image/png');
    }
    
    console.log('Firma capturada, tamaño:', firmaPng.length, 'caracteres');
  } catch(e) {
    console.error('Error capturando firma:', e);
    throw new Error('Error al capturar la firma. Intenta firmar de nuevo.');
  }

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
      nombreEmpresa: $('#nombreEmpresa').value.trim(),
      numeroContrato: $('#numeroContrato').value.trim(),
      nit: $('#cliNit').value.trim(),
      actividadEconomica: $('#actividadEconomica').value.trim(),
      exencionContribucion: $('#exencionContribucion').value.trim(),
      fechaActualizacion: $('#fechaActualizacion').value.trim(),
      consumoKwh: $('#consumoKwh').value.trim(),
      tieneConsumoKvar: $('#tieneConsumoKvar').value.trim(),
      consumoKvar: $('#consumoKvar').value.trim(),
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
    reconquista: $('#reconquista').checked === true,
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
  addText(`Empresa: ${acta.cliente.nombreEmpresa}`);
  addText(`N° Contrato: ${acta.cliente.numeroContrato} | NIT: ${acta.cliente.nit}`);
  addText(`Actividad Económica: ${acta.cliente.actividadEconomica}`);
  addText(`Consumo de kWh: ${acta.cliente.consumoKwh || 'N/A'}`);
  const kvarTexto = acta.cliente.tieneConsumoKvar === 'Sí' && acta.cliente.consumoKvar 
    ? `${acta.cliente.tieneConsumoKvar} (${acta.cliente.consumoKvar} kVAR)` 
    : (acta.cliente.tieneConsumoKvar || 'N/A');
  addText(`Consumo de kVAR: ${kvarTexto}`);
  const exencionTexto = acta.cliente.exencionContribucion === 'Sí' && acta.cliente.fechaActualizacion 
    ? `${acta.cliente.exencionContribucion} (Fecha Actualización: ${acta.cliente.fechaActualizacion})` 
    : acta.cliente.exencionContribucion;
  addText(`Exención de Contribución: ${exencionTexto}`);
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

  // Reconquista
  if(acta.reconquista) {
    addText('TIPO DE VISITA', true);
    addText('🎯 VISITA DE RECONQUISTA');
    y += sectionSpacing;
  }

  // Observaciones
  addText('OBSERVACIONES GENERALES', true);
  addText(acta.observaciones || 'Ninguna');
  y += sectionSpacing;

  // Firma
  addText('FIRMA DEL CLIENTE', true);
  y += 10;
  
  const img = acta.firma.pngDataUrl;
  if(img && img.length > 100) { // Verificar que la imagen no esté vacía
    try{
      doc.addImage(img, 'PNG', L, y, 220, 80);
      console.log('Firma agregada al PDF correctamente');
    }catch(e){
      console.error('Error agregando firma al PDF:', e);
      addText('⚠️ Error al incluir la firma en el PDF');
    }
  } else {
    console.warn('Firma vacía o inválida:', img ? 'imagen muy pequeña' : 'sin imagen');
    addText('⚠️ Firma no capturada correctamente');
  }
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
  const statsEl = $('#historialStats');
  cont.innerHTML = '';
  
  const all = (await idbAll()).sort((a,b)=> (a.visita.fecha_utc < b.visita.fecha_utc ? 1 : -1));
  
  // Calcular estadísticas
  const totalActas = all.length;
  const duplicados = encontrarDuplicados(all);
  const actasUnicas = totalActas - duplicados.length;
  
  // Mostrar estadísticas
  statsEl.innerHTML = `
    <div class="flex justify-between items-center">
      <span><strong>Total:</strong> ${totalActas} actas</span>
      <span><strong>Únicas:</strong> ${actasUnicas}</span>
      <span class="text-orange-600"><strong>Duplicados:</strong> ${duplicados.length}</span>
    </div>
  `;
  
  all.forEach((a, index) => {
    const div = document.createElement('div');
    div.className='flex items-center gap-2 bg-white border rounded p-3';
    
    const empresaNombre = a.cliente?.nombreEmpresa || a.cliente?.razon || '-';
    const contactoNombre = a.contacto?.nombre || '-';
    const contrato = a.cliente?.numeroContrato || 'S/N';
    
    // Verificar si es duplicado
    const esDuplicado = duplicados.some(d => d.id === a.id);
    const duplicadoClass = esDuplicado ? 'border-orange-300 bg-orange-50' : '';
    
    div.innerHTML = `
      <div class="flex-1 ${duplicadoClass} p-2 rounded">
        <div class="font-medium flex items-center gap-2">
          ${a.id} – ${empresaNombre}
          ${esDuplicado ? '<span class="text-xs bg-orange-200 text-orange-800 px-1 rounded">DUPLICADO</span>' : ''}
          ${a.reconquista ? '<span class="text-xs bg-blue-200 text-blue-800 px-1 rounded">🎯 RECONQUISTA</span>' : ''}
        </div>
        <div class="text-xs text-slate-500">${a.visita.fecha_local} | ${contactoNombre} | Contrato: ${contrato}</div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-xs" data-id="${a.id}" data-act="share" title="Compartir PDF">📤</button>
        <button class="btn btn-xs btn-outline" data-id="${a.id}" data-act="excel" title="Añadir a Excel">📊</button>
        <button class="btn btn-xs bg-red-100 text-red-600 hover:bg-red-200" data-id="${a.id}" data-act="delete" title="Eliminar acta">🗑️</button>
      </div>
    `;
    
    div.addEventListener('click', async (ev)=>{
      const btn = ev.target.closest('button'); 
      if(!btn) return;
      
      const id = btn.dataset.id; 
      const act = btn.dataset.act;
      
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
      if(act==='delete'){
        const confirmar = confirm(`¿Estás seguro de que quieres eliminar la acta ${id}?\n\nEmpresa: ${empresaNombre}\nEsta acción no se puede deshacer.`);
        if(confirmar) {
          await eliminarActaPorId(id);
          await renderHistorial(); // Recargar historial
          toast(`✅ Acta ${id} eliminada`);
        }
      }
    });
    cont.appendChild(div);
  });
}

// Función para encontrar duplicados
function encontrarDuplicados(actas) {
  const duplicados = [];
  const seen = new Set();
  
  for(const acta of actas) {
    const contentHash = `${acta.cliente?.numeroContrato||''}_${acta.cliente?.nit||''}_${acta.visita?.fecha_local||''}`;
    if(seen.has(contentHash)) {
      duplicados.push(acta);
    } else {
      seen.add(contentHash);
    }
  }
  
  return duplicados;
}

// Función para eliminar una acta específica
async function eliminarActaPorId(id) {
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    await new Promise((resolve, reject) => {
      const request = tx.objectStore(DB_STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch(error) {
    console.error('Error eliminando acta:', error);
    throw error;
  }
}

// Función para limpiar todo el historial
async function limpiarHistorialCompleto() {
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    await new Promise((resolve, reject) => {
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    toast('✅ Historial completamente limpiado');
    await renderHistorial();
  } catch(error) {
    console.error('Error limpiando historial:', error);
    toast('❌ Error limpiando historial');
  }
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
      'nombre_empresa','numero_contrato','nit','actividad_economica','consumo_kwh','tiene_consumo_kvar','consumo_kvar','exencion_contribucion','fecha_actualizacion',
      'contacto_nombre','contacto_cargo','contacto_correo','contacto_celular',
      'tema_energia_eficiente','desc_energia_eficiente',
      'tema_conexion_emcali','desc_conexion_emcali',
      'tema_etiqueta_retiq','desc_etiqueta_retiq',
      'tema_ahorro_energia','desc_ahorro_energia',
      'tema_consumo_energia','desc_consumo_energia',
      'incidencias_variaciones','incidencias_variaciones_cant','incidencias_cortes','incidencias_cortes_cant',
      'observaciones','reconquista','firmante_nombre',
      'geo_lat','geo_lng','hash_sha256','pdf_filename'
    ]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Actas');
  }
  return wb.Sheets;
}

function mergeRowsIntoSheets(wb, actas){
  const wsA = wb.Sheets['Actas'];
  const rangeA = XLSX.utils.decode_range(wsA['!ref'] || 'A1:A1');

  // Build existing IDs set para anti-duplicados (por ID exacto)
  const existingIds = new Set();
  // Build existing content set para anti-duplicados (por contenido similar)
  const existingContent = new Set();
  
  for(let R=1; R<=rangeA.e.r; R++){
    const cell = wsA[XLSX.utils.encode_cell({c:0,r:R})];
    if(cell && cell.v) existingIds.add(String(cell.v));
    
    // Crear un hash del contenido para detectar duplicados por contenido
    const contratoCell = wsA[XLSX.utils.encode_cell({c:9,r:R})]; // numero_contrato
    const nitCell = wsA[XLSX.utils.encode_cell({c:10,r:R})]; // nit
    const fechaCell = wsA[XLSX.utils.encode_cell({c:1,r:R})]; // fecha_local
    
    if(contratoCell && nitCell && fechaCell) {
      const contentHash = `${contratoCell.v}_${nitCell.v}_${fechaCell.v}`;
      existingContent.add(contentHash);
    }
  }

  let rowsA = [];
  let duplicatesSkipped = 0;

  for(const a of actas){
    // Verificar duplicado por ID exacto
    if(existingIds.has(a.id)) {
      console.log(`Saltando acta duplicada por ID: ${a.id}`);
      duplicatesSkipped++;
      continue;
    }
    
    // Verificar duplicado por contenido similar
    const contentHash = `${a.cliente?.numeroContrato||''}_${a.cliente?.nit||''}_${a.visita?.fecha_local||''}`;
    if(existingContent.has(contentHash)) {
      console.log(`Saltando acta duplicada por contenido: ${a.cliente?.numeroContrato} - ${a.cliente?.nit} - ${a.visita?.fecha_local}`);
      duplicatesSkipped++;
      continue;
    }
    
    // Agregar a los sets para evitar duplicados en el mismo lote
    existingIds.add(a.id);
    existingContent.add(contentHash);
    
    rowsA.push([
      a.id,
      a.visita?.fecha_local||'',
      a.visita?.fecha_utc||'',
      a.ejecutivo?.nombre||'',
      a.ejecutivo?.correo||'',
      a.ubicacion?.zona||'',
      a.ubicacion?.barrio||'',
      a.ubicacion?.direccion||'',
      a.cliente?.nombreEmpresa||'',
      a.cliente?.numeroContrato||'',
      a.cliente?.nit||'',
      a.cliente?.actividadEconomica||'',
      a.cliente?.consumoKwh||'',
      a.cliente?.tieneConsumoKvar||'',
      a.cliente?.consumoKvar||'',
      a.cliente?.exencionContribucion||'',
      a.cliente?.fechaActualizacion||'',
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
      a.reconquista ? 'Sí' : 'No',
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

  // Informar sobre duplicados encontrados
  if(duplicatesSkipped > 0) {
    console.log(`Se saltaron ${duplicatesSkipped} actas duplicadas`);
  }

  // Ajuste de rango
  const totalCols = 43; // Número de columnas (agregadas: consumo_kwh, tiene_consumo_kvar, consumo_kvar, fecha_actualizacion, reconquista)
  wsA['!ref'] = wsA['!ref'] || `A1:${XLSX.utils.encode_col(totalCols-1)}${1+rowsA.length}`;
}

