# D.2a · Consulta de conflictos de tres vías

23/10/2026 · desarrollo 0.4.2, cambios sobre `d04d479` sin nueva publicación. Primer incremento de D.2: visor, no editor ni cierre de RG-06.

## Uso y alcance

En **Cambios**, seleccionar un archivo en conflicto y pulsar **Consultar conflicto…**. Muestra las etapas del índice **Base (1), Local (2), Entrante (3)** y hashes abreviados. En rebase, local suele ser el destino y entrante el commit reaplicado: no se identifican automáticamente con «mi rama/su rama».

- Sólo lectura: no guarda un resultado, prepara, hace commit, continúa ni aborta operaciones.
- Etapas ausentes (altas/eliminaciones) se distinguen de archivos vacíos. Nombres Unicode y espacios se tratan como rutas literales.
- Binarios con NUL, texto no UTF-8 y versiones mayores de 512 KiB muestran una restricción, sin conversión con pérdida ni truncado. Enlaces/submódulos/tipos especiales muestran sólo metadatos. Hasta tres versiones textuales, 1,5 MiB de contenido total.
- Lee blobs por hash del índice, sin filtros, textconv ni reemplazos de objetos. Reutiliza procesos acotados y no descarga objetos ausentes automáticamente.
- Requiere confianza vigente y token de Cambios coincidente antes/después. Si el estado cambió, se rechaza la consulta y se pide actualizar. No promete aislamiento frente a procesos externos.
- El diálogo permite cerrar incluso durante carga, descarta respuestas antiguas y devuelve el foco al control anterior. Columnas adaptables y contenido desplazable con teclado.

El archivo de trabajo/resultado no se presenta como una cuarta versión ni se modifica. Edición, guardado seguro con precondiciones/respaldo y preparación explícita quedan para D.2b. La recuperación/continuación sigue usando los flujos actuales o Git externo según la operación.

## Verificación

- Fixtures Rust temporales con merge real: tres etapas y token intacto; add/add sin base; modify/delete sin lado local; confianza, estado obsoleto y ruta inválida; binarios/no UTF-8; tamaño máximo; tipo enlace sólo metadatos.
- UI con IPC simulado: tres versiones, etapas ausentes/vacías/restringidas, error sin reintento, cierre durante carga/Escape, foco y respuesta obsoleta. Integración desde Cambios manteniendo bloqueada la preparación.
- Windows: **6 pruebas Rust focalizadas**, **16 UI focalizadas** y suite UI completa **218 pruebas / 24 archivos** aprobadas; TypeScript/Vite, Clippy all-targets con `-D warnings`, Rustfmt, Prettier y `git diff --check` aprobados. No se repitió toda la suite Rust. Un intento de enlace falló porque la ejecución anterior aún mantenía abierto el binario de pruebas; se repitió después de que terminara, sin finalizar procesos del usuario.
- Build Windows debug sin bundle aprobado: `src-tauri/target/debug/ravengit.exe`. No se ejecutó recorrido visual/nativo del nuevo visor ni se generó instalador.

No se operó sobre repositorios del usuario. Quedan pendientes aceptación visual/nativa Windows/macOS, lectores de pantalla y conflictos de rebase/replay/Stash en recorridos reales. Las fixtures de merge no certifican todas las operaciones ni un editor de resolución.
