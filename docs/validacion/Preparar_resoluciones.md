# D.2c · Preparación explícita desde el editor

23/10/2026 · desarrollo 0.4.2, cambios sobre `d5cd032`. El usuario confirmó el funcionamiento del incremento de guardado previo; esa confirmación no cierra una matriz completa de plataformas/casos. Sin nueva publicación.

## Recorrido

Tras guardar con respaldo en el editor: **Revisar preparación…** → inspeccionar texto, hash y modo → marcar autorización independiente → **Preparar resolución revisada**. Ninguna consulta ni preparación se dispara automáticamente al guardar.

- Sólo el archivo recién guardado en la sesión; el cliente no proporciona ruta/refspec arbitrarios a la preparación.
- Guardar y preparar son pasos separados. Se conserva el respaldo anterior y el archivo de trabajo; se reemplazan las etapas de conflicto de ese archivo por su entrada preparada.
- No continúa merge/rebase/replay/Stash ni crea un commit. Cerrar refresca Cambios; actualizar la recuperación correspondiente y decidir cómo continuar allí.
- Si se cierra/reabre la app, cambia repositorio/autorización o se pierde la revisión, usar los flujos de recuperación existentes. No se recupera automáticamente una revisión desde el respaldo.

## Transporte local y garantías

- Recibo guardado en backend ligado al repositorio, estado del índice/HEAD/archivos, bytes y permisos básicos del archivo y huella de metadatos conocidos de operación. Preparación/revisión consumen su etapa de sesión incluso al fallar, sin reintento automático.
- Reutiliza `IndexTransaction`: lock exclusivo del índice real y copia temporal; nunca borra un lock ajeno. La revisión aplica `git add` sólo en esa copia y después la descarta. Puede crear objetos Git y ejecutar filtros configurados: no es una lectura pura del repositorio.
- Se muestra el blob realmente producido por Git, incluidas normalizaciones de finales de línea y filtros. Confirmar vuelve a construir el índice temporal y exige el mismo hash y modo que se revisaron.
- Compara las entradas de todas las demás rutas antes/después: no se permite cambiar su contenido/modo/etapas. Se revalidan bytes, estado y operación antes de instalar el índice mediante la transacción existente.
- Texto preparado UTF-8 hasta 512 KiB, sin NUL ni marcadores conservadores; sólo archivos regulares. Split index y salidas de índice superiores a 2 MiB se rechazan. Permanecen las restricciones del editor D.2b; no añade soporte de binarios, enlaces o etapas ausentes.
- Los filtros son código de confianza del repositorio, con potenciales efectos externos. RavenGit no los aísla ni puede revertir sus efectos. No se promete aislamiento de otros procesos que ignoren locks o escriban después de comprobar el estado.
- Si el índice se instaló pero no se confirma el refresco, se devuelve advertencia preservando el resultado, sin sugerir repetir. Ante error, el guardado/respaldo se mantienen; comprobar estado antes de cualquier nueva acción.

## Verificación

**23 pruebas UI focalizadas** y suite completa **225 pruebas / 24 archivos** aprobadas en Windows con IPC simulado: nueva confirmación, contenido normalizado revisado, separación del guardado, fallo conservando respaldo y doble envío/cierre bloqueados; junto a los casos anteriores de visor/editor. TypeScript/Vite, Rustfmt, Prettier y `git diff --check` aprobados.

**5 pruebas Rust focalizadas** aprobadas con merge real en Windows: consulta sin instalar, cambio exclusivo de la ruta conservando otros preparados, archivo/índice/operación obsoletos, filtro cambiante, lock ajeno, confianza revocada y normalización CRLF. La primera ejecución tuvo 4 aprobadas y una expectativa de filtro no alcanzada porque la fixture afectaba también a otro archivo y activaba antes la protección de estado obsoleto; se limitó el filtro a la ruta objetivo y se repitieron las cinco. No se ejecutó toda la suite Rust ni se usaron repositorios del usuario.

Clippy all-targets con `-D warnings` y build Windows debug sin bundle aprobados (`src-tauri/target/debug/ravengit.exe`), sin instalador ni recorrido nativo del nuevo paso. Las advertencias de hard links de caché Windows no se tratan como evidencia de fallo funcional.

Pendiente aceptación nativa Windows/macOS, filtros reales por proveedor/equipo y recorridos de conflictos rebase/replay/Stash. La preparación es genérica para el índice, pero una fixture de merge no certifica esos recorridos ni que sus recuperaciones puedan continuar en todos los casos. RG-06 y la fase D siguen parciales.

Actualización Mac del 23/10 sobre `4305dd1`: [recorrido nativo y suite actual](Conflictos_macOS_2026-10-23.md). Consulta/guardado/preparación de merge textual y conservación de otro preparado comprobados en una instancia aislada, sin commit ni continuación. Esta evidencia acotada actualiza el pendiente Mac del registro anterior; Windows y los demás casos conservan sus puertas abiertas.
