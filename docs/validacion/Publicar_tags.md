# Publicación segura de tags ligeros

> Actualización macOS del 22/10: Crear → publicar al bare local → reconsultar Coincide comprobado en nativo macOS; se verificó hash remoto y ausencia de otras publicaciones. No certifica proveedores reales. Véanse [evidencia y alcance](MacOS_actual_2026-10-22.md). El registro original de este documento se conserva a continuación.


22 de octubre de 2026 · incremento C.1 · fuentes locales sin publicar. GitHub CLI y releases no forman parte de este incremento.

## Flujo de usuario

**Herramientas → Publicar etiqueta…** permite seleccionar una etiqueta ligera local y un remoto de publicación. Tras crear una etiqueta también aparece **Publicar esta etiqueta…**: abre el mismo flujo con el nombre seleccionado, sin publicar ni consultar la red automáticamente.

Abrir/actualizar el modal sólo lee configuración y referencias locales. **Consultar remoto y revisar** inicia explícitamente la consulta al destino de publicación, muestra URL, nombre y hash local/remoto, y distingue:

- **Nueva:** no existe; puede publicarse después de confirmar nombre, hash y destino.
- **Coincide:** el remoto ya contiene el mismo objeto; no se ofrece repetir el push.
- **Conflicto:** el remoto contiene otro objeto; no se ofrece mover ni sobrescribir la etiqueta.

Publicar un tag transfiere los objetos y commits necesarios, incluidos los que no estén publicados en una rama. La revisión lo advierte. No se envían referencias de ramas, otras etiquetas ni borrados, y no se crea una release.

## Implementación y protecciones

- Reutiliza transporte SSH/HTTPS/file, credenciales Git/sistema, diagnóstico sanitizado, límites de salida/plazo y contención de procesos existentes. No introduce cuentas, tokens, login ni dependencia de `gh`.
- Requiere autorización vigente y configuración estándar con una única URL segura de publicación. Las múltiples push URLs, URL restringidas y reescrituras `insteadOf`/`pushInsteadOf` quedan bloqueadas por las comprobaciones existentes de remotos.
- El origen debe ser una referencia local ligera que apunte directamente a un commit; etiquetas anotadas/firmadas se dejan fuera del selector y del backend de este incremento.
- Reutiliza las precondiciones conservadoras de Push: historial completo, sin clon parcial ni operación/conflictos pendientes.
- La consulta utiliza `ls-remote --refs` para una referencia completa `refs/tags/<nombre>`, sin Fetch ni objetos remotos descargados. Se rechazan respuestas inconsistentes, duplicadas o no UTF-8.
- El plan queda en backend, ligado al repositorio y consumido una sola vez. Abrir otro repositorio, cambiar autorización o actualizar opciones lo descarta. Antes del push se vuelven a comprobar configuración/referencias locales, hash de origen y referencia remota.
- Se envía un refspec único `<hash congelado>:refs/tags/<nombre>` a la URL revisada, sin `+`, lease forzado ni `--tags`. Se desactivan seguimiento automático de tags, mirror, prune y recursión de submódulos. No se omiten hooks.
- Una carrera tras las comprobaciones sigue sujeta a las reglas normales de Git para tags: no hay actualización forzada. Otros procesos y hooks no quedan aislados; la aplicación no promete impedir toda modificación concurrente externa.
- Después de un push exitoso se vuelve a consultar el hash remoto. Si no se confirma, se muestra advertencia sin ofrecer repetir automáticamente. También se evita repetir si falló únicamente el refresco local.

Fallos de permisos, hooks, conexión o plazos conservan los selectores y descartan la confirmación. El servidor puede haber recibido objetos o incluso la referencia antes del error; comprobar el destino antes de una nueva revisión. No hay rollback ni borrado remoto. Cada operación de red tiene el plazo existente de 60 segundos; la revisión/publicación puede incluir varias comprobaciones.

## Evidencia

- **6 pruebas Rust con Git real**, sólo contra repositorios bare temporales locales: publicación exclusiva aun con `push.followTags=true` y otro tag anotado presente; destino igual/conflictivo; cambio de origen/URL; creación externa después de revisar; autorización/tipo/configuración avanzada; hook de servidor rechazado sin fuga de su salida.
- **39 pruebas de interfaz focalizadas** aprobadas: incluye crear etiqueta, paso explícito a publicar, consulta separada de envío, invalidación por selección, igualdad/conflicto, fallo sin reintento, carga/cierre/Escape, doble clic y éxito con advertencia/refresco fallido. IPC simulado, no contactos externos.
- TypeScript/Vite y Clippy con `-D warnings` aprobados. No se repitió la suite Rust completa ni se publicaron etiquetas del usuario durante la validación.
- Suite completa de interfaz: **196 pruebas en 21 archivos aprobadas**. Prettier, Rustfmt y `git diff --check` aprobados.
- Compilación Windows debug sin bundle aprobada en `src-tauri/target/debug/ravengit.exe`, con los seis tamaños del icono RavenGit comprobados dentro del binario. Sin instalador ni compilación macOS en este incremento.

## Aceptación pendiente

En `ssrspython`, confirmado por el usuario, una consulta de sólo lectura contra la URL de publicación reprodujo un fallo HTTPS de obtención de credenciales con interacción deshabilitada. No era un fallo del agente SSH. Se añaden los mensajes de Git Credential Manager al clasificador `HTTPS_AUTH`; el usuario debe autenticar Git para ese remoto antes de repetir. No se cambió su configuración ni se enviaron etiquetas. La clasificación no demuestra que la publicación posterior funcione.

Tras el reporte de un error genérico al confirmar, se separan `TAG_LOCAL_READ` y `TAG_REMOTE_READ`, y se añaden diagnósticos sanitizados para repositorio inexistente/sin acceso y conexiones SSH interrumpidas. Se verificaron 2 pruebas del clasificador y 8 de publicación local, además de Clippy/formato. Esto mejora el diagnóstico, pero no acredita resolver la causa del entorno del usuario ni sustituye compilar/probar ese cambio en nativo. No se modificaron remotos, claves, `known_hosts` ni permisos del usuario; no se publicó su etiqueta para investigar.

Validar en Windows/macOS con repositorio y tag de prueba autorizados: destino nuevo, coincidente y conflictivo; hash remoto confirmado; cambios locales y ramas intactos; selección de push URL distinta a fetch; credenciales inválidas y red interrumpida. La cobertura de fixtures no certifica GitHub/GitLab/Gitea/Bitbucket reales. No mover un tag compartido para realizar la prueba.
