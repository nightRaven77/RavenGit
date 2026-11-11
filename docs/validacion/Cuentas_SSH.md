# Cuentas SSH y agente · primer alcance · 27/10/2026

## Validación automatizada Windows · 28/10/2026

Ampliación posterior de fallos: **9 pruebas SshAccountsPanel aprobadas**, cuatro casos añadidos a los cinco anteriores. Agente vacío, agente inaccesible, cliente/diagnóstico SSH indeterminado y ausencia de declaraciones helper se simulan por IPC; se verifican mensajes, copia acotada con cantidades 0/null y ausencia explícita de identidad/permisos certificados. Otro caso comprueba consulta correcta → fallo de lectura → nueva consulta correcta: retira el resumen/copiar anterior, libera controles y limpia el error al recuperar. No hay aplicación de perfil ni invocaciones de red. No se vació/desconectó el agente real ni se cambió configuración del usuario; esto es cobertura automatizada, **no aceptación nativa de esos fallos**. Sin cambios de producción en esta ampliación.

Continuación posterior: [diagnóstico nativo Windows](Diagnostico_autenticacion_UI_Windows_2026-10-28.md) con consulta SSH/HTTPS, invalidación por destino y copia real aprobadas. Los casos de fallo/confianza, múltiples identidades y macOS conservan sus límites.

El usuario autorizó comenzar la validación después del incremento sin pruebas. Base `b380c1c` con cambios locales conservados. Resultados nuevos, sin conexiones de red ni publicaciones:

- **37 pruebas UI / 4 archivos** aprobadas: SshAccountsPanel, sshAccounts, RemotesPanel e InitializeDialog. Dos regresiones nuevas cubren copia con lista cerrada de campos sin rutas/URLs/etiquetas, portapapeles rechazado sin filtrar el error, invalidación al volver a consultar el agente, respuestas tardías tras cambiar destino y bloqueo sin confianza. La regresión existente de lectura verifica además los títulos de progreso/éxito; se repitieron sus 8 casos tras añadir esa aserción.
- **11 Rust aprobadas + 2 manuales ignoradas**: 6 SSH, 1 persistencia de perfiles y 4 clasificación de errores. El caso nuevo de diagnóstico local cubre declaraciones helper vacías y por host sin devolver sus valores o host privado. Persistencia incluye ida y vuelta de un perfil Bitbucket. No se ejecutaron las pruebas ignoradas de proveedores/publicación.
- TypeScript, Vite y build Tauri **debug Windows sin bundle** aprobados; ejecutable actualizado en `src-tauri/target/debug/ravengit.exe`. No se generó instalador ni release. Comprobación TypeScript adicional tras la última edición de pruebas aprobada.
- Clippy all-targets estricto, formato focalizado de TSX/Rust y diff sin errores aprobados. Cargo avisó que no pudo usar enlaces físicos para la caché incremental y copió sus archivos; no bloqueó compilación o pruebas. No acredita el mecanismo de recuperación de rebase por esa advertencia.

Los dos primeros intentos de compilar una prueba Rust nueva detectaron imports de fs/git ausentes en esa prueba; se corrigieron y se repitió el grupo afectado satisfactoriamente. No requirió correcciones al transporte de producción. Las fixtures del diagnóstico sólo crean configuración temporal; nunca ejecutan el helper declarado. No se cambiaron claves, agente, known_hosts ni credenciales del usuario.

**Alcance pendiente:** aceptación nativa del diagnóstico/portapapeles/avisos nuevos e IPC real sin confianza, credenciales HTTPS válidas/ausentes/rechazadas con proveedores, varias cuentas e IdentityAgent efectivos, y repetición macOS. La identidad SSH y los permisos por proyecto conservan su evidencia previa separada. La compilación no cierra AC-04/09 ni certifica v1 estable. El incremento de recuperación de rebase quedó incluido en el build, pero no se ejercitó su nueva escritura/interrupción en esta tanda de autenticación.

## Cierre de implementación de autenticación delegada · 28/10/2026

Incremento sobre `b380c1c` más cambios locales conservados, **sin pruebas, compilaciones, consultas a proveedores ni pruebas manuales por instrucción del usuario**. No se extrapola la aceptación anterior a estos cambios.

- SSH conserva OpenSSH, preferencia del cliente Windows y agente según configuración del sistema. Las cuentas se seleccionan por host/alias explícito aplicado mediante revisión a descarga/publicación/ambas o al origen de clonado. Se añade Bitbucket como proveedor declarado junto con GitHub/GitLab/Gitea/Otro; los perfiles anteriores Otro siguen siendo válidos y no se migran automáticamente.
- HTTPS conserva los mecanismos de credenciales de Git sin implementar OAuth ni almacenar tokens. El nuevo botón Diagnóstico de autenticación consulta sólo nombres de claves de configuración Git y el estado local del agente; no invoca credential fill, helpers, saludos SSH ni conexiones. La presencia de entradas helper no demuestra que sean efectivas para el host: puede haber restablecimientos vacíos o entradas específicas de otros destinos.
- Comando `read_authentication_status` registrado en IPC, requiere confianza del repositorio, worker bloqueante y exclusión con operaciones Git. Devuelve agente opcional y un booleano de entradas helper; nunca nombres/valores de helpers. Si la selección SSH falla, la UI sigue ofreciendo el diagnóstico HTTPS y declara que no se pudo determinar cliente/agente.
- Copiar diagnóstico sin secretos lleva al portapapeles un JSON acotado: transportes, disponibilidad/cantidad del agente y presencia de declaraciones helper. Excluye URLs, hosts, rutas, nombres de cuenta/repositorio, claves, tokens y salida Git. Indica explícitamente que no verifica identidad ni permisos. El usuario puede pegarlo o guardarlo por su cuenta; no se transmite ni se crea un archivo automáticamente.
- Los diagnósticos se invalidan al cambiar repositorio, destinos o confianza; se descartan respuestas tardías de diagnóstico/agente de otro contexto. Consultar sólo el agente invalida el resumen combinado previo. Los errores de portapapeles se muestran sin salida sensible.
- Comprobar acceso ahora distingue progreso, éxito y error de lectura en el aviso global, sin presentarse como actualización del remoto. Las comprobaciones de publicación siguen en su revisión independiente.

El alcance de implementación es autenticación **delegada al sistema**, con agente SSH prioritario; no hay gestión de claves, arranque del agente, escritura de ssh/config o known_hosts, sesión OAuth ni certificación de cuenta por etiqueta. La identidad real y los permisos se distinguen de la configuración local. Los permisos de lectura no certifican publicación.

Para la tanda final quedan: compilación, regresiones de frontend/IPC/Rust (incluida la opción Bitbucket), bloqueo sin confianza, respuestas tardías, portapapeles admitido/denegado, helper ausente/vacío/específico, agente vacío/inaccesible, múltiples identidades efectivas y proveedores SSH/HTTPS en Windows/macOS. No se ejecutó ninguna de ellas y no se cierran AC-04/09 ni v1 estable.

Prioridad acordada: aprovechar OpenSSH y el agente del sistema para GitHub, GitLab y Gitea, conservando HTTPS mediante el helper de Git. Implementación sobre `e715539` más cambios locales. No incorpora OAuth, APIs del proveedor, almacenamiento de tokens ni gestión de claves privadas.

## Uso

1. Abre Remotos y despliega **Cuentas SSH y agente**. Añade nombre de cuenta, proveedor y host/alias SSH. Los perfiles se comparten entre repositorios del mismo perfil de RavenGit.
2. Si tienes varias cuentas en un host, configura previamente alias distintos en `~/.ssh/config`. Cada alias debe resolver al servidor correcto y seleccionar la identidad prevista. `IdentityFile` e `IdentitiesOnly yes` permiten limitar las identidades ofrecidas por el agente; una clave pública puede identificar la clave privada que ya tiene cargada el agente. Consulta [OpenSSH](https://man.openbsd.org/ssh_config). RavenGit no escribe ese archivo ni carga claves.
3. Elige si aplicar el perfil a descarga, publicación o ambas y pulsa **Revisar uso de …**. Se abre el formulario existente de remoto; revisa las URLs y confirma su configuración explícitamente. Elegir sólo descarga conserva la publicación anterior, incluso si antes dependía implícitamente de la URL de descarga. No transforma HTTPS a SSH.
4. Usa **Consultar agente SSH** para una consulta local. Muestra cliente, disponibilidad y cantidad de identidades; no muestra claves, huellas ni comentarios. **Comprobar acceso** es una acción posterior y separada que utiliza Git contra el remoto revisado.
5. Al clonar puedes introducir la URL SSH y pulsar **Cargar perfiles SSH** para sustituir únicamente su host por un alias guardado. Revisa y confirma el clonado como antes. Puedes introducir manualmente un alias sin depender del catálogo.

El proveedor y el nombre de cuenta son etiquetas declaradas; no certifican quién acepta el servidor. El host/alias de la URL, su usuario/puerto y la configuración OpenSSH determinan la conexión. No se cambia el autor de commits. Editar o quitar un perfil no modifica remotos que ya lo usan. Configurar un perfil tampoco crea una cuenta en GitHub/GitLab/Gitea.

## Agente y límites

- Se conserva selección de OpenSSH mediante GIT_SSH_COMMAND, core.sshCommand, GIT_SSH y cliente predeterminado. En Windows se conserva la preferencia anterior por OpenSSH del sistema cuando no se hereda SSH_AUTH_SOCK. No se cambian servicios, PATH, sockets, claves ni confianza del host.
- La consulta usa `ssh-add -l` junto al ejecutable absoluto seleccionado, o ssh-add del PATH para cliente sin ruta. Tiempo máximo cinco segundos y procesos contenidos. Un IdentityAgent específico del host puede apuntar a otro agente: el diagnóstico del agente heredado no confirma ese caso ni permisos remotos.
- Se conserva BatchMode, StrictHostKeyChecking y el tiempo de conexión existente. No se fuerza un modo exclusivamente agente: OpenSSH conserva sus reglas configuradas y posibles identidades en archivos. No hay prompts de contraseña ni aceptación automática de host.
- Las conexiones Fetch, Pull, Push y tags usan la URL revisada y el mismo transporte existente; no se enrutan por etiquetas ocultas. Los alias persistidos en Git también funcionan fuera de RavenGit.
- Perfiles en `workspace/ssh-accounts-v1.json`, sin credenciales: máximo 50, host/alias único, proveedores acotados, límites de lectura, rechazo de campos extra/archivo corrupto, revisión por token y guardado temporal sincronizado. Escrituras serializadas en la instancia; coordinación multiinstancia no certificada.

## Evidencia

Actualización posterior: [lectura SSH real GitLab, Gitea y GitHub en Windows](SSH_real_Windows_2026-10-27.md) aprobada con agente accesible en destinos autorizados; GitHub también se consultó por su origin HTTPS sin cambiarlo. Sus límites no equivalen a aceptación completa de proveedores ni UI.

Comprobación adicional de identidad: [saludos SSH directos de GitHub, GitLab y Bitbucket en macOS](Identidad_SSH_macOS_2026-10-27.md). GitHub y GitLab devolvieron la misma cuenta; Bitbucket aceptó la llave pero no revela el identificador. No prueba permisos de repositorio ni el perfil de RavenGit; Gitea sigue pendiente.

259 pruebas UI/28 archivos y TypeScript/Vite aprobados. Casos nuevos: persistir sólo metadatos, diagnóstico explícito, bloqueo sin confianza, revisión obsoleta, aplicación por destino sin conexión y clonado por alias. Rechazo de HTTPS/rutas locales/secretos/opciones en alias; preservación de usuario, ruta y puerto SSH.

23 pruebas Rust focalizadas aprobadas: una de persistencia con guardado obsoleto/corrupción/duplicados/alias inválidos, cinco regresiones SSH (incluida sanitización del resumen del agente), cuatro de diagnóstico y trece de remotos. Clippy all-targets estricto y formato aprobados. No se repitió la suite Rust completa histórica.

Build Windows debug sin bundle aprobado. Ejecutable actualizado en `src-tauri/target/debug/ravengit.exe`; no es un instalador firmado.

Pendientes al terminar la implementación inicial: UI nativa del incremento, clientes/agentes reales de Windows y macOS, alias de varias cuentas, IdentityAgent personalizado, autenticación y permisos contra GitHub/GitLab/Gitea con claves del usuario. No se declara AC-04/09 cerrado por fixtures. En esa implementación no se contactaron proveedores ni se cambió la configuración personal de SSH; la comprobación GitLab posterior se registra por separado arriba.
