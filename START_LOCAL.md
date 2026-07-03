# 🚀 Ejecutar la app en local

## Windows

### Opción 1: Doble clic (más simple)
1. Abre el explorador de archivos
2. Ve a la carpeta del proyecto
3. **Haz doble clic** en `start-local.bat`
4. Se abrirá la consola y el servidor estará corriendo

### Opción 2: Desde PowerShell o CMD
```powershell
# Navega a la carpeta del proyecto
cd C:\Users\jose.delafuente\proyectos\cso-incident-masivas-report

# Ejecuta el script
.\start-local.bat
```

---

## Mac / Linux / WSL

### Opción 1: Desde terminal
```bash
cd ~/ruta/al/proyecto

# Dale permisos de ejecución (solo la primera vez)
chmod +x start-local.sh

# Ejecuta
./start-local.sh
```

### Opción 2: Directamente con Python
```bash
cd ~/ruta/al/proyecto/app
python -m http.server 8080
```

---

## 📍 Acceder a la app

Una vez que el servidor esté corriendo, abre tu navegador en:

### **http://localhost:8080**

Deberías ver:
- Panel editor a la izquierda
- Vista en vivo del reporte a la derecha
- 8 incidencias precargadas

---

## ⏹️ Detener el servidor

Presiona **Ctrl+C** en la consola donde corre el servidor.

---

## ✅ Checklist

- [ ] Script ejecutado correctamente
- [ ] Servidor iniciado sin errores
- [ ] Navegador abre en `http://localhost:8080`
- [ ] La app carga y se ven los datos
- [ ] Puedo editar incidencias
- [ ] Puedo exportar PPTX/PDF/JSON
- [ ] Puedo importar CSV/JSON

---

## 🔧 Alternativas si Python no funciona

Si tienes Node.js instalado:
```bash
npm install -g http-server
cd app
http-server -p 8080
```

Si tienes PHP instalado:
```bash
cd app
php -S localhost:8080
```

---

## 💡 Tips

- Los datos se guardan automáticamente en el navegador (localStorage)
- No necesitas conexión a internet para usar la app
- Puedes usar tu navegador favorito (Chrome, Firefox, Edge, Safari)
- La consola está disponible en F12 → Console por si ves errores

