# Rebase interactivo · conflictos en reword y squash en macOS

25/10/2026 · base **`c8101a7`** más una prueba Rust de regresión y documentación sin commit. Versión 0.4.2 en desarrollo; no es publicación ni cierre de RG-05/AC-05.

## Alcance y aislamiento

Instancia **RavenGit Interactive Focus**, `dev.ravengit.interactive.focus`, reconstruida como bundle debug ARM64 con los mismos fuentes de producción. Se usaron dos repositorios desechables bajo `/tmp/ravengit-ir-actions.VISQVB`: uno para `reword` y otro para `squash`. Ambos tenían rama `main`, base divergente `base`, archivo textual UTF-8 con nombre acentuado y un commit posterior. Git se configuró localmente con autor de prueba, firma desactivada, hooks vacíos y `core.autocrlf=false`.

No se abrió RavenGit normal ni un repositorio del usuario. La resolución se escribió externamente en cada fixture; RavenGit sólo actualizó el estado, preparó el archivo indicado y continuó mediante su recuperación acotada. El editor D.2 siguió fuera de alcance.

## Conflicto durante reword

Desde la UI se revisó el plan `reword` + `pick`, con mensaje final `Mensaje revisado reword\n\n# cuerpo revisado`, consentimiento independiente y ejecución. Git se detuvo al aplicar el primer commit:

- HEAD separado en la base; `main` seguía en el HEAD original.
- Índice con `archivo ü.txt` sin resolver.
- Secuencia completada `reword` y `pick` aún pendiente, iguales al plan persistente.
- Respaldo apuntando al HEAD original.

Después de escribir `resolución reword macOS`, se usaron **Actualizar rebase → Marcar resuelto → Continuar rebase**. El resultado volvió a `main`, produjo dos commits sobre la base y conservó literalmente el mensaje revisado y el mensaje del commit posterior, incluidos sus cuerpos `#`. Árbol limpio, base y respaldo intactos, sin directorio de rebase ni registro activo.

## Conflicto durante squash

Desde la UI se revisó `pick` + `squash` + `pick`; el segundo commit modificaba la misma línea que la base. El mensaje final del grupo fue `Grupo squash resuelto\n\n# cuerpo agrupado`. La pausa confirmó:

- Primer `pick` ya aplicado y `squash` detenido con el conflicto esperado.
- Rama `main` todavía en el HEAD original, base intacta y respaldo correcto.
- `done` con `pick` + `squash`, `todo` con el commit posterior y registro equivalente al plan revisado.

Tras escribir `resolución squash macOS`, el mismo recorrido guiado completó el rebase. El grupo quedó en un solo commit hijo de la base con el mensaje final exacto; el commit posterior quedó como su hijo con mensaje exacto. Se conservaron `ancla.txt`, la resolución y `posterior.txt`; estado limpio, respaldo original y ausencia de rebase/registro activos.

## Evidencia y validación

[Resultados estructurados](Rebase_interactivo_conflictos_acciones_macOS_resultados.json): **47 comprobaciones Git** observadas, 23 para `reword` (9 en pausa y 14 al terminar) y 24 para `squash` (9 en pausa y 15 al terminar). No se suman a suites ni a validaciones anteriores.

Capturas a 900 × 640: [historial reword](capturas/rebase-interactivo-conflictos/reword-historial.jpg) y [squash completado](capturas/rebase-interactivo-conflictos/squash-completado.jpg). La primera muestra los commits original y reescrito porque el historial incluye todas las referencias; la comprobación por padres/hashes distingue el resultado activo.

Se añadió una regresión Rust para conflicto durante `squash`, mensaje final literal, commit posterior, archivos, respaldo y limpieza. Suite completa: **185 pruebas del núcleo y 2 del editor interno** aprobadas; Rustfmt y Clippy all-targets con `-D warnings` aprobados. El bundle aislado ejecutó antes la compilación TypeScript/Vite y Rust. No se repitió la suite UI: no hubo cambios TypeScript ni de producción.

## Límites restantes

Actualiza la matriz nativa Mac para conflictos con `reword` y `squash`. No certifica conflicto durante `fixup` o `drop`, varias pausas consecutivas, commits vacíos, cierre forzado durante escritura, hooks/permisos, lector de pantalla, Windows ni rendimiento con 50 commits. El aborto y la reapertura normal ya constan en el recorrido de dos picks; no se repitieron aquí.

La transición del entorno eliminó `/tmp/ravengit-ir-actions.VISQVB` antes de la comprobación final de preservación. Las capturas y resultados ya estaban guardados, pero las fixtures no quedaron disponibles para una revisión posterior. No se confirmó la retirada de sus dos entradas de la biblioteca aislada; no se usó Papelera ni se intentó reconstruir evidencia perdida.
