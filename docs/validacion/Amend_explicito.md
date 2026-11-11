# Amend explícito

> Actualización macOS del 22/10: Amend con preparado, conservación de autor/fecha/ascendencia y respaldo comprobados en la aplicación macOS; errores nativos y aceptación completa siguen pendientes. Véanse [evidencia y alcance](MacOS_actual_2026-10-22.md). El registro original de este documento se conserva a continuación.


22 de octubre de 2026 · incremento C · fuentes locales sobre `fb4e614`, sin nueva publicación. Desarrollo y pruebas en Windows x64; no acredita macOS ni aceptación visual nativa.

## Flujo y alcance

En **Cambios → Reemplazar último commit…** se carga el mensaje actual sin escribir historial. Se puede editar sólo el mensaje o añadir lo preparado previamente con las herramientas existentes. **Revisar amend** presenta rama, hash completo reemplazado, autor conservado, committer configurado, mensajes anterior/nuevo, parche original y delta HEAD → index. La casilla de confirmación es obligatoria; editar o recargar invalida la revisión.

Se ejecuta `git commit --amend --file=- --cleanup=verbatim` usando el mecanismo transaccional del index existente. No usa `-a`, no prepara archivos automáticamente ni resetea el autor. Los archivos sin preparar y los no seguidos quedan fuera del commit. Hooks y firma configurados siguen siendo responsabilidad del repositorio autorizado y pueden validar o modificar el resultado. [Semántica oficial de git commit](https://git-scm.com/docs/git-commit).

Antes de escribir se conserva HEAD en `refs/ravengit/amend/<hash>-<pid>-<nonce>`, creada exclusivamente con valor anterior cero mediante `update-ref`. La referencia se muestra tras éxito y se conserva si falla el commit. No es un respaldo de archivos sin commit ni una restauración automática; no se incorpora reset destructivo ni force push. [Semántica oficial de update-ref](https://git-scm.com/docs/git-update-ref).

La longitud de la ascendencia de la rama no aumenta: el tip se reemplaza. El historial de **todas las referencias** puede mostrar también el commit anterior porque el respaldo lo mantiene accesible; no significa que se haya añadido un padre a la rama.

## Precondiciones

- Autorización local vigente, identidad Git y rama local con HEAD existente.
- Sin conflictos, locks, merge/rebase/replay ni registros de recuperación pendientes.
- Commit raíz o con un padre. Amend de merges se bloquea en este incremento.
- Repositorio completo/simple: sin shallow/partial clone, worktrees enlazados, submódulos, sparse/split index, reemplazos/grafts o marcas que oculten cambios; se reutilizan las restricciones conservadoras de operaciones avanzadas.
- Mensaje no vacío, sin NUL y hasta 64 KiB; lectura y diffs UTF-8 acotados por la infraestructura actual.
- No fuerza `--allow-empty`: Git puede rechazar un resultado vacío respecto del padre; se conserva el respaldo y se informa el error.

El plan de confirmación sólo se consume una vez. El token vincula HEAD, rama, index, estado/contenido de archivos modificados, identidad, mensaje, parches y referencias locales/remotas/tags. Antes de ejecutar se vuelve a generar y comparar. Abrir otro repositorio o cambiar la autorización descarta el plan; la revisión de amend descarta otras revisiones de escritura. No constituye aislamiento frente a otros procesos Git o hooks que escriban concurrentemente después de las comprobaciones.

## Publicación y fallos

Se buscan referencias `refs/remotes/` que contienen HEAD, **sin Fetch ni acceso de red**. Se muestran las coincidencias, pero no encontrarlas no demuestra que el commit sea privado. Siempre se advierte de la reescritura y se exige confirmar. No se intenta modificar el remoto ni publicar automáticamente.

Los errores de hooks/firma, tiempos agotados y resultados inciertos conservan el mensaje y descartan la confirmación, sin repetir Git. Inspeccionar HEAD, index y respaldo antes de revisar de nuevo. Si el commit ya terminó pero falló refrescar o instalar el index, la vista indica no repetir; el respaldo permanece. Cerrar/Escape funciona salvo durante ejecución.

## Evidencia automatizada

- 7 pruebas Rust específicas con Git real: amend raíz sólo de mensaje, preservación de autor/árbol/archivos sin preparar y no seguidos; incorporación de preparado sin añadir un padre; revisión obsoleta por archivos/index/HEAD/rama/remotos/identidad; detección de publicación local; rechazo de estados no admitidos; fallo de firma con HEAD/index y respaldo conservados; bloqueo de merges/marcas ocultas.
- 165 pruebas de interfaz en 18 archivos: incluye 7 del modal y 2 de integración con Cambios; IPC simulado. Revisión y confirmación separadas, edición invalida, error sin reintento, cierre/Escape, bloqueo/doble clic y refresco fallido tras éxito.
- 13 pruebas Rust de regresión de Cambios aprobadas: staging completo/parcial, CRLF, commit normal/inicial, estado obsoleto, locks, enlaces y fallos/timeout de hooks. No se repitió la suite Rust completa.
- Prettier, Rustfmt, Clippy con `-D warnings`, TypeScript/Vite y repetición focalizada de 16 pruebas de interfaz aprobados. Las advertencias de copia de caché incremental en Windows son ambientales, no diagnósticos de Clippy.
- Compilación Windows debug sin bundle aprobada; ejecutable `src-tauri/target/debug/ravengit.exe`. No se generó instalador ni se ejecutó la aplicación para aceptar el flujo nativo.

## Aceptación nativa pendiente

Usar un repositorio desechable con dos commits y una modificación preparada más otra sin preparar. Corregir el mensaje, inspeccionar ambos diffs y confirmar; comprobar que el número de commits en la ascendencia de HEAD no aumenta, se conserva el autor, sólo se incorpora lo preparado y el respaldo resuelve al hash anterior. Repetir sólo de mensaje y verificar cierre/Escape, error de firma/hook y estado obsoleto tras cambio externo. Validar Windows y macOS por separado; no reescribir un commit compartido para esta prueba.
