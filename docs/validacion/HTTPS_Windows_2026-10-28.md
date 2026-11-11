# Lectura HTTPS · Windows · 28/10/2026

Base `b380c1c` con cambios locales de autenticación conservados. El usuario autorizó avanzar con HTTPS o diagnóstico. Se eligió lectura HTTPS de los mismos repositorios desechables previamente autorizados, sin crear repositorios nuevos ni modificar sus remotos SSH.

## Resultado

### Reintento después de convertir a privados

**Actualización posterior:** el usuario confirmó haber configurado HTTPS. Se repitió sólo GitLab con la misma prueba manual y pasó (1 caso, 2,57 s): lectura privada y hash esperado confirmados; HEAD, índice y configuración intactos. El bloqueo HTTPS_AUTH inicial queda resuelto para esta lectura. GitHub y GitLab tienen ahora lectura privada HTTPS aprobada, sin certificar identidad exacta, publicación ni macOS.

El usuario proporcionó para Gitea `http://172.16.3.102:3000/Erick/prueba-ravengit.git`. Es HTTP sin TLS, no una URL HTTPS. No se intentó autenticar ni enviar credenciales a esa dirección y no se asumió HTTPS cambiando el esquema. El acceso SSH anterior conserva su evidencia independiente; para aceptación HTTPS Gitea se necesita un endpoint TLS exacto autorizado. No se alteraron TLS, helpers ni remotos para esta actualización.

El usuario informó que hizo privados GitHub, GitLab y Gitea. Los conectores confirmaron primero GitHub privado y GitLab aún público. Ambos pasaron lectura en ese momento; sólo GitHub acredita lectura privada en esa primera repetición. Tras la confirmación adicional «listo ya quedo gitlab», el conector confirmó también GitLab privado y se repitió exclusivamente su consulta HTTPS.

| Destino | Visibilidad confirmada | Resultado posterior |
| --- | --- | --- |
| GitHub prueba-ravengit | private por el conector | Lectura HTTPS privada aprobada con el hash esperado |
| GitLab prueba-ravengit, tras guardar el cambio | private por el conector | No confirmó lectura; núcleo RavenGit devolvió HTTPS_AUTH sanitizado |
| Gitea prueba-ravengit | Privado según el usuario | HTTPS pendiente: falta URL exacta autorizada; no se deriva una desde SSH ni se prueba HTTP |

La prueba GitLab terminó con código 1 por el acceso no confirmado; no es una regresión de la suite normal ni se etiqueta como publicación fallida. El mensaje indicó que el servidor requiere credenciales disponibles en Git Credential Manager o el helper. No distingue credencial ausente de inválida/rechazada; no se consultó ni imprimió el almacén. La integración conectada del proveedor no acredita la misma sesión que Git HTTPS local. Se requiere que el usuario configure el acceso HTTPS en su sistema y avise antes de reintentar; no se solicita enviar tokens/contraseñas al chat.

Git ls-remote --get-url confirmó que las URLs HTTPS autorizadas no eran reescritas a SSH u otro destino por configuración Git. Las comprobaciones de HEAD, índice y configuración de la prueba se ejecutan incluso si remotes::command devuelve error; quedaron conservados en los reintentos. Sin cambios automáticos de visibilidad, TLS, credenciales o configuración. Las respuestas de conectores se redujeron a visibilidad antes de registrarlas; no se guardan respuestas completas.

Esta actualización supersede el pendiente de visibilidad de ambos proyectos que figura en la consulta histórica siguiente. La identidad exacta de la cuenta GitHub y la escritura HTTPS siguen sin certificarse; el acceso privado correcto no identifica por sí solo la cuenta elegida por el helper.

| Proveedor | Destino de lectura | Resultado |
| --- | --- | --- |
| GitHub | https://github.com/nightRaven77/prueba-ravengit.git | Lectura aprobada y hash esperado confirmado |
| GitLab | https://gitlab.com/nightRaven77/prueba-ravengit.git | Lectura aprobada y hash esperado confirmado |

La prueba ignorada por defecto `ssh::tests::manual_disposable_https_read` usa la fixture temporal con marcador de aceptación y sólo admite esos dos destinos fijos, seleccionados con `RAVENGIT_HTTPS_ACCEPTANCE_PROVIDER`. La rama `codex/ssh-acceptance-20261028-b3ecf814` anunció el commit `78e0d2dc6dba12a9fc82af5b151283aab1b23fcc`. GitHub y GitLab pasaron individualmente (una prueba por ejecución).

Se ejercitó `remotes::command` de producción con `ls-remote --refs`, TLS verificado, redirects deshabilitados y mecanismos no interactivos existentes (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, askpass vacío). No se ejecutó credential fill por separado ni se imprimieron tokens, helpers, errores Git crudos o contenido de configuración.

HEAD, bytes del índice y `.git/config` coincidieron antes/después de cada consulta. Sin Fetch/Pull/Push, commits, tags, cambios de URL, modificaciones manuales a credenciales ni inicio de sesión interactivo. Git puede consultar sus helpers según la configuración existente; no se inspeccionó su almacén ni se determinó si hubo actualización interna de su caché.

## Qué acredita y qué queda pendiente

Consulta posterior de metadatos con los conectores de GitHub/GitLab: ambos destinos `nightRaven77/prueba-ravengit` devolvieron `visibility: public` (GitLab proyecto 88215086). Se registra sólo visibilidad, sin copiar respuestas completas de proveedores. Confirma que estas consultas no cierran la aceptación de un repositorio privado ni demuestran que se usaran credenciales. No se cambió visibilidad ni permisos. Se solicitó al usuario una URL HTTPS privada desechable autorizada, o que indique cuál de los destinos existentes convirtió manualmente a privado. Esa prueba queda pendiente de esa información; no se consultarán repositorios personales como sustituto.

Regresión normal tras añadir el caso manual: 6 pruebas SSH aprobadas y 3 manuales ignoradas por defecto. Clippy all-targets estricto, rustfmt focalizado y diff sin errores aprobados. Sin cambios de transporte de producción ni nueva compilación de aplicación por esta prueba auxiliar.

Confirma lectura de la referencia concreta por HTTPS desde Windows mediante el núcleo de RavenGit. **No determina la identidad ni demuestra que se haya requerido autenticación**: una referencia visible también puede proceder de lectura pública. Tampoco confirma publicación, ramas protegidas, rechazo de credenciales, UI/IPC nativos o macOS. No se extrapola a Gitea/Bitbucket, para los que no se autorizó una URL HTTPS exacta en este recorrido.

La evidencia anterior SSH y su publicación conserva alcance independiente. Continúan pendientes aceptación nativa del nuevo diagnóstico y portapapeles, cuentas múltiples, matriz HTTPS privada/con credenciales rechazadas y macOS. No se cierran AC-04/09 ni v1 estable.
