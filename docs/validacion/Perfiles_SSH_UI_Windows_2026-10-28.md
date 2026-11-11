# Perfiles SSH · aceptación nativa Windows · 28/10/2026

Continuación de [cuentas y transporte](Cuentas_SSH_UI_Windows_2026-10-28.md), sobre `b8b680e` con cambios locales conservados. Mismo ejecutable debug, perfil aislado y repositorio temporal autorizado; sin configuración personal, claves ni nuevas publicaciones.

## Aprobado

- Alta desde UI de «Aceptación UI temporal», proveedor GitHub, alias `acceptance.invalid`. Sólo metadatos; no se intentó conectar a ese nombre.
- Edición de la etiqueta a «Aceptación UI temporal editada», sin duplicar el alias ni perder los otros cuatro perfiles.
- Guardado con aviso «Perfiles SSH guardados» y vaciado del formulario. El catálogo persistido quedó con cinco perfiles.
- Cierre normal, reapertura, apertura de la fixture y lectura del catálogo desde UI: reapareció la etiqueta editada y el alias correcto.
- «Revisar uso» con destino Descarga sobre el remoto desechable Bitbucket propuso `git@acceptance.invalid:mokas_team/prueba-ravengit.git`, conservando publicación en `git@ssh.bitbucket.org:mokas_team/prueba-ravengit.git`. Mostró que no había conexión ni cuenta verificada. La propuesta se cerró sin guardar.
- HEAD, bytes del índice y `.git/config` idénticos al manifiesto después de cerrar la propuesta. La aplicación del perfil todavía no se confirma en configuración Git con esta prueba.

Recorrido iniciado a 900 × 640 y formulario ampliado a 1366 × 768. Se observó deuda de navegación: el formulario de remoto propuesto queda después de la lista y fuera de vista, mientras el foco permanece en el inspector de cuentas; es necesario desplazarse a otra columna para revisarlo. No equivale a aceptación completa de teclado/accesibilidad.

Durante la navegación se activó una consulta de lectura adicional al remoto desechable Bitbucket; aprobada, sin Fetch ni cambios de referencias. No se conectó al alias temporal.

## Pruebas focalizadas

- Vitest: **35 pruebas / 4 archivos**, aprobadas (`SshAccountsPanel`, `sshAccounts`, `RemotesPanel`, `InitializeDialog`).
- Rust accounts: **1 aprobada**, persistencia, rechazo de revisión obsoleta, duplicados y alias inválidos sin sobrescribir.
- Rust SSH: **5 aprobadas y 2 manuales ignoradas**; diagnóstico de agente vacío y descarte de comentarios, selección de cliente y opciones de verificación estricta.
- Rust diagnóstico: **4 aprobadas**, clasificación sanitizada de agente vacío, autenticación HTTPS, acceso de repositorio y errores de conexión SSH.

Primeras ejecuciones Vitest/Rust fallaron por acceso a temporales dentro del sandbox. Ambas pasaron con permisos normales de ejecución; no se modificó código para eludir esos errores. El filtro inicial `process::tests` no seleccionó pruebas en Windows y no cuenta como cobertura.

## Pendientes de este recorrido

El usuario confirmó «Sí, quitar el perfil temporal». Se pulsó Quitar perfil Aceptación UI temporal editada en la instancia aislada; apareció Perfiles SSH guardados y desapareció ese perfil. Tras cerrar, el catálogo persistido conserva exactamente los cuatro perfiles originales (host, etiqueta y proveedor); acceptance.invalid está ausente. HEAD, bytes del índice y configuración Git de la fixture siguen idénticos al manifiesto. Traza local ignorada: `native-profiles-delete-trace.json`. Instancia aislada cerrada.

La aplicación efectiva y restauración se comprobaron posteriormente como se detalla a continuación. Siguen pendientes múltiples cuentas efectivas, HTTPS y macOS. No se marca AC-09 completo. No se tocaron claves ni el perfil habitual de RavenGit.

## Aplicación efectiva por destino · continuación autorizada

El usuario autorizó continuar con descarga, publicación y ambas. Mismo ejecutable/perfil aislados, ventana ampliada a 1366 × 768. Se respaldaron los bytes originales de `.git/config` de la fixture, verificando que coincidieran con el manifiesto previo. Se usó únicamente su remoto llamado bitbucket y los perfiles de metadatos ya existentes; **sin ejecutar consultas de red, Fetch, Pull ni Push durante este recorrido**.

Todas las URLs de la siguiente tabla conservaron usuario `git` y ruta `mokas_team/prueba-ravengit.git`. Las combinaciones transitorias con GitHub/GitLab sólo sirven para comprobar sustitución local del host; no identifican repositorios autorizados adicionales y nunca se contactaron.

| Modalidad y perfil | Descarga guardada · host | Publicación guardada · host | Resultado |
| --- | --- | --- | --- |
| Descarga · GitHub prueba | github.com | ssh.bitbucket.org | Cambió sólo descarga; materializó la publicación previa explícitamente para conservar su destino |
| Publicación · GitLab prueba | github.com | gitlab.com | Cambió sólo publicación; conservó descarga del caso anterior |
| Descarga y publicación · Bitbucket prueba | ssh.bitbucket.org | ssh.bitbucket.org | Cambió ambas URLs al host original |

En cada caso se pulsó Revisar uso del perfil, Revisar configuración y Confirmar. La revisión mostró ambos destinos y «No se iniciará ninguna conexión». El resultado fue «Configuración del remoto actualizada localmente. No se contactó el servidor». Se verificaron las URLs persistidas mediante `git config --local --get` después de cada guardado; los estados de coincidencia de host en el catálogo se actualizaron correctamente. Los controles se bloquearon mientras se aplicaba la operación.

Tras el tercer caso se cerró la instancia. El cambio a ambas conservaba un pushurl explícito equivalente al destino original; para dejar la fixture exactamente como estaba se restauró el archivo completo desde el respaldo local verificado, después de comprobar que la ruta absoluta estuviera bajo Temp. Configuración final, HEAD, bytes del índice y ejecutable habitual coinciden con el manifiesto inicial. Restauración exacta comprobada por CLI; no se certifica un recorrido de restauración de bytes desde UI.

Traza AX local ignorada: `state/ssh-ui-acceptance.local/native-profiles-apply-trace.json`. Sin cambios de producción ni nuevas suites/builds por esta aceptación nativa; las 35 UI y 10 Rust focalizadas del recorrido anterior conservan su alcance. La prueba acredita aplicación de metadatos a configuración Git, no identidad autenticada, permisos de proveedor ni selección real de varias claves. Queda además la deuda de foco/navegación del formulario observada arriba.
