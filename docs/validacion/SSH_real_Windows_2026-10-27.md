# SSH real · Windows · 27/10/2026

Base `2aea17f` (cuentas SSH) más una prueba manual optativa, sin modificaciones del transporte de producción. Validación a través del núcleo Rust de RavenGit; no se presenta como recorrido de la interfaz nativa.

## Resultado GitLab

- Servicio ssh-agent de Windows activo; OpenSSH de Windows disponible, sin SSH_AUTH_SOCK heredado. Consulta local sanitizada: agente accesible, siete identidades cargadas; no se registraron claves, huellas ni comentarios.
- Se utilizó únicamente `origin` del repositorio del proyecto actual, cuyo transporte es SSH hacia gitlab.com. El cliente se seleccionó con la misma precedencia de configuración que usa RavenGit.
- Lectura explícita mediante `remotes::contact(..., fetch=false, trusted=true)` y su revisión actual. Pasó `ls-remote --heads` con las opciones de producción, incluida verificación estricta del servidor y modo sin preguntas interactivas.
- Comparación independiente antes/después: HEAD, bytes del índice y configuración local Git idénticos. Sin Fetch, Push, cambio de remoto, carga de claves, inicio de servicios ni cambios de known_hosts.

Esto confirma acceso de lectura al repositorio en esa sesión y entorno. La disponibilidad del agente no prueba qué identidad concreta aceptó el servidor ni que la autenticación usara exclusivamente una clave del agente: OpenSSH conserva sus reglas y alternativas configuradas. Tampoco confirma publicación ni acceso a otros proyectos del mismo host.

## Ampliación con destinos elegidos por el usuario

El usuario indicó expresamente los repositorios SIFAP (Gitea), portfolioErick (GitHub) y ravengit (GitLab), todos con remoto origin. Se ejecutaron cuatro comprobaciones de lectura en esta ampliación:

| Destino autorizado | Transporte comprobado | Resultado |
| --- | --- | --- |
| SIFAP · Gitea | SSH de origin | Aprobado; HEAD, índice y configuración local idénticos |
| portfolioErick · GitHub | HTTPS de origin | Aprobado; no se presenta como prueba SSH |
| portfolioErick · GitHub | SSH explícito al mismo proyecto, derivado del origen HTTPS de github.com | Aprobado; sin persistir la URL SSH y con HEAD, índice y configuración local idénticos |
| ravengit · GitLab | SSH de origin, repetición | Aprobado; HEAD, índice y configuración local idénticos |

El proveedor Gitea es el declarado por el usuario para su servidor. La lectura SSH no identifica la versión ni certifica APIs del servidor. Las consultas GitHub HTTPS y SSH son independientes; el origin de portfolioErick se conservó en HTTPS. No hubo autenticación web automatizada ni cambios de helper.

## Repetición optativa

La prueba `ssh::tests::manual_provider_read_with_agent` está ignorada en ejecuciones normales. Exige seleccionar explícitamente `RAVENGIT_SSH_ACCEPTANCE_REPO` y `RAVENGIT_SSH_ACCEPTANCE_REMOTE`; requiere repositorio de trabajo con HEAD e índice existentes. No registra rutas del proyecto, URLs ni referencias remotas.

```powershell
$env:RAVENGIT_SSH_ACCEPTANCE_REPO = 'C:\ruta\al\repositorio'
$env:RAVENGIT_SSH_ACCEPTANCE_REMOTE = 'origin'
cargo test --manifest-path src-tauri/Cargo.toml ssh::tests::manual_provider_read_with_agent --lib -- --ignored --exact --nocapture
```

Ejecución inicial: una prueba GitLab aprobada. Ampliación posterior: cuatro comprobaciones aprobadas según la tabla. En caso de error se comparan primero las invariantes y se comunica sólo el diagnóstico sanitizado. No modifica configuración para hacer pasar la prueba ni reintenta automáticamente.

Para probar SSH temporalmente sobre un origin HTTPS de GitHub se añade `RAVENGIT_SSH_ACCEPTANCE_GITHUB_SSH=1`. La prueba exige una URL editable limpia HTTPS de github.com sin puerto, contraseña ni parámetros; deriva `git@github.com:…` únicamente para ls-remote con el transporte de producción. No modifica el remoto. Omite esa variable para comprobar el transporte guardado de origin.

## Pendientes

Lectura SSH comprobada en los tres destinos seleccionados de GitHub, GitLab y Gitea en Windows. Siguen pendientes identidad efectiva, publicación, alias de varias cuentas, IdentityAgent por host, recorrido nativo del panel y macOS. No se cierran AC-04/09 por estas lecturas ni se extrapolan a otros repositorios/cuentas.
