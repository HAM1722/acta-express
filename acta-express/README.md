# Acta Express - Fidelización Emcali (PWA 100% local)

**Aplicación PWA para generar actas de visita de fidelización con firma electrónica, PDF y Excel maestro**

---

## 📋 Descripción

**Acta Express** es una Progressive Web App (PWA) diseñada específicamente para ejecutivos de campo de Emcali que necesitan documentar visitas de fidelización con clientes. La aplicación incluye:

- ✅ Formulario estructurado para visitas de fidelización
- ✅ Captura de datos del ejecutivo y ubicación (zona, barrio, dirección)
- ✅ Datos completos del cliente/negocio (contrato, NIT, actividad económica)
- ✅ Registro de temas tratados con el cliente (energía eficiente, RETIQ, etc.)
- ✅ Registro de incidencias (variaciones, cortes de suministro)
- ✅ Firma manuscrita en pantalla (touch/stylus)
- ✅ Generación de PDF profesional con QR y hash SHA-256
- ✅ Compartir directo a Outlook/WhatsApp
- ✅ Historial local en IndexedDB
- ✅ Exportación a Excel maestro con 32 columnas
- ✅ Modo offline (una vez instalada como PWA)
- ✅ Geolocalización opcional

---

## 🗂️ Estructura de archivos

```
acta-express/
├─ index.html              # UI principal
├─ app.js                  # Lógica completa
├─ dashboard.html          # Dashboard de análisis
├─ dashboard.js            # Lógica del dashboard
├─ styles.css              # Estilos móviles
├─ manifest.webmanifest    # Configuración PWA
├─ service-worker.js       # Cache offline
├─ icon-192.png            # Ícono PWA 192x192
├─ icon-512.png            # Ícono PWA 512x512
├─ Actas_Master (3).xlsx   # Ejemplo de Excel maestro
└─ README.md               # Este archivo
```

---

## 🚀 Instalación rápida

### Opción 1: Servidor local (localhost)

```powershell
# En PowerShell, desde la carpeta acta-express:
python -m http.server 8000
```

Luego abre en tu navegador:
```
http://localhost:8000
```

### Opción 2: Hosting estático (recomendado para PWA completa)

Sube los archivos a:
- **GitHub Pages** (gratuito, HTTPS automático)
- **Netlify** (gratuito, HTTPS, drag & drop)
- **Vercel** (gratuito, HTTPS)
- Tu servidor con HTTPS

> ⚠️ **Importante:** Para que funcione como PWA instalable y offline, necesitas **HTTPS** o **localhost**.

---

## 📱 Uso en Android (instalación PWA)

1. Abre la URL en **Chrome para Android**
2. Toca el menú (⋮) → **Agregar a pantalla de inicio**
3. La app se instalará como aplicación nativa
4. Ábrela desde el launcher de Android

---

## 🎯 Guía de uso

### 1️⃣ Configuración inicial

1. Abre la app
2. En la sección **Configuración**:
   - Ingresa tu nombre (Ejecutivo)
   - Ingresa tu correo corporativo
   - (Opcional) Activa **geolocalización** para incluir coordenadas GPS
3. Clic en **Guardar configuración**

### 2️⃣ Configurar Excel maestro (opcional)

**Opción A - Android/Chrome con File System Access:**
1. Clic en **Elegir/crear Excel maestro**
2. Selecciona o crea el archivo `Actas_Master.xlsx`
3. La app podrá agregar registros directamente al archivo

**Opción B - Modo regenerado (todos los navegadores):**
- Si no configuras el Excel, cada vez que guardes se descargará un archivo completo actualizado
- Simplemente sobrescribe el anterior con el mismo nombre

### 3️⃣ Crear una nueva acta

1. **Completa los datos del ejecutivo y ubicación:**
   - Zona (Norte, Sur, Centro, etc.)
   - Barrio
   - Dirección completa

2. **Datos del Cliente/Negocio:**
   - Número de Contrato
   - NIT
   - Actividad Económica
   - Exención de Contribución (Sí/No)

3. **Datos de la Persona Encargada:**
   - Nombre del contacto
   - Cargo
   - Correo electrónico
   - Celular

4. **Temas Tratados con el Cliente:**
   - Marca los temas que se trataron durante la visita y describe cada uno:
     - ☑ Energía eficiente → (campo de texto para descripción)
     - ☑ Conexión directa con Emcali → (campo de texto para descripción)
     - ☑ Etiqueta RETIQ → (campo de texto para descripción)
     - ☑ Ahorro de energía → (campo de texto para descripción)
     - ☑ Consumo de energía → (campo de texto para descripción)

5. **Incidencias:**
   - ¿Ha tenido variaciones y fluctuaciones? (Sí/No)
     - Si es Sí, indica cuántas
   - ¿Ha tenido cortes de suministro de energía? (Sí/No)
     - Si es Sí, indica cuántas

6. **Observaciones Generales:**
   - Describe cualquier observación adicional de la visita

7. **Firma del cliente:**
   - El cliente firma con el dedo en el recuadro blanco
   - Si se equivoca, clic en **Limpiar**
   - Ingresa nombre del firmante

8. Marca el **checkbox de consentimiento**

9. Clic en **Generar PDF**

### 4️⃣ Compartir el acta

**Opción 1 - Descarga automática:**
1. Clic en **Compartir (Outlook)**
2. El PDF se descarga automáticamente
3. Adjúntalo manualmente en tu correo

**Opción 2 - Web Share (bonus):**
- Si tu dispositivo lo soporta, se abrirá el menú de compartir nativo
- Selecciona la app (Outlook, Gmail, WhatsApp, etc.)

### 5️⃣ Actualizar Excel maestro

**Guardar todas las actas:**
- Clic en **Actualizar Excel maestro**
- Se generará/actualizará el archivo con la hoja **Actas** (37 columnas)

**Guardar una sola acta:**
- En el **Historial**, clic en **Añadir a Excel** junto a la acta deseada

### 6️⃣ Consultar historial

- Todas las actas se guardan en el dispositivo (IndexedDB)
- Desde el historial puedes:
  - **Compartir** cualquier acta anterior
  - **Añadir a Excel** actas individuales

---

## 📊 Estructura del Excel maestro

### Hoja "Actas" (37 columnas)

| # | Columna | Descripción |
|---|---------|-------------|
| 1 | id_acta | ID único (ej: AX-20251011203045) |
| 2 | fecha_local | Fecha/hora local del dispositivo |
| 3 | fecha_utc | Fecha/hora UTC (ISO 8601) |
| 4 | ejecutivo_nombre | Nombre del ejecutivo |
| 5 | ejecutivo_correo | Correo del ejecutivo |
| 6 | zona | Zona de la visita |
| 7 | barrio | Barrio |
| 8 | direccion | Dirección completa |
| 9 | numero_contrato | Número de contrato del cliente |
| 10 | nit | NIT del cliente |
| 11 | actividad_economica | Actividad económica del negocio |
| 12 | exencion_contribucion | Exención de contribución (Sí/No) |
| 13 | contacto_nombre | Nombre de la persona encargada |
| 14 | contacto_cargo | Cargo del contacto |
| 15 | contacto_correo | Correo del contacto |
| 16 | contacto_celular | Celular del contacto |
| 17 | tema_energia_eficiente | Se trató energía eficiente (Sí/No) |
| 18 | desc_energia_eficiente | Descripción del tema energía eficiente |
| 19 | tema_conexion_emcali | Se trató conexión con Emcali (Sí/No) |
| 20 | desc_conexion_emcali | Descripción del tema conexión Emcali |
| 21 | tema_etiqueta_retiq | Se trató etiqueta RETIQ (Sí/No) |
| 22 | desc_etiqueta_retiq | Descripción del tema etiqueta RETIQ |
| 23 | tema_ahorro_energia | Se trató ahorro de energía (Sí/No) |
| 24 | desc_ahorro_energia | Descripción del tema ahorro de energía |
| 25 | tema_consumo_energia | Se trató consumo de energía (Sí/No) |
| 26 | desc_consumo_energia | Descripción del tema consumo de energía |
| 27 | incidencias_variaciones | Tuvo variaciones (Sí/No/vacío) |
| 28 | incidencias_variaciones_cant | Cantidad de variaciones |
| 29 | incidencias_cortes | Tuvo cortes (Sí/No/vacío) |
| 30 | incidencias_cortes_cant | Cantidad de cortes |
| 31 | observaciones | Observaciones generales |
| 32 | firmante_nombre | Nombre del firmante |
| 33 | geo_lat | Latitud (si geo está activo) |
| 34 | geo_lng | Longitud (si geo está activo) |
| 35 | hash_sha256 | Hash SHA-256 de verificación |
| 36 | pdf_filename | Nombre del archivo PDF |

---

## 🔐 Seguridad y validación

### Hash SHA-256
Cada acta incluye un hash criptográfico que:
- Se calcula sobre todos los datos (excepto la imagen de firma)
- Aparece en el PDF
- Se incluye en el código QR
- Permite verificar que el documento no fue alterado

### Código QR
Contiene:
```json
{
  "id": "AX-20251011203045",
  "hash": "base64_hash_sha256"
}
```

### Firma manuscrita
- Se captura como imagen PNG (base64)
- Se incluye en el PDF y en el historial
- No sustituye firma electrónica avanzada certificada

---

## 🛠️ Personalización

### Modificar temas a tratar
Edita en `index.html` (líneas ~127-150) para agregar o modificar los checkboxes:
```html
<label class="flex items-center gap-2 text-sm">
  <input type="checkbox" id="temaPersonalizado" class="accent-sky-600" />
  <span>Tu tema personalizado</span>
</label>
```

Luego actualiza `app.js` en la función `buildActaJSON()` para capturar el nuevo campo.

### Agregar logo al PDF
Edita `app.js`, en la función `buildPDF()`, después de la línea del encabezado (línea ~297):
```javascript
// Después de doc.text('ACTA DE VISITA...', L, T);
const logoImg = 'data:image/png;base64,TU_LOGO_BASE64...';
doc.addImage(logoImg, 'PNG', 420, 30, 100, 40); // Ajusta posición/tamaño
```

### Cambiar colores
Edita `styles.css`:
```css
:root{ 
  --sky:#0ea5e9;  /* Color principal (azul cielo) */
  --ink:#0f172a;  /* Color texto oscuro */
}
```

O en `manifest.webmanifest`:
```json
"theme_color": "#0ea5e9"  /* Color de barra en Android */
```

---

## 🧪 Requisitos técnicos

### Navegador recomendado
- **Chrome/Edge** (Android/Desktop): Soporte completo
- **Safari** (iOS): Funciona, pero File System Access limitado
- **Firefox**: Funciona, sin File System Access

### Funcionalidades por navegador

| Función | Chrome Android | Safari iOS | Edge Desktop |
|---------|:--------------:|:----------:|:------------:|
| Formulario | ✅ | ✅ | ✅ |
| Firma táctil | ✅ | ✅ | ✅ |
| Generar PDF | ✅ | ✅ | ✅ |
| Web Share API | ✅ | ✅ | ⚠️ |
| Instalar PWA | ✅ | ✅ | ✅ |
| Offline (SW) | ✅ | ⚠️ | ✅ |
| Excel Append | ✅ | ❌ | ✅ |
| Excel Regenerado | ✅ | ✅ | ✅ |

✅ Completo | ⚠️ Parcial | ❌ No soportado

---

## 📦 Dependencias (CDN)

La app usa estas librerías vía CDN (no requiere npm/instalación):

- **Tailwind CSS** - Estilos utility-first
- **Signature Pad** - Captura de firma manuscrita
- **jsPDF** - Generación de PDF en cliente
- **QRCode.js** - Códigos QR
- **SheetJS (xlsx)** - Lectura/escritura Excel

> 💡 Si quieres que funcione 100% offline sin internet, descarga las librerías localmente y actualiza las rutas en `index.html` y `service-worker.js`.

---

## 🐛 Solución de problemas

### "La firma no se captura bien"
- Asegúrate de firmar dentro del recuadro blanco
- Usa el dedo o stylus, no el cursor del mouse en mobile
- Si la línea es muy delgada, aumenta el grosor en `app.js`:
  ```javascript
  state.firmaPad = new SignaturePad(canvas, { 
    backgroundColor: 'rgb(255,255,255)',
    penColor: 'rgb(0,0,0)',
    minWidth: 1.5,
    maxWidth: 3
  });
  ```

### "No se instala como PWA"
- Verifica que estés usando HTTPS o localhost
- En Chrome Android: Menú → Agregar a pantalla de inicio
- Asegúrate de tener los iconos en `/assets/`

### "El Excel no se actualiza directamente"
- El modo "Append directo" solo funciona en Chrome/Edge con File System Access API
- En otros casos, usa el modo "regenerado" (descarga y sobrescribe)

### "El PDF no se comparte"
- Si Web Share no funciona, el PDF se descarga
- Adjúntalo manualmente desde tu app de correo

### "No funciona offline"
- Primero debes acceder online para que se instale el Service Worker
- Verifica en Chrome DevTools → Application → Service Workers
- Comprueba que las rutas en `service-worker.js` sean correctas

---

## 📌 Notas legales

### Acuse de recibido simple
Esta solución genera **acuse de recibido documental** con:
- Firma manuscrita digital
- Hash SHA-256 de verificación
- Timestamp local y UTC
- Código QR con datos de verificación

### No es firma electrónica avanzada
Este sistema **NO sustituye** servicios de firma electrónica avanzada/cualificada según normativas locales (ej: eIDAS en UE, Ley 527 en Colombia).

Para firmas con validez legal plena, integra servicios certificados como:
- DocuSign, Adobe Sign, SignNow
- Certicámara (Colombia), EDICOM, etc.

### Privacidad y almacenamiento
- Todos los datos se almacenan **localmente** en el dispositivo (IndexedDB)
- No hay servidor backend ni transmisión de datos
- El usuario es responsable de la seguridad del dispositivo

---

## 🚦 Próximos pasos sugeridos

1. **Agregar tus iconos** personalizados (192x192 y 512x512 px) reemplazando los existentes
2. **Personalizar el logo de Emcali** en el PDF
3. **Ajustar los temas a tratar** según necesidades específicas
4. **Probar en Android** con casos reales de visitas de fidelización
5. **Subir a GitHub Pages o Netlify** para HTTPS y acceso remoto
6. **Capacitar al equipo** en el uso de la app
7. **Integrar con dashboard** para análisis de datos (archivo dashboard.html incluido)

---

## 📞 Soporte

Para personalizaciones adicionales o integración con sistemas empresariales:
- Bases de datos backend (Firebase, Supabase)
- API REST para sincronización
- Firma electrónica certificada
- Personalización de plantillas PDF
- Módulos adicionales (fotos, audios, geofencing)

---

## 📄 Licencia

Este código es un prototipo funcional. Úsalo y modifícalo según tus necesidades.

---

**¡Listo para capturar actas en campo! 🚀**

