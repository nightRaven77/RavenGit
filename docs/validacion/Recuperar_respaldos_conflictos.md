# Recuperación guiada de respaldos · D.2d

23 de octubre de 2026 · versión de desarrollo 0.4.2, cambios de trabajo sobre `4305dd1`. No es una publicación nueva.

## Recorrido disponible

**Herramientas → Recuperar respaldo de conflicto…** lista los respaldos persistentes de RavenGit en la carpeta Git del repositorio autorizado. Identifica los guardados de resolución y las copias anteriores a otra restauración. El selector muestra fecha/hora con segundos y zona local, derivada del instante incluido en el identificador; el identificador completo de la selección aparece debajo. Los formatos no reconocidos muestran «Fecha no disponible». No se reescriben respaldos ni se usa esta fecha como precondición de seguridad. Los registros incompletos o dañados permanecen visibles como no disponibles; no se eliminan ni se siguen enlaces.

1. Elegir respaldo y pulsar **Revisar restauración**.
2. Comparar archivo actual, original a restaurar, ruta y HEAD. Si el archivo cambió desde el guardado, se muestra una advertencia explícita.
3. Marcar el consentimiento y pulsar **Restaurar archivo con respaldo**.

Antes del reemplazo se conserva el archivo actual en otra carpeta exclusiva `ravengit-conflict-<id>`, con `original` y `metadata.json`. Esta copia también aparece en la lista, de modo que puede revisarse para volver al contenido anterior a la recuperación. No hay restauración, borrado ni repetición automática al consultar.

Al cerrar el diálogo se releen Cambios sin desmontar el panel ni borrar el borrador del commit. El diálogo de recuperación mantiene su cabecera y botón Cerrar visibles al hacer scroll; el ajuste no modifica la cabecera del editor de conflictos anterior.

## Qué modifica y qué conserva

- Reemplaza sólo el archivo de trabajo por los bytes originales, incluidos sus finales de línea. El original puede contener marcadores de conflicto.
- **No modifica el índice**, aunque ese archivo ya estuviera preparado. Restaurar el archivo no deshace su preparación, no resuelve las etapas del índice, no crea un commit ni continúa/aborta el merge. Revisar Cambios antes de cualquier acción posterior.
- Conserva tanto el respaldo elegido como la copia del contenido actual. No hay limpieza automática de respaldos.
- Se requiere un **merge pendiente**, con la misma huella de metadatos conocida que quedó registrada al guardar. Si la huella cambia o el merge termina, este incremento remite a recuperación externa. Los respaldos previos no contienen el HEAD histórico explícito: la huella no prueba por sí sola la identidad completa de un intento anterior de merge; se muestra el HEAD actual y se exige revisar contenidos y ruta.

## Protecciones y límites

Confianza por ruta antes de leer archivos. Plan de un uso ligado a repositorio, estado de Cambios, permisos básicos, carpeta Git, contenido actual y huella del respaldo. Revalidación antes de crear la copia y antes del reemplazo; cambiar archivo, índice, respaldo u operación exige revisión nueva. Abrir otro repositorio o cambiar autorización invalida la sesión compartida de edición/preparación/recuperación.

Identificadores limitados al prefijo y caracteres de RavenGit; ruta relativa del archivo validada para impedir escapes. Directorio y archivos del respaldo deben ser regulares, sin enlaces; original verificado contra SHA-256 de metadatos. El hash detecta inconsistencias, **no autentica la procedencia** de archivos manipulados antes de revisar. No se muestran salidas Git sensibles ni se aceptan rutas arbitrarias en la confirmación.

Texto UTF-8 sin NUL hasta 512 KiB por contenido; metadatos hasta 16 KiB y un máximo de 200 entradas por consulta, sin truncamiento silencioso. Archivo actual existente, regular y escribible. Lock de índice ajeno conservado; no se elimina para continuar.

Archivo temporal dentro de la copia nueva, `create_new`, `sync_all`, permisos básicos y `rename`. Si se rechaza el reemplazo, comprobar los archivos y copias antes de repetir: pueden quedar registros incompletos o una copia completa sin reemplazo. Un hash de resultado en metadatos no demuestra por sí mismo que se instaló.

No se garantiza durabilidad ante corte eléctrico, preservación de ACL/atributos extendidos, cambio entre sistemas de archivos ni aislamiento frente a procesos externos que escriban después de comprobar el estado. No hay fallback destructivo de copia. Binarios, archivos ausentes, enlaces, recuperación del índice y otras operaciones siguen fuera de este incremento.

## Pruebas ejecutadas en macOS

Suite completa: **234 UI / 25 archivos y 178 Rust**, doctests sin casos; Clippy all-targets con `-D warnings`, formato y TypeScript/Vite aprobados. Se repitieron las siete pruebas Rust focalizadas y Clippy después de añadir la identificación de las copias de recuperación. El cambio de texto de opciones y el estilo de cabecera no alteran las operaciones Git.

Siete casos Rust nuevos con Git real en fixtures: restaurar después de preparar conservando índice/HEAD/merge y volver mediante la copia nueva; conservar trabajo posterior; rechazar archivo/índice/operación/respaldo obsoletos; confianza/IDs/locks/merge terminado; registros dañados visibles; preservación CRLF y rechazo de enlaces Unix.

Siete casos del diálogo con IPC simulado: revisión/consentimiento, invalidación al actualizar, respaldo dañado, confianza, doble envío/cierre, error sin reintento y éxito con fallo de refresco. Se añadieron integración desde Herramientas y recarga de Cambios preservando el borrador. Mocks y Git de fixtures no sustituyen aceptación nativa.

## Recorrido nativo y pendientes

Revisión de continuidad del 23/10 sobre `4305dd1` y cambios locales D.2d: diff e integración de sesión compartida revisados, sin bloqueantes identificados. Reejecución focalizada aprobada: **44 UI en 3 archivos** (`ConflictRestoreDialog`, `ChangesPanel`, `App`) y **7 Rust** de `conflict_restore::tests`; `git diff --check` sin incidencias. No se repitieron suites completas, builds ni aceptación nativa. Los módulos nuevos siguen sin seguimiento en Git; no se hizo commit ni limpieza de bibliotecas.

Instancias aisladas de validación amplia (1440 × 920) y estrecha (900 × 640), sin cerrar RavenGit normal ni modificar su biblioteca. Se utilizaron copias de una fixture de merge ya preparado y respaldos persistentes creados por el editor anterior.

- Amplia: se añadió trabajo posterior sin preparar. La revisión mostró ambos contenidos y la advertencia correspondiente. Tras confirmar, se restauró el original con marcadores, conservando el trabajo posterior en otra copia. Ocho comprobaciones independientes de Git/archivos aprobaron.
- Se eligió después esa copia previa, se volvió a revisar y se recuperó el trabajo posterior. Siete comprobaciones adicionales confirmaron que índice completo, HEAD, merge y copias anteriores permanecieron intactos.
- Estrecha: restauración completa con consentimiento y ocho comprobaciones independientes aprobadas. Comparación en dos columnas, scroll normal y cabecera/Cerrar visibles durante el desplazamiento.
- No se reinició la aplicación entre restauración y vuelta al trabajo posterior. La lectura de respaldos persistentes preexistentes sí se ejerció; no se declara validación de una interrupción durante escritura.

[Resultados estructurados](Recuperar_respaldos_macOS_resultados.json): 23 comprobaciones independientes aprobadas, además de la traza visual y las suites automatizadas. La identificación de copias se probó nativamente; después se ampliaron las variantes focalizadas de rechazo para HEAD cambiado y ruta manipulada, sin cambiar lógica de producción.

### Revisión independiente de UX

El juez recorrió las aplicaciones nativas sin haber construido este incremento. No encontró bloqueantes ni problemas mayores.

| Heurística | Hallazgo | Estado / mejora |
| --- | --- | --- |
| Estado visible | Éxito y ubicación de copia nueva explícitos | Pasa en el recorrido |
| Correspondencia | Distingue archivo actual y contenido a restaurar | Pasa |
| Control | Cerrar fijo y recuperación de copia previa con otra confirmación | Pasa |
| Consistencia | Controles y comparación coherentes en ambas ventanas | Pasa |
| Prevención | Advertencia de cambios posteriores, revisión y consentimiento | Pasa; errores inducidos sólo automatizados |
| Reconocimiento | Propósito de copia visible, pero identificadores extensos | Menor en esta aceptación; ajuste posterior de fecha documentado abajo |
| Eficiencia | Volver al trabajo posterior sin CLI | Pasa |
| Minimalismo | Dos columnas y scroll normal a 900 × 640 | Pasa en esta fixture |
| Recuperación | Contenido anterior preservado y restaurable | Pasa en el caso ejecutado |
| Ayuda | Efectos sobre índice, commit y merge explicados | Pasa |

La revisión funcional terminó; la limpieza de entradas en las bibliotecas aisladas no quedó confirmada al agotarse el límite del agente antes de ese paso. Los archivos de prueba y respaldos se conservan. No se borró nada de RavenGit normal ni se hizo commit en el repositorio de desarrollo.

Pendientes: Windows, errores nativos inducidos, archivos extensos, lector de pantalla, operaciones distintas del merge y recuperación tras interrupción real durante la escritura. RG-06 y D siguen parciales; la recuperación del archivo no se presenta como deshacer el merge completo.

### Ajuste posterior · fecha legible

La fecha del selector y el identificador separado se incorporaron después de la aceptación nativa descrita arriba. Siete pruebas existentes del diálogo, TypeScript sin emisión, Prettier y `git diff --check` aprobados. No se cambió Rust ni se repitieron suites completas o aceptación nativa de restauración.

Revisión independiente del render con IPC simulado en navegador integrado: **1440 × 920 y 900 × 640**, fecha con segundos y zona GMT-6 visible, selección por teclado entre guardado y copia previa actualiza fecha/identificador; formato antiguo muestra «Fecha no disponible». Abrir revisión mantiene consentimiento desmarcado y restauración bloqueada. Sin problemas nuevos detectados en este alcance ni desbordamiento para la fixture `src/archivo ü.txt`. Capturas de sesión: `/tmp/ravengit-date-ux-wide.png` y `/tmp/ravengit-date-ux-narrow.png` (temporales). Harness y servidor propios retirados al terminar. No acredita WebView nativo, Windows, lector de pantalla, rutas extensas ni restauración Git real.

| Heurística del ajuste | Hallazgo del revisor independiente | Resultado |
| --- | --- | --- |
| Estado visible | Fecha, segundos y zona visibles | Pasa |
| Correspondencia | Fecha local legible | Pasa |
| Control | Selección por teclado actualiza copia e ID | Pasa |
| Consistencia | Propósitos conservan vocabulario | Pasa |
| Prevención | Consentimiento desmarcado y restauración bloqueada al revisar | Pasa |
| Reconocimiento | Copias distinguibles por propósito y fecha | Pasa |
| Eficiencia | Cambio directo entre copias | Pasa |
| Minimalismo | ID separado sin desbordamiento en la fixture | Pasa |
| Errores | Fecha no disponible ante formato incompatible | Pasa |
| Ayuda | Efectos sobre archivo/índice siguen visibles | Pasa |

No se identificaron correcciones adicionales en el alcance evaluado.

## Aceptación adicional posterior

[Recorrido nativo adicional de macOS](D2d_aceptacion_macOS.md): teclado, rechazo de revisión obsoleta/lock/metadatos corruptos y recuperación tras cerrar/reabrir, 37 comprobaciones independientes y corrección de etiqueta de registros inválidos. Actualiza esos pendientes de esta evidencia; no cierra Windows, accesibilidad completa ni interrupción durante escritura.

[Pruebas posteriores de límites y estado obsoleto](D2d_limites_macOS.md): 512 KiB exactos, rechazo de exceso de un byte, índice/operación modificados y ajuste de lectura de líneas extremas, con 45 comprobaciones independientes. La navegación hasta fin exclusivamente por teclado permanece pendiente.

[Actualización de teclado](D2d_teclado_macOS.md): Inicio/Fin y ⌘↑/⌘↓ alcanzan extremos de ambos contenidos en Mac; Tab permite salir sin consentir. Lector de pantalla y Windows siguen pendientes.
