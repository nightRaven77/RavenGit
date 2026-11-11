# Historial de Cambios (Changelog)

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0-beta.1] - 2026-11-10

Primera versión candidata pública (Beta 1) de RavenGit, lista para validación y pruebas de distribución en Windows x64 y macOS.

### Añadido

#### Historial y Navegación
- Grafo visual e interactivo de commits en DAG paginado con identificación de ramas locales, remotas y referencias HEAD.
- Navegación ágil mediante teclado entre commits padres e hijos.
- Búsqueda en memoria de commits por autor, mensaje o hash.
- Filtros por rama activa, rama remota o historial completo.

#### Cambios y Preparación (*Staging*)
- Visualización de diferencias (*diff*) en formato unificado y dividido (*split diff*).
- Preparación selectiva de cambios a nivel de archivo individual y bloque de código (*hunk staging*).
- **Preparación múltiple:** selección por casillas y preparación en lote (*stage all / stage selected*) en una sola transacción atómica de índice.
- Detección de bloqueos de Git (index.lock) con avisos descriptivos de protección.
- Creación de commits con detección de autor, validación de mensajes y opción de mend (modificar último commit) con respaldo automático del commit reemplazado.

#### Restauración y Deshacer (*Worktree Restore & Redo*)
- Diálogo modal accesible para restaurar archivos modificados del árbol de trabajo hacia el índice.
- Copia de seguridad atómica automática en .git/ravengit-restore/ antes de cada restauración.
- Acción de **Rehacer cambios** para recuperar el estado previo modificado desde el respaldo.
- Protección estricta contra obsolescencia (STALE_RESTORE): rechazo de confirmaciones si el archivo o repositorio cambió desde la última vista previa.

#### Rebase Interactivo
- Editor visual para secuencias de 1 a 50 commits lineales.
- Acciones soportadas: pick, eword (editar mensaje), squash (combinar con commit anterior), ixup (combinar descartando mensaje) y drop (descartar commit).
- Reordenamiento visual de commits en el plan interactivo.
- Generación de respaldo automático de la referencia de la rama antes de ejecutar reescrituras de historia.
- Detección de pausas por conflicto, con controles integrados para resolver y continuar o abortar limpiamente.

#### Conflictos y Operaciones Avanzadas
- Editor textual integrado de conflictos con acceso a tres versiones: Base, Local y Entrante.
- Guardado de resoluciones con respaldo automático antes de modificar el archivo en disco.
- Panel guiado de recuperación de operaciones interrumpidas para merge, ebase, cherry-pick y evert.
- Controles explícitos de **Continuar** y **Abortar** con verificación de estado del índice.

#### Stash, Ramas y Etiquetas
- Almacenamiento de cambios en Stash con opción de incluir archivos sin seguimiento (*untracked*) y conservar la preparación del índice.
- Restauración de stashes con gestión de conflictos y finalización segura.
- Creación, cambio y renombrado de ramas locales con validación de colisiones.
- Creación de etiquetas ligeras (*lightweight tags*) locales y publicación selectiva individual hacia remotos autorizados.

#### Transporte y Autenticación
- Operaciones seguras de Fetch, Pull (con integración controlada por merge) y Push.
- Rechazo de publicaciones obsoletas (STALE_PUSH) cuando el remoto ha recibido cambios divergentes concurrentes.
- Diagnóstico local de conectividad HTTPS y perfiles SSH delegados a OpenSSH, sin almacenar credenciales en texto plano.
- Exportación sanitizada del registro de actividad en formato JSON sin rutas absolutas ni secretos.

### Seguridad
- **Puerta de confianza por ruta:** exigencia de autorización explícita antes de abrir o manipular cualquier repositorio en una ruta no autorizada.
- **Serialización de escrituras:** exclusión mutua interna en el núcleo Rust para impedir ejecuciones concurrentes de comandos Git destructivos.
- **Planes de un solo uso:** tokens criptográficos SHA-256 temporales que invalidan acciones si el estado del repositorio cambia externamente.
- **Privacidad local-first:** operación 100% desconectada de red para repositorios locales, sin telemetría ni envío de datos a servidores externos.

### Accesibilidad
- Soporte para navegación completa por teclado con indicador de foco visual continuo de alto contraste.
- Diseño responsivo adaptado para operar en ventanas compactas desde 900 × 640 píxeles.
- Diálogos modales con cierre estándar mediante tecla Escape y retorno de foco al elemento de origen.
