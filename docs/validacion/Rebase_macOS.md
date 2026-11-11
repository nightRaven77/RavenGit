# Rebase: validación nativa macOS ARM64

Fecha: 2026-10-21. Bundle de desarrollo 0.4.2 sobre cambios locales sin publicar.
Alcance: interacción real con RavenGit.app y Git local; no fixture de navegador.

## Entorno y procedimiento

- macOS / Darwin ARM64, Git 2.56.0.
- Compilación: `npm run tauri build -- --debug --bundles app`.
- Bundle: `src-tauri/target/debug/bundle/macos/RavenGit.app`.
- Control por accesibilidad de macOS: selector nativo de carpeta, confianza,
  revisión, confirmación, resolución, continuación, cierre/reapertura y aborto.
- Fixtures aisladas, sin remotos, autor ficticio, firma deshabilitada y hooks
  deshabilitados salvo el caso específico de rechazo. No se reescribió RavenGit.
- Verificación final de hashes, padres, refs de respaldo, contenido y estado
  desde Git, independiente de los avisos de éxito de la interfaz.

## Resultados

| Caso | Resultado observado |
| --- | --- |
| Sin conflictos | Confirmación inicialmente inactiva; tras aceptar, crea un nuevo commit sobre la base elegida, conserva rama main y respaldo, árbol limpio. |
| Conflicto | Muestra archivo pendiente, bloquea continuar y gestión ordinaria de ramas. No selecciona una versión automáticamente. |
| Reapertura | Cierre normal con Cmd+Q durante el conflicto; al abrir de nuevo el bundle y seleccionar la fixture, conserva autorización y recupera rebase desde disco sin la revisión en memoria. |
| Resolución y continuación | Se guarda externamente un texto de resolución, se actualiza y prepara desde RavenGit; Continuar se habilita y completa rebase, conserva contenido resuelto y deja árbol limpio. |
| Aborto | Exige aceptación explícita; restaura main en el hash original, elimina estado de rebase, conserva respaldo y deja árbol limpio. |

Hashes comprobados en las fixtures:

- Base: `8eefbba685b8346876d2b0ba58029e5698b80e0d`.
- Lineal original: `b2da5ef17f004d128a6f4736bc9ba976fb634ea6`;
  resultado: `e726206118f0ae14fd2d702d45469175fb89b088`, padre igual a la base.
- Conflicto original: `46d10857ad317544b20be7de2dd18a8be4057933`;
  resultado: `e45769aad7a70c4ac2ba8a93d92a503e1a564452`.
  Contenido final: `Resolución validada desde Mac` seguido de salto de línea.
- Aborto original/restaurado: `56ebbf459dfe471de95525b033bed7acbe9ee3e8`.

Las refs `refs/ravengit/rebase/…` conservan los hashes originales. Las fixtures
se dejaron en el directorio temporal de la sesión, no se incorporan al repositorio.

## Continuación: inicio rechazado

Se añade recuperación visual del registro que deja un inicio rechazado. Sólo
se permite retirar el registro si no hay operación Git activa, la rama actual
coincide con la original, el árbol está limpio y el respaldo apunta al original.
La retirada requiere confirmación, revalida la huella bajo bloqueo y conserva
archivos, ramas y respaldo. Un estado distinto sigue requiriendo inspección en Git.

Pruebas de regresión: no retirar registros activos; bloquear al editar archivos;
retirar únicamente el registro verificado y conservar HEAD/respaldo. UI: acción
inactiva hasta aceptar, sin controles de continuar/abortar cuando no hay rebase.
Comprobación nativa aprobada en el bundle recompilado: un hook `pre-rebase`
que termina con error rechaza el inicio; la interfaz presenta el registro sin
operación activa y bloquea retirarlo hasta aceptar. Tras confirmar, desaparece
el registro y Git confirma HEAD original, árbol limpio y respaldo conservado.

Checks de esta continuación: 70 pruebas de interfaz y 9 pruebas Rust del
conjunto afectado por rebase aprobadas, Clippy sin advertencias, formato Rust,
Prettier y `git diff --check` aprobados; bundle debug recompilado (34,28 MiB).
No se repitió la suite Rust completa: se conserva su resultado anterior de 84.

Evidencia verificable de los cuatro repositorios y hash del bundle actualizado:
[Rebase_macOS_resultados.json](Rebase_macOS_resultados.json). Los tres flujos
principales se probaron antes de añadir la retirada del registro; el caso de
inicio rechazado se probó después de recompilar esa mejora.

## Límites

La validación cubre estos casos concretos, no toda la aceptación de macOS.
No incluye cierre forzado durante una escritura, instalación limpia, firma o
notarización, Intel, proveedores reales, rendimiento ni accesibilidad completa.
Windows queda pendiente por decisión del usuario. No se cierran RG-05/AC-05.
