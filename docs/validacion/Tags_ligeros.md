# Tags ligeros locales

> Actualización macOS del 22/10: Creación local de tag ligero sobre el HEAD revisado comprobada en nativo macOS; no se cierran todos los errores/plataformas. Véanse [evidencia y alcance](MacOS_actual_2026-10-22.md). El registro original de este documento se conserva a continuación.


22 de octubre de 2026 · incremento C sobre `79ecf98`, fuentes locales sin nueva publicación. El usuario confirmó la identidad visual y autorizó continuar.

## Flujo

- **Herramientas → Crear etiqueta…** propone el HEAD de la apertura.
- **Detalle del commit → Etiquetar commit…** propone el commit seleccionado; permite elegir también el HEAD capturado al abrir el modal.
- Escribir el nombre, **Revisar etiqueta**, comprobar nombre/hash completo/asunto y confirmar antes de **Crear etiqueta local**.
- Cambiar nombre o destino invalida la revisión. Cerrar/Escape funciona salvo durante una operación. Tras éxito se refrescan historial y referencias; si falla el refresco no se repite la creación.

Sólo se crean etiquetas ligeras locales, incluidas rutas de nombre como `release/v1.0`. Sin etiquetas anotadas/firmadas, borrado, movimiento ni publicación. No se utiliza la configuración `tag.gpgSign` para convertir implícitamente el resultado en una etiqueta firmada. La autorización persistente existente se respeta; si falta, el error indica habilitarla desde Cambios.

## Seguridad y estado

Se valida el nombre completo con `check-ref-format`, hasta 255 bytes, sin NUL/opciones ni espacios exteriores. El destino debe ser un hash hexadecimal completo de 40/64 caracteres y un objeto commit disponible localmente; no se aceptan expresiones o rangos. Las lecturas deshabilitan reemplazos de objetos y descarga implícita mediante la infraestructura existente.

Se rechazan etiquetas existentes, incluidas anotadas, referencias locales dañadas/simbólicas y carpetas ocupando el nombre. La creación usa `update-ref --no-deref` con valor anterior cero: no se fuerza sobreescritura. Se registra reflog. [Referencia oficial de update-ref](https://git-scm.com/docs/git-update-ref), [distinción de tipos de tag](https://git-scm.com/docs/git-tag).

Plan almacenado en backend, ligado al repositorio y consumido una vez. Se vuelve a comprobar nombre/destino, HEAD, rama y tags antes de crear. Abrir otro repositorio o cambiar autorización descarta la revisión. No se cambian HEAD, rama, index o archivos; cambios locales no preparados/preparados son compatibles y no forman parte del tag. HEAD separado es compatible si existe el commit.

Se bloquean operaciones y locks detectables por sus marcadores, registros de rebase/replay y worktrees enlazados con `.git` de archivo. No se inspecciona ni resuelve el contenido del index en conflicto, no se borran locks ni se intenta recuperar operaciones ajenas. Las comprobaciones no constituyen aislamiento ante procesos externos que modifiquen Git concurrentemente; la actualización exclusiva de referencia impide sobrescribir una etiqueta normal creada en la carrera.

Plazo de escritura de 60 segundos y límites de lectura existentes. Se conserva el nombre ante errores, se consume la confirmación y se exige nueva revisión. En resultados inciertos se pide comprobar las referencias: un hook puede haber creado la etiqueta aunque la respuesta fallara. No hay reintentos automáticos ni rollback/borrado del tag.

## Evidencia y aceptación pendiente

Pruebas Rust con Git real en fixtures temporales: tag ligero en commit anterior con cambios preparados/sin preparar conservados; configuración de firma sin conversión a tag anotado; nombres y destinos inválidos, falta de confianza, objetos no commit; duplicados ligeros/anotados y creación externa; cambio de HEAD/otros tags; HEAD separado; operación pendiente; referencias dañadas o simbólicas pendientes sin sobrescritura.

Interfaz con IPC simulado: revisión/confirmación separadas, cambio de nombre/destino invalida, cierre/Escape, fallo sin repetir, doble clic bloqueado, refresco fallido después de éxito e integración desde el inspector sin crear una rama.

Resultados Windows: **6 pruebas Rust focalizadas aprobadas**, **186 de interfaz en 20 archivos**, TypeScript/Vite y Clippy con `-D warnings` aprobados. No se repitió la suite Rust completa.

Prettier, Rustfmt y `git diff --check` aprobados. Build Windows debug sin bundle aprobado en `src-tauri/target/debug/ravengit.exe`; comprobación del icono incrustado aprobada en sus seis tamaños. Sin instalador ni compilación macOS en este incremento.

Pendiente recorrido nativo Windows/macOS: crear en HEAD y en un commit anterior, comprobar etiqueta y tipo de objeto con Git, mantener archivos/index/HEAD, rechazar duplicados y estado obsoleto, revisar accesibilidad del modal y persistencia tras reiniciar. No se ha creado ninguna etiqueta en el repositorio del usuario durante las pruebas.
