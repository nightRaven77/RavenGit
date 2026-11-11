# Permisos SSH en remotos desechables · Windows · 28/10/2026

Base `b8b680e`. El usuario proporcionó cuatro repositorios vacíos llamados prueba-ravengit y autorizó explícitamente crear un commit mínimo y publicarlo en una rama de prueba, sin force push ni borrados. Sólo se operó una fixture temporal; no se usaron los repositorios personales anteriores ni el checkout de RavenGit como origen de publicación.

## Resultado

Rama: `codex/ssh-acceptance-20261028-b3ecf814`.

Commit: `78e0d2dc6dba12a9fc82af5b151283aab1b23fcc`, mensaje «RavenGit disposable SSH acceptance», autor de prueba RavenGit Acceptance. Contiene únicamente RAVENGIT-ACCEPTANCE.txt, dos líneas sin credenciales ni código personal.

| Proveedor | Destino autorizado | Resultado |
| --- | --- | --- |
| Gitea | Repositorio Erick/prueba-ravengit, URL SSH y puerto 2222 indicados por el usuario | Lectura, revisión, publicación y reconsulta del hash aprobadas |
| GitLab | nightRaven77/prueba-ravengit por gitlab.com | Lectura, revisión, publicación y reconsulta del hash aprobadas |
| GitHub | nightRaven77/prueba-ravengit por github.com | Lectura, revisión, publicación y reconsulta del hash aprobadas |
| Bitbucket | mokas_team/prueba-ravengit por ssh.bitbucket.org | Primer intento bloqueado por SSH_HOST_KEY; reintento pedido por el usuario aprobado: lectura, revisión, publicación y hash exacto |

En los cuatro casos aprobados, las referencias anunciadas estaban vacías antes de publicar. La revisión confirmó destino de rama inexistente. Tras publicar, ls-remote devolvió exactamente la rama y el hash anteriores. HEAD local, bytes del índice y configuración local se conservaron. No se estableció upstream, no se publicaron tags y no se borraron referencias. Las cuatro ramas quedan en los servidores para revisión del usuario.

## Flujo ejercitado y límites

Recorrido posterior de interfaz: [aceptación nativa Windows](Cuentas_SSH_UI_Windows_2026-10-28.md). Lectura de los cuatro remotos y revisión Push Bitbucket/Gitea aprobadas; GitHub/GitLab también aprobados en el reintento posterior solicitado por el usuario, tras el bloqueo inicial con agente vacío. No hubo nuevas publicaciones. No confundir este resultado parcial de UI con la publicación del núcleo ya aprobada aquí.

Se ejecutó el núcleo real de RavenGit: `remotes::read`, consulta explícita ls-remote, `push::preview`, `push::publish` y verificación independiente del hash anunciado. Se conservan verificación estricta de host, cliente OpenSSH seleccionado, modo no interactivo, revisión de estado local/remoto y publicación normal de un único refspec con hash congelado.

Esto acredita lectura y creación de esa rama en esos repositorios durante esta sesión Windows. No certifica permisos sobre otros proyectos, ramas protegidas, identidad exacta aceptada en cada conexión, HTTPS, macOS ni el recorrido de IPC/interfaz. Los saludos de identidad constan por separado en [Identidad SSH Windows](Identidad_SSH_Windows_2026-10-28.md).

## Bitbucket: bloqueo inicial y reintento aprobado

El saludo anterior aprobado usó bitbucket.org; el repositorio autorizado ahora usa ssh.bitbucket.org. La verificación estricta no confirmó este último nombre. No se añadió ni sustituyó ninguna clave de host. Ante la alternativa propuesta, el usuario eligió mantener ssh.bitbucket.org y verificar su clave manualmente. No se cambiará el host ni se reintentará hasta que confirme haber completado esa verificación. La autorización de publicación ya está concedida; no requiere repetir la autorización para el mismo commit/rama/destino.

Posteriormente el usuario pidió «reintenta bitbucket». Se ejecutó únicamente ese remoto, con la misma fixture, commit, rama y verificación estricta. La prueba pasó en 53,91 s: lectura del remoto vacío, revisión, publicación confirmada y hash remoto exacto; HEAD, bytes del índice y configuración local idénticos. No se modificó known_hosts ni se cambió a bitbucket.org. Bitbucket deja de estar pendiente para esta prueba de lectura/publicación; su saludo sigue sin revelar identidad exacta.

## Repetición controlada

La nueva prueba `ssh::tests::manual_disposable_publish_acceptance` está ignorada por defecto y exige `RAVENGIT_SSH_ACCEPTANCE_ALLOW_PUBLISH=1`, fixture bajo Temp y marcador explícito en .git con rama/hash. Rechaza cualquier remoto con referencias anunciadas, por lo que no debe repetirse sobre los cuatro ya publicados. El reintento de Bitbucket reutilizó la misma fixture y seleccionó exclusivamente ese remoto.

Fixture y preparación en `state/ssh-publish-acceptance.local/` (ignorados). El manifiesto conserva la ruta temporal, rama y hash; no se registran claves ni salida remota sensible. El primer intento de preparación quedó bloqueado por permisos del sandbox; se preparó una carpeta temporal nueva con ejecución autorizada, sin borrar la carpeta incompleta.

Se ajustó la compilación del auxiliar de timeout de rebase para que exista sólo en tests Unix, único lugar donde se utiliza; sin cambios en la lógica de transporte o publicación de producción. No se repiten las suites UI/Rust completas por esta aceptación manual.

Clippy all-targets estricto, rustfmt focalizado de ssh.rs/rebase.rs y git diff --check aprobados. Se conservó sin reformatear el archivo branches.rs del checkout, ajeno a esta aceptación.

Regresión normal de SSH: cinco pruebas aprobadas y las dos aceptaciones reales ignoradas por defecto; no publica al ejecutar la suite normal.
