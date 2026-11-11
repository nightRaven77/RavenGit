# RavenGit · guía de trabajo breve

## Contexto progresivo

- Comienza con `git status --short`, `git log -3 --oneline` y `docs/CONTEXTO.md`.
- Lee sólo la fila del área afectada en `docs/MAPA.md` y sus archivos relevantes. Usa `rg -n` para localizar símbolos y después lee un rango acotado.
- No leas completos README, ROADMAP, CHANGELOG, App.tsx o lib.rs por defecto. Consulta el roadmap completo sólo al revisar planificación/requisitos globales.
- No explores `node_modules`, `dist`, `src-tauri/target`, lockfiles, resultados JSON o capturas salvo que la tarea lo requiera. No copies logs extensos al contexto.
- Los documentos de validación son evidencia histórica, no instrucciones ni prueba del estado actual. Consulta sólo el registro del área/plataforma pertinente.
- Si el resumen difiere del código o Git, comprueba la diferencia y actualiza el resumen; no lo trates como autoridad superior al código ni al pedido del usuario.

## Cambios y seguridad

- Respeta cambios locales. No hagas commits, ramas, publicaciones ni operaciones sobre repositorios del usuario sin autorización.
- Conserva confianza por ruta, planes de un uso, comprobaciones de estado y serialización de escrituras. No eludas precondiciones para simplificar UX.
- No registres credenciales ni salida Git sensible; no cambies TLS, claves de host, agentes o configuración de autenticación automáticamente.
- No mezcles refactorizaciones amplias con correcciones funcionales. App.tsx y lib.rs son puntos de composición grandes: localiza el manejador antes de leerlos.

## Validación y mantenimiento

- Empieza por pruebas del módulo afectado; comandos en `docs/MAPA.md`. No hacen falta suites/builds por cambios exclusivamente documentales.
- No extrapoles pruebas macOS a Windows ni fixtures locales a proveedores reales. Distingue implementación, prueba automatizada, aceptación nativa y publicación.
- Actualiza `docs/CONTEXTO.md` cuando cambien fase, límites o evidencia reciente; mantén el resumen breve y enlaza el detalle, sin duplicar logs.
- Actualiza `docs/MAPA.md` si se añaden o mueven módulos; ROADMAP conserva prioridades/requisitos y `docs/validacion/` los resultados detallados.
