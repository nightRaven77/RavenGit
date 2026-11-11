# Identidad SSH · macOS · 27/10/2026

## Actualización Gitea · 30/10/2026

El alias SSH local `gitea` volvió a estar accesible. La consulta `ssh -T` en modo no interactivo (`BatchMode=yes`, `StrictHostKeyChecking=yes`, `ConnectTimeout=8`, `ConnectionAttempts=1`, `NumberOfPasswordPrompts=0`) recibió el saludo de Gitea con la identidad `Erick` y código de salida 0. Se usó el host/puerto configurado por el alias, sin mostrar esos valores en el registro. La regla local del alias pide confirmación interactiva de clave de host; esta llamada exigió verificación estricta sólo para la invocación y no añadió ni cambió confianza.

Esto acredita que OpenSSH presentó una identidad aceptada por ese Gitea y que el servidor anunció `Erick`. No identifica cuál llave ofrecida fue aceptada, no prueba permisos de proyecto ni HTTPS y no ejercita perfiles, IPC o UI de RavenGit. No se clonó ni consultó repositorio alguno. No se modificaron configuración, credenciales, agente ni `known_hosts`; no hay prueba automatizada ni aceptación nativa de RavenGit asociada a este saludo.

El usuario aclaró posteriormente que la continuación del 28/10 sería en Windows. Sus [resultados propios](Identidad_SSH_Windows_2026-10-28.md) se registran por separado; no alteran la evidencia macOS siguiente.

Continuación solicitada el 28/10: la revisión de Git, instrucciones, contexto, mapa y evidencia se realizó en el checkout Windows sincronizado, HEAD `b8b680e`, inicialmente limpio. La ruta macOS solicitada no está disponible; no se ejecutaron nuevas conexiones ni el flujo de autenticación de RavenGit. Gitea no está accesible según el usuario, sin nueva comprobación de red. Se requiere su host/alias exacto y ejecución desde la Mac; no se configuró monitor sin destino. Para permisos se utilizará únicamente un remoto desechable ya autorizado, sin reutilizar autorizaciones anteriores de repositorios personales. No se cambiaron credenciales ni confianza del host.

## Comprobaciones directas

Se consultó el saludo SSH de GitHub y GitLab desde OpenSSH local, sin clonar ni consultar repositorios. Ambas conexiones usaron modo no interactivo, verificación estricta de la clave de host, límite de conexión de 8 segundos y cero intentos de contraseña.

| Proveedor | Resultado del saludo | Identidad devuelta |
| --- | --- | --- |
| GitHub | Autenticación SSH aceptada; el servicio no ofrece shell | `nightRaven77` |
| GitLab.com | Autenticación SSH aceptada | `nightRaven77` |
| Bitbucket | Autenticación SSH aceptada con llave; el servicio no ofrece shell | El saludo no revela la cuenta |

GitHub y GitLab identificaron la misma cuenta. Bitbucket confirmó que aceptó una llave SSH, pero no devolvió un identificador de cuenta. Esto comprueba el saludo de autenticación de OpenSSH en esta Mac, pero no determina cuál de las identidades ofrecidas por OpenSSH fue aceptada ni verifica permisos sobre un repositorio. Tampoco ejercita el perfil guardado o el flujo de remotos de RavenGit.

## Límites y seguridad

- Bitbucket se reintentó después de que el usuario configuró la llave de host: autenticó correctamente. En el primer intento OpenSSH rechazó la conexión porque no había una clave ED25519 de `bitbucket.org` confiable en `known_hosts`; el agente no añadió ni modificó esa configuración.
- Gitea no se consultó porque esta prueba no tenía un host específico verificado.
- No se probaron HTTPS, Fetch, Push, permisos de proyecto ni UI. No se consultaron repositorios ni se modificaron credenciales/configuración/`known_hosts`; Bitbucket se reintentó manualmente después del cambio del usuario, sin reintentos automáticos.
- Es evidencia de identidad devuelta por dos saludos SSH directos en macOS; no cierra la aceptación del transporte de RavenGit, Windows ni AC-04/09.
