# SSH Windows: selección de cliente y diagnóstico seguro

Fecha: 2026-10-21.

## Incidencia

Fetch y Pull mostraban un error genérico en un remoto GitLab SSH. La configuración
global elegía OpenSSH de Windows mediante `core.sshCommand`, pero RavenGit imponía
`GIT_SSH_COMMAND=ssh ...`, sustituyendo esa selección. Git puede resolver ese nombre
desde su propio entorno y utilizar un cliente distinto del conectado al agente
Windows. El error no demuestra que falte una cuenta ni una clave registrada.

Diagnóstico realizado: servicio `ssh-agent` activo y automático, `ssh-add -l` con
salida correcta (sin mostrar claves ni sus comentarios), autenticación no interactiva
GitLab correcta con OpenSSH Windows y consulta `ls-remote` de la rama main del
repositorio afectado correcta. No se ejecutó Fetch ni se modificaron refs o archivos
del repositorio del usuario. No se alteró su configuración Git, agente ni claves.

## Corrección

- Selección con precedencia `GIT_SSH_COMMAND` → `core.sshCommand` → `GIT_SSH`.
- Lectura NUL-terminada de la configuración para preservar rutas con espacios y
  distinguir terminadores de valores con caracteres de control.
- Sólo ejecutables literales OpenSSH `ssh`/`ssh.exe`, con ruta absoluta opcional
  y comillas exteriores. La ruta se cita como un único argumento de shell para Git;
  no se interpreta como un script o como una lista arbitraria de argumentos.
- Si se necesita IdentityFile, User, Port u otras opciones, usar `~/.ssh/config`.
  Comandos con argumentos y variantes plink quedan bloqueados con un mensaje,
  no se ignoran silenciosamente. Sólo se aplica al transporte SSH: HTTPS y rutas
  locales no quedan bloqueados por una configuración SSH no compatible.
- En Windows, sin selección explícita y sin `SSH_AUTH_SOCK`, preferencia por
  `%SystemRoot%/System32/OpenSSH/ssh.exe` si existe. Si no, `ssh` del entorno.
- Se mantienen BatchMode, StrictHostKeyChecking, timeout de conexión, límites de
  procesos y auxiliares, y autenticación no interactiva. No se aceptan hosts nuevos
  ni se desactiva TLS. Se reutiliza el agente del usuario sin iniciarlo ni modificarlo.
- Se drena stderr completo, clasificando como máximo sus primeros 16 KiB en memoria
  temporal. Sólo se conserva una categoría enum, no el texto original. Los mensajes
  de UI son fijos: autenticación SSH, host key, DNS, conexión, HTTPS o TLS. Lo no
  reconocido conserva el fallo genérico; no se expone salida arbitraria del servidor.
- Los errores orientan, no autorizan reintentos automáticos ni prometen ausencia
  de escrituras ante fallos de publicación. Se conserva el tratamiento incierto de push.
- Confirmación de Remotos en bloque vertical: nombre, URL, explicación y acciones
  ya no se comprimen como columnas estrechas dentro de `.trust-panel`.

## Alcance y validación

La corrección no añade OAuth ni gestión propia de cuentas, claves o contraseñas.
Un remoto SSH usa claves/agente; para HTTPS se requieren credenciales disponibles
en el helper de Git. No se necesita un nuevo login web para el SSH ya autenticado.

Pruebas: 23 casos de red/procesos/SSH aprobados y un entrypoint auxiliar Windows
ignorado intencionadamente; después, las cuatro pruebas finales SSH aprobadas,
incluida configuración real en un fixture y ruta con espacios. Las suites se solapan.
62 pruebas de interfaz aprobadas. Se preservan los tests de deadline, tuberías,
límites de salida y terminación de descendientes. No se repitió toda la suite Rust.
Clippy con `-D warnings`, build TypeScript/Vite y compilación nativa Windows x64
debug sin bundle aprobados. No se generó ni firmó un instalador.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib -- --test-threads=4 --skip branches:: --skip changes:: --skip git:: --skip merge:: --skip pull:: --skip push:: --skip trust::
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib ssh:: -- --test-threads=4
npm test -- --maxWorkers=1
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
npm run tauri build -- --debug --no-bundle
```

Pendiente de confirmación manual: reabrir RavenGit actualizado, comprobar acceso
y Fetch en Remotos, y después revisar Pull. El diagnóstico de acceso real fue por
CLI de sólo lectura; no se presenta como una prueba automática completa de la UI
contra GitLab. OAuth, plink y comandos SSH arbitrarios no se declaran soportados.

Referencias: [Git: core.sshCommand y ssh.variant](https://git-scm.com/docs/git-config)
y [Microsoft: agente y claves OpenSSH Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).
