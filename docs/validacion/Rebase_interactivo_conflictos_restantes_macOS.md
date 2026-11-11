# Rebase interactivo · fixup, drop y commit recién vacío en macOS

25/10/2026 · base **`c8101a7`** más tres regresiones Rust y documentación sin commit. Versión 0.4.2 en desarrollo; no es publicación ni cierre de RG-05/AC-05.

## Alcance y aislamiento

Instancia **RavenGit Interactive Focus**, `dev.ravengit.interactive.focus`, bundle debug ARM64 ya construido con los mismos fuentes de producción, SHA-256 `bc79658a0e8c4de9d4e672132d21938c52eacb90401521dfa270dc9586904cf4`. Ventana de 900 × 640 y tres repositorios desechables bajo `/tmp/ravengit-ir-finish.wgoG1j`: `fixup`, `drop` y `empty`.

No se abrió RavenGit normal ni repositorios del usuario. Todos los remotos estaban ausentes y cada fixture usó autor local de prueba. Las resoluciones se escribieron externamente; RavenGit releyó el estado, preparó únicamente el archivo indicado y continuó. Las fixtures y respaldos se conservaron; no se usó Papelera ni se retiraron sus entradas de la biblioteca aislada.

## Fixup con dos pausas consecutivas

Plan revisado desde UI: `pick` + `fixup` + `pick` + `pick`. El `fixup` se detuvo en `archivo ü.txt`; `main` permaneció en el HEAD original y el respaldo apuntó a ese objeto. Después de escribir `resuelto uno`, **Actualizar rebase → Marcar resuelto → Continuar rebase** avanzó hasta una segunda pausa, ahora en `segundo.txt`, sin mover todavía `main` ni cambiar el respaldo.

Tras escribir `resuelto dos` y repetir el recorrido, el rebase terminó en `main` con tres commits sobre `feature`. El grupo `pick`/`fixup` conservó literalmente `Ancla\n\n# cuerpo ancla`; los mensajes `Segundo\n\n# cuerpo segundo` y `Posterior\n\n# cuerpo posterior` también quedaron exactos. Padres lineales, ambas resoluciones, archivos auxiliares, árbol limpio, respaldo original y ausencia de rebase/registro activo quedaron comprobados.

## Drop antes de un conflicto posterior

Plan revisado: `pick` + `drop` + `pick` + `pick`. El archivo exclusivo de `drop`, `descartar.txt`, ya estaba ausente cuando el tercer commit se detuvo por conflicto en `archivo ü.txt`. Después de escribir `resuelto`, actualizar, preparar y continuar, el resultado tuvo tres commits lineales sobre `feature`: `conservar`, `conflicto posterior` y `posterior`.

`descartar.txt` siguió ausente; los demás contenidos y mensajes fueron exactos. `main` volvió a ser simbólico, el respaldo conservó el HEAD original y no quedaron cambios, directorio de rebase ni registro activo.

## Commit recién vacío y aborto

La base y el único commit local producían el mismo contenido por historias distintas. Un plan interactivo `pick` se detuvo mediante `--empty=stop`; la recuperación mostró cero conflictos, **Continuar rebase** habilitado y **Abortar rebase** bloqueado hasta el consentimiento. Esto confirma que RavenGit no omite automáticamente el commit y conserva las dos salidas explícitas que ofrece Git.

Tras consentir y abortar desde la UI, RavenGit restauró `main`, el HEAD y el árbol originales, mantuvo `feature` y el respaldo, dejó el árbol limpio y retiró el estado activo de recuperación.

## Evidencia y validación

[Resultados estructurados](Rebase_interactivo_conflictos_restantes_macOS_resultados.json): **53 comprobaciones independientes** —22 para `fixup`, 17 para `drop` y 14 para el commit recién vacío—. Son observaciones de estado/UI y Git de estos recorridos; no se suman a suites anteriores.

Capturas del recorrido. El bundle se ejecutó en la ventana configurada de 900 × 640; la API de captura exportó las dos imágenes del caso vacío a 479 × 341, por lo que no se presentan como evidencia de escala:

- `fixup`: [primera pausa](capturas/rebase-interactivo-conflictos-restantes/fixup-primera-pausa.jpg), [segunda pausa](capturas/rebase-interactivo-conflictos-restantes/fixup-segunda-pausa.jpg) y [completado](capturas/rebase-interactivo-conflictos-restantes/fixup-completado.jpg).
- `drop`: [conflicto posterior](capturas/rebase-interactivo-conflictos-restantes/drop-conflicto-posterior.jpg) y [completado](capturas/rebase-interactivo-conflictos-restantes/drop-completado.jpg).
- commit vacío: [detenido](capturas/rebase-interactivo-conflictos-restantes/commit-vacio-detenido.jpg) y [abortado](capturas/rebase-interactivo-conflictos-restantes/commit-vacio-abortado.jpg).

Tres regresiones Rust cubren `fixup` con dos conflictos consecutivos, `drop` antes de un conflicto posterior y commit recién vacío abortable. Suite completa: **188 pruebas del núcleo y 2 del editor interno**, todas aprobadas. Rustfmt, Clippy all-targets con `-D warnings`, Prettier de los documentos afectados, integridad JSON y `git diff --check` aprobados. La suite UI no se repitió porque no cambió TypeScript ni producción.

## Límites restantes

Este registro cierra la matriz nativa macOS de conflictos por acción acotada junto con los registros previos de `pick`, `reword` y `squash`; `drop` no genera conflicto por sí mismo, por lo que se comprobó que su omisión sobrevive a un conflicto posterior. No certifica Windows, cierre o interrupción forzada durante escritura, hooks/permisos, lector de pantalla, escalado adicional, rendimiento con 50 commits ni proveedores reales.

No hubo revisión visual independiente nueva porque no cambió la interfaz. Las tres entradas permanecen en la biblioteca de la instancia aislada y las fixtures siguen bajo `/tmp`; no se afirma limpieza de entradas ni persistencia tras una transición futura del entorno.
