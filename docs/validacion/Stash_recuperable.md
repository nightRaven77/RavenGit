# Stash recuperable · incremento D.1

Fecha: 22 de octubre de 2026. Versión de desarrollo 0.4.2; cambios de trabajo sobre `374c594`.

Actualización 29/10/2026: [validación Windows y registro publicado de forma exclusiva](Stash_Windows_2026-10-29.md). Nueve pruebas Rust, siete UI, Clippy y build debug aprobados; guardado/restauración de capas y Unicode, ignorados conservados y conflicto con cierre forzado/reapertura/finalización comprobados en una copia nativa aislada. El corte ocurrió después de detenerse por conflicto. Sustituye esos pendientes Windows del registro histórico siguiente; otras ventanas de interrupción, errores nativos, escala y accesibilidad siguen abiertos.

## Alcance disponible

- Botón **Stash** en la barra; un diálogo para guardar y restaurar, con autorización antes de leer cambios/stashes.
- Guardar cambios preparados y sin preparar con descripción de una línea; incluir archivos sin seguimiento es optativo y aparece en la revisión. Los archivos ignorados permanecen en el árbol.
- Lista de entradas existentes por hash completo, etiqueta y asunto; restauración con diff revisable y opción de recuperar el estado de preparación (`--index`). Aplicar conserva la entrada original.
- Revisión en backend ligada al repositorio y consumida una sola vez. Revalidación de HEAD, rama, index, archivos y lista de stashes antes de ejecutar. Un cambio de opciones invalida la confirmación en la interfaz.
- Cada stash generado/restaurado conserva una referencia `refs/ravengit/stash/<hash>`. Las referencias no se publican automáticamente. Las entradas de Git ajenas a RavenGit sólo reciben respaldo al restaurarlas desde este flujo.
- Registro `.git/ravengit-stash.json` publicado exclusivamente después de escribir/sincronizar un temporal completo, antes de ejecutar el guardado o la restauración. No sustituye otro registro; sin soporte de enlaces físicos se rechaza el inicio. Ante fallo/interrupción posterior permanece para revisión al reabrir. Bloquea staging/commit ordinarios, ramas/merge/rebase/replay, amend y creación de tags mientras está pendiente.
- Los conflictos se editan y preparan externamente desde Git. **Actualizar** revalida; **Finalizar revisión** exige confirmación, HEAD/rama originales y ausencia de entradas sin fusionar. Retira sólo el registro: conserva archivos, index y stashes, sin commit ni repetición de `apply`.

## Restricciones deliberadas

Este incremento requiere rama local con commit y repositorio completo/simple: sin worktrees enlazados, submódulos, partial/shallow clone, sparse/split index, reemplazos de objetos o marcas que oculten cambios. No elimina locks existentes ni interfiere con operaciones Git activas. Las carpetas sin seguimiento/repositorios anidados no se incorporan automáticamente.

Restaurar exige árbol limpio, incluidos archivos nuevos e ignorados, para evitar colisiones. La opción de restaurar preparación puede fallar por conflictos; el registro y el stash permanecen para revisión. Un fallo también puede dejar cambios parcialmente aplicados: nunca se supone que el árbol quedó intacto.

No se incluyen `pop`, borrado individual, `clear`, aborto automático ni restauración destructiva del estado anterior. Finalizar revisión **no equivale a deshacer**. No hay editor integrado de conflictos ni coordinación con procesos Git externos; la revalidación reduce estados obsoletos y no es una transacción global del sistema de archivos. La persistencia no certifica tolerancia a pérdida de energía. Los respaldos no se depuran automáticamente.

El diff está sujeto al límite compartido de salida de 2 MiB y UTF-8. Se conserva el tratamiento de archivos de Git; no se inventa contenido para binarios ni se ejecutan diffs externos/textconv para previsualizar el stash. Hooks/filtros/configuración del repositorio siguen siendo motivo de la autorización previa.

## Pruebas automatizadas ejecutadas en macOS ARM64

Suite de interfaz: **203/203 en 22 archivos**, incluyendo siete casos nuevos. Suite Rust: **150/150**, incluyendo siete casos nuevos; doctests (cero casos) aprobados también en la ejecución completa final. Clippy all-targets con `-D warnings`, Rustfmt, Prettier y TypeScript/Vite aprobados. Bundle nativo debug generado. Las cifras corresponden a este incremento y no se suman a registros anteriores.

Casos nuevos de Git real en repositorios desechables:

1. Guardar/restaurar index y árbol con contenidos distintos; HEAD invariable, entrada original y respaldo conservados.
2. Archivos nuevos optativos, nombres con acentos e ignorados conservados. Restauración rechazada ante archivos nuevos/ignorados.
3. Revisiones obsoletas por archivos y lista de stashes; confianza e inputs no válidos rechazados.
4. Conflicto real al restaurar sobre un commit divergente; reapertura con nuevo ID, escritura incompatible bloqueada, resolución externa, revisión nueva y finalización sin reset ni cambio de HEAD.
5. Registro de guardado interrumpido antes de Git: revisión explícita sin pérdida de archivos ni repetición automática.
6. Locks, registros de otras operaciones y sparse checkout rechazados.
7. La casilla de recuperar preparación prevalece sobre `stash.index=true`: sin marcar deja el index en HEAD y no modifica la configuración del usuario.

Los siete casos UI cubren revisión/confirmación, invalidación, hash/opciones al restaurar, confianza, doble clic/bloqueo de cierre, recuperación después de fallo y confirmación independiente para finalizar. IPC simulado: no sustituye el recorrido nativo.

Durante la primera prueba, forzar `GIT_LITERAL_PATHSPECS=1` impedía que el `clean` interno de `git stash -u` retirara un archivo nuevo acentuado aunque se hubiera capturado. Se retiró esa variable únicamente en las invocaciones del módulo (no aceptan pathspecs del usuario) y se añadió comprobación posterior de los archivos restantes. El caso se repitió y pasó. No se usa un `clean` adicional de RavenGit.

La primera ejecución de suites en sandbox no pudo crear archivos temporales; se repitieron con los permisos necesarios. La ejecución inicial de doctests coincidió con una compilación nativa y dio un error de dependencias; se ejecutó de nuevo sin compilación concurrente y pasó. No se contabilizan esas ejecuciones fallidas como aprobadas.

## Validación nativa y pendientes

Revisión independiente en el bundle debug macOS ARM64, con capturas del estado inicial y de las revisiones de guardado, restauración y diff. Fixture desechable: `/private/tmp/ravengit-stash-native-waljaul2/stash ü`.

- Guardar con inclusión de archivo nuevo: confirmó stash `c11df9d3718ad7960806c34cd352b5e77fec2b9b` y árbol limpio.
- Restaurar con recuperación de preparación: `file.txt` volvió con index `Preparado` y árbol `Sin preparar`; `nuevo ü.txt` volvió con `Nuevo`. HEAD original `3afcf0401949cf095b2d31176bbda59ce078465a` no cambió.
- Entrada original y respaldo se conservaron. Se verificaron además sus objetos Git por separado: base, index, árbol y padre de archivos nuevos. [Resultados estructurados](Stash_macOS_resultados.json).
- Un segundo guardado nativo (`24f3272db0989eab45cd1b9571fcb064fefdb2d2`) conservó esos archivos y dejó limpio el árbol para el escenario siguiente.

La preparación del commit divergente no se ejecutó porque se canceló su solicitud de permiso. **Conflicto y reapertura durante recuperación no están validados en nativo**; permanecen comprobados sólo por las pruebas Rust. No se intentó la escritura cancelada por otra vía. La fixture queda conservada en disco con ambos stashes.

La revisión independiente del flujo ejecutado no encontró bloqueantes ni problemas mayores. Encontró dos mejoras menores: distinguir la preparación del resultado total en la revisión de restauración y mostrar contadores por capa al guardar. Se aclaró el alcance del diff en texto y el juez independiente comprobó ese párrafo renderizado en el bundle final, sobre una revisión de sólo lectura y sin confirmar ninguna mutación. La separación visual de capas sigue pendiente.

| Heurística | Hallazgo localizado | Severidad / estado | Mejora o límite |
| --- | --- | --- | --- |
| Visibilidad del estado | Confirmaciones y número de stashes tras guardar/restaurar | Pasa en recorrido ejecutado | Errores nativos aún pendientes |
| Relación con el mundo real | Guardar/restaurar y opción de recuperar preparación | Pasa | Terminología Git explicada en contexto |
| Control y libertad | Cerrar antes de confirmar; entrada y respaldo conservados | Pasa | Aborto automático no disponible |
| Consistencia | Modal, botones y diff compartidos | Pasa | Sin controles nuevos redundantes |
| Prevención de errores | Confianza, revisión, casilla y árbol limpio | Pasa en recorrido ejecutado | Faltan errores nativos completos |
| Reconocimiento | Revisión muestra nombres; no separa capas de preparación | Menor | Añadir contadores por capa y vista del index; texto aclaratorio en diff |
| Eficiencia | Guardar y restaurar en la misma herramienta | Pasa | Sin atajo de pop implícito |
| Minimalismo | Dos modos y diff plegado | Pasa en ventana amplia | Ventana mínima pendiente |
| Reconocer y recuperarse de errores | Recuperación y conflictos | Pendiente nativo | Rust pasó; no extrapolar a UX nativa |
| Ayuda | Nuevos, ignorados y conservación de entrada explicados | Pasa | Aclaración contextual sobre el diff añadida |


Pendientes de aceptación completa: Windows, cierre forzado durante el comando, errores de filtros/permisos/sin identidad, ventana mínima 900 × 640, lector de pantalla y recorrido íntegro por teclado, binarios y límites grandes. La suite no demuestra rendimiento ni aceptación completa de RG-05/AC-05–07.

## Referencia técnica

Semántica de `push`, `apply`, `--index` y `--include-untracked`: [manual oficial de Git Stash](https://git-scm.com/docs/git-stash). El diseño aplica sin borrar la entrada; no presenta `apply` como un `pop`.

## Bundle final y limpieza

Bundle debug ARM64 generado en `src-tauri/target/debug/bundle/macos/RavenGit.app`. SHA-256 del ejecutable final: `1a3213ac9e084e572a7a1d118aef7e91e1af00c878c59024d8b9f56674a207af`. El happy path nativo se ejecutó antes de la reconstrucción final; esta incorporó la configuración explícita de `stash.index`, un texto de error corregido y la aclaración visual. El bundle final se reabrió y su revisión/diff se inspeccionaron sin ejecutar otro guardado/restauración. El override de preparación quedó probado con Git real en Rust.

Al terminar se quitó exclusivamente la entrada de la fixture de la biblioteca, con Papelera desmarcada. La biblioteca quedó con cero entradas y los archivos/stashes de prueba permanecen en disco. No se creó un commit en el repositorio de desarrollo ni se publicó una versión.
