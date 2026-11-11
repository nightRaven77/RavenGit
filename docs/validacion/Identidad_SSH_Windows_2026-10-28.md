# Identidad SSH · Windows · 28/10/2026

Base `b8b680e`; continuación en Windows indicada expresamente por el usuario. Se revisaron Git, AGENTS.md, contexto y fila de autenticación del mapa. Se conservaron los cambios documentales locales previos. No se consultaron repositorios remotos ni se ejecutó Fetch/Push/clone.

## Resultado de saludos directos

OpenSSH de Windows, mismo ejecutable literal configurado en core.sshCommand del proyecto. Servicio ssh-agent activo y consulta local con siete identidades; sin SSH_AUTH_SOCK heredado ni overrides GIT_SSH/GIT_SSH_COMMAND. No se mostraron huellas ni comentarios de las claves.

| Proveedor | Saludo SSH desde Windows | Cuenta devuelta |
| --- | --- | --- |
| GitHub | Autenticación confirmada; salida 1 porque no proporciona shell | `nightRaven77` |
| GitLab.com | Autenticación confirmada; salida 0 | `nightRaven77` |
| Bitbucket | Tras el ajuste de clave comunicado por el usuario, autenticación SSH aceptada; salida 0 | El saludo no revela la cuenta |
| Gitea · alias `gitea` | Autenticación SSH confirmada; salida 0 | `Erick` |

GitHub/GitLab: `ssh -T` con BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout=8, ConnectionAttempts=1 y NumberOfPasswordPrompts=0. Se mantienen los métodos configurados de OpenSSH; no se aceptan prompts ni claves de host automáticamente. Las opciones de verificación y modo no interactivo coinciden con la política de RavenGit; esta prueba usa un límite de conexión más corto.

## Incidencia del sondeo inicial

El primer sondeo añadió PreferredAuthentications=publickey, PasswordAuthentication=no y KbdInteractiveAuthentication=no, opciones que RavenGit no fuerza. GitHub/GitLab devolvieron rechazo. Una consulta diagnóstica posterior de GitHub con la política normal de OpenSSH confirmó una identidad aceptada y ninguna falla de firma del agente; sólo se conservaron contadores y resultado sanitizado, sin salida detallada. Las comprobaciones finales no interactivas, sin aquellas restricciones adicionales, devolvieron los saludos de la tabla. No se determinó la causa de esa diferencia ni se modificó configuración para corregirla.

## Límites y continuación

Actualización de la misma fecha: el usuario informó haber agregado la clave para Bitbucket y confirmó el alias `gitea`. Se consultaron ambos saludos una vez con las opciones no interactivas y verificación estricta indicadas arriba. Bitbucket aceptó la autenticación sin revelar cuenta; Gitea respondió con `Erick`. No se registró el nombre de la clave devuelto por Gitea ni se consultaron proyectos. El bloqueo inicial de confianza en Bitbucket quedó superado tras la intervención del usuario, sin cambios automáticos del asistente.

- Identidad SSH: GitHub y GitLab devolvieron `nightRaven77`; el alias gitea devolvió `Erick`. Son identificadores de servidores diferentes, sin presumir que sean la misma cuenta. Bitbucket confirmó autenticación con llave sin revelar cuenta. No se identifica cuál de las siete claves fue aceptada ni se certifica un modo exclusivamente agente.
- Permisos del proveedor: no comprobados en esta continuación. El saludo no prueba lectura/publicación de proyectos, ni HTTPS.
- RavenGit: no se recorrió su UI ni el perfil seleccionado. Elegir el mismo ejecutable no sustituye su flujo de autenticación.
- Bitbucket: verificación estricta y autenticación aprobadas después del ajuste informado por el usuario; identidad exacta sigue pendiente. No se cambió known_hosts ni se extrapoló la aceptación Mac.
- Gitea: el alias gitea estuvo disponible en esta consulta; ya no hay una comprobación de saludo pendiente por indisponibilidad ni se necesita monitor para ella. Para permisos sólo se usará un remoto desechable ya autorizado; no se reutilizarán autorizaciones de repositorios personales.

Cambios de esta revisión exclusivamente documentales; sin commits, ramas, publicaciones, cambios de credenciales, carga de claves ni cambios de host. El ajuste de opciones fue por invocación, sin persistir en Git ni SSH.
