# 🚀 Guía de Despliegue en GitHub Pages

## Pasos para publicar Acta Express como PWA

### 1️⃣ Crear repositorio en GitHub

```powershell
# Inicializar repositorio local (si aún no está inicializado)
git init

# Agregar todos los archivos
git add .

# Commit inicial
git commit -m "feat: Initial commit - Acta Express PWA completa"

# Conectar con repositorio remoto (crea uno en github.com primero)
git remote add origin https://github.com/TU_USUARIO/acta-express.git

# Subir a GitHub
git branch -M main
git push -u origin main
```

### 2️⃣ Activar GitHub Pages

1. Ve a tu repositorio en GitHub
2. Settings → Pages
3. Source: selecciona la rama `main` y carpeta `/ (root)`
4. Save
5. Espera 1-2 minutos

Tu app estará disponible en:
```
https://TU_USUARIO.github.io/acta-express/
```

### 3️⃣ Verificar PWA

1. Abre la URL en Chrome (móvil o desktop)
2. DevTools → Application → Manifest (verificar que cargue)
3. DevTools → Application → Service Workers (verificar que esté activo)
4. En Android: Chrome → Menú → **Agregar a pantalla de inicio**

### 4️⃣ Actualizar despliegue

```powershell
# Hacer cambios en el código
git add .
git commit -m "feat: Descripción del cambio"
git push origin main
```

GitHub Pages se actualizará automáticamente en 1-2 minutos.

---

## ⚡ Alternativas de despliegue

### Netlify (más fácil)
1. Arrastra la carpeta del proyecto en [netlify.com/drop](https://app.netlify.com/drop)
2. HTTPS automático
3. URL tipo: `tu-proyecto.netlify.app`

### Vercel
```powershell
npx vercel
```

---

## ✅ Checklist de PWA

- [ ] HTTPS activado (GitHub Pages lo hace automático)
- [ ] `manifest.webmanifest` enlazado en `index.html`
- [ ] Service Worker registrado en `app.js`
- [ ] Íconos 192x192 y 512x512 presentes
- [ ] Probado en Chrome móvil
- [ ] Instalación funciona correctamente
- [ ] Modo offline funciona (desconectar WiFi y probar)

---

## 🐛 Solución de problemas

### Service Worker no se activa
- Verifica que la URL sea HTTPS (o localhost)
- Abre DevTools → Application → Service Workers
- Click en "Unregister" y recarga
- Verifica la consola por errores

### PWA no se puede instalar
- Verifica que `manifest.webmanifest` tenga todos los campos
- Íconos deben existir y ser accesibles
- start_url debe apuntar correctamente

### Offline no funciona
- Verifica que el Service Worker esté instalado
- Revisa las rutas en `ASSETS` del service-worker.js
- Prueba con "Application → Cache Storage" en DevTools

---

**¡Listo! Tu PWA Acta Express estará funcionando en producción.** 🎉

