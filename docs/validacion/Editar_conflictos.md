# D.2b · Edición y guardado de resolución

23/10/2026 · desarrollo 0.4.2, cambios locales sobre `d04d479` junto al visor D.2a. Sin nueva publicación. Amplía [la consulta](Consulta_conflictos.md); no cierra RG-06 ni toda la fase D.

## Recorrido

1. Cambios → archivo en conflicto → **Consultar conflicto…** → **Editar resultado…**.
2. Se carga el archivo de trabajo actual en **Resultado de la resolución**. Las tres etapas del índice siguen siendo de sólo lectura. **Usar base/local/entrante** sustituye el borrador completo, no combina automáticamente bloques.
3. Editar, retirar marcadores y marcar la autorización explícita. Cualquier edición posterior invalida la confirmación.
4. **Guardar resolución con respaldo** reemplaza sólo el archivo de trabajo. Muestra la ubicación del respaldo persistente; cerrar refresca Cambios.
5. El índice conserva sus etapas sin resolver. Preparar/continuar sigue siendo una decisión separada en los flujos de recuperación existentes o Git externo según operación. No se hace commit, stage, continuación ni aborto automático.

El borrador vive sólo en memoria. Cerrar/Escape con cambios pide descartarlo; durante guardado se bloquean cierre/doble envío y navegación de escritura. Los errores conservan el texto y consumen la revisión: no se reintenta automáticamente. Si cambió el estado, conservar el texto antes de cerrar/actualizar y volver a revisar. No hay persistencia del borrador tras cerrar la app o un fallo del proceso.

## Alcance conservador

- Tres etapas regulares, textuales UTF-8, cada una hasta 512 KiB; archivo de trabajo existente, regular, escribible y hasta 512 KiB.
- Altas/eliminaciones con etapas ausentes, enlaces, submódulos, binarios y codificaciones no UTF-8 siguen siendo de consulta/resolución externa.
- Se conservan finales LF o CRLF uniformes y la decisión explícita de salto final. Finales mezclados/CR aislado se rechazan. El resultado vuelve a validarse por bytes tras convertir CRLF.
- Se bloquean NUL, resultado sin cambios, exceso de tamaño y líneas de marcadores `<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`. Es una protección conservadora, no una verificación semántica; texto legítimo con esos patrones requiere editor externo.

## Precondiciones y respaldo

- Plan guardado en backend, ligado al repositorio y consumido al guardar. Abrir repositorio/cambiar autorización lo descarta; guardar revalida repositorio activo, confianza, token de Cambios, bytes/permisos básicos del archivo y huella de metadatos conocidos de merge/rebase/replay.
- Escrituras serializadas en RavenGit. Comprobación repetida inmediatamente antes del reemplazo. No se promete aislamiento frente a procesos externos que escriban entre la última comprobación y el reemplazo.
- Antes de reemplazar, crea una carpeta exclusiva `ravengit-conflict-<id>` dentro del Git dir: `original` conserva los bytes anteriores; `metadata.json` guarda ruta relativa, hashes SHA-256 original/resultado esperado, token y huella de operación. Archivos escritos con creación exclusiva y `sync_all`; no se garantiza durabilidad ante corte eléctrico ni sincronización de directorios.
- Resultado temporal en esa carpeta Git, con permisos básicos copiados, y reemplazo mediante rename. No hay escritura parcial deliberada sobre el original. Si Git dir y archivo están en sistemas de archivos distintos, se rechaza el reemplazo; no hay fallback de copia destructiva.
- No se certifica preservación de ACL extendidas, atributos especiales ni streams alternativos. No hay limpieza automática del respaldo ni restauración automática. Un fallo tras crear el respaldo puede dejar una carpeta incompleta; un hash de resultado en metadatos no certifica que se instaló.
- Tras interrupción, comprobar archivo actual y hashes/`original` antes de restaurar manualmente. El respaldo no representa un respaldo completo del índice ni permite abortar toda la operación. No copiar un respaldo sobre cambios nuevos sin revisión.

## Evidencia

- Windows: **7 pruebas Rust focalizadas** aprobadas con repositorios Git temporales: respaldo y archivo resultante; índice/HEAD/merge sin cambios; escritura externa, metadatos de operación e índice cambiados; confianza revocada; marcadores, binarios, tamaño y resultado idéntico; CRLF/salto final; etapas ausentes, codificación/finales mixtos y fallo de creación de respaldo. Hay además una prueba de enlace bajo `cfg(unix)`, no ejecutada en Windows.
- **20 UI focalizadas** y suite completa **222 pruebas / 24 archivos** aprobadas: edición/confirmación, descarte explícito, cierre, borrador conservado tras error, revisión consumida y doble envío bloqueado, además del visor anterior. IPC simulado.
- TypeScript/Vite, Clippy all-targets con `-D warnings`, Rustfmt, Prettier y `git diff --check` aprobados. Build Windows debug sin bundle aprobado en `src-tauri/target/debug/ravengit.exe`, sin instalador. No se repitió toda la suite Rust ni se ejecutó recorrido nativo del editor.

Pendientes: recorrido nativo Windows/macOS, lectura con teclado/lector de pantalla, recuperación manual tras interrupción real, rename rechazado por antivirus/permisos y aceptación de rebase/replay/Stash con conflictos. Las fixtures de merge no acreditan todos esos flujos. No se modificaron repositorios del usuario para validar.

Actualización Mac del 23/10 sobre `4305dd1`: [validación nativa de D.2a–c](Conflictos_macOS_2026-10-23.md). Guardado con respaldo e índice aún en conflicto comprobados de forma acotada; hashes y recuperación del contenido a un archivo nuevo verificados. No equivale a interrupción real durante la escritura ni a recuperación guiada en la interfaz.
