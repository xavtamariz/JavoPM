# JavoPM

JavoPM es una primera versión local-first de un tablero Kanban para gestionar tareas tipo Jira/Trello.

## Características

- HTML, CSS y JavaScript vanilla.
- Persistencia local con IndexedDB.
- Columnas default: Congelados, Por Hacer, En Progreso, Desarrollado, En Verificación y Completado.
- Tarjetas con descripción corta, proyecto, tipo, folio, fechas, puntos y responsable.
- Modal editable por tarea.
- Descripción larga con edición básica.
- Checklists dinámicas con items editables, completables y eliminables.
- Modo anónimo local sin cuenta.
- Arquitectura opcional de cuenta owner y sincronización con Supabase para v1.7.0.

## Uso local

Abre `index.html` desde un servidor local. Por ejemplo:

```bash
python3 -m http.server 4173
```

Luego entra a `http://localhost:4173`.

## Supabase opcional

JavoPM sigue funcionando 100% local si `window.JAVOPM_CONFIG` no tiene credenciales.
Para activar cuentas y sync cloud:

1. Crea o elige un proyecto Supabase.
2. Aplica `schema/001_account_cloud_sync.sql`.
3. En Supabase Dashboard > Authentication > URL Configuration:
   - Site URL: `https://javo-pm.onrender.com`
   - Redirect URLs: `https://javo-pm.onrender.com/**`, `http://localhost:4173/**` y `http://127.0.0.1:4173/**`
4. Configura la app antes de cargar `app.js`:

```html
<script>
  window.JAVOPM_CONFIG = {
    supabaseUrl: "https://TU-PROYECTO.supabase.co",
    supabaseAnonKey: "TU_ANON_KEY"
  };
</script>
```

No uses la `service_role` key en el navegador.
