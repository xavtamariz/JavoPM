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
- Sin backend, sin login y sin cifrado por ahora.

## Uso local

Abre `index.html` desde un servidor local. Por ejemplo:

```bash
python3 -m http.server 4173
```

Luego entra a `http://localhost:4173`.
