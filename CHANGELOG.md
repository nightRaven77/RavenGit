# Historial de Cambios (Changelog)

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

### Añadido
- Grafo estilo **Tributary** con avatares circulares de autor, columna izquierda `Rama / Tag` redimensionable (`120–280 px`), iconos duales de sincronización local/remoto colapsando remotos coincidentes, separadores temporales (`Hoy`, `Esta semana`, `Anterior`) y selector de estilo (*Tributary* / *Compacto*) en *Apariencia*.
- Motor híbrido nativo **`gix` (gitoxide)** + Git CLI, verificador integrado de entorno (`Entorno y motor Git…`) y carga progresiva del historial con scroll infinito.
- Pestañas multi-repositorio con sesiones y bloqueos aislados, observador local en tiempo real con fila **WIP** conectada a `HEAD` y gestor completo de **Git Worktrees**.
- Búsqueda profunda en todo el historial y en código fuente (`-S` / `-G`), historial de archivo (`--follow`), **Git Blame** interactivo y comparación de rango entre dos commits (`Shift+Clic`).
- **Seguridad 2.0:** snapshots locales (manuales y automáticos con retención configurable) y ciclo **Undo / Redo** con vista previa (`⌘Z` / `⇧⌘Z`).
- **Diff visual de imágenes** (lado a lado, cortina deslizable y superposición), diferencias intra-línea, resaltado de sintaxis, minimapa, líneas de contexto configurables y preparación/descarte por línea.
- Panel integrado de **Git LFS** (estado, descarga y bloqueos) y **Submódulos Git**.
- Paleta de comandos (`⌘K`), guía interactiva de **Atajos de teclado** (`?`), 5 temas (incluyendo tema claro *Arctic Light* y alto contraste), menús contextuales y apertura en aplicaciones externas locales.
- **Modo Simple en 1 clic:** alternador persistente en barra superior y barra de estado para enfocarse en el flujo cotidiano sin herramientas avanzadas.
- **Integración opt-in de Pull Requests / Merge Requests (GitHub y GitLab):** detección local offline vía `gh` / `glab`, consulta explícita bajo demanda sin tráfico en segundo plano y badges `#PR` en ramas del grafo.
- Diálogo de autorización explícita al abrir repositorios en modo solo lectura.

### Cambiado
- Rediseño compacto de dos filas en el encabezado, agrupación de ramas por prefijo en la barra lateral y persistencia de visibilidad de columna `Autor` y ancho de `Rama / Tag` por repositorio.
- División de código (`React.lazy` + `Suspense`) en diálogos y paneles secundarios para mantener el paquete principal por debajo de 500 kB.
- Refactorización modular de `src/App.tsx`, `src/App.css` (`src/styles/*`) y `src-tauri/src/lib.rs` (`state.rs` + `commands/*`).

### Mantenimiento y CI
- Pipeline automático de CI en `.github/workflows/ci.yml` (Prettier, TypeScript/Vite, Vitest, `release:check`, `cargo fmt`, `cargo clippy -D warnings` y `cargo test` en macOS y Windows).
- Scripts `npm run format` y `npm run format:check` cubriendo el 100 % de `src/`.

## [1.0.0-beta.1] - 2026-11-10

Beta 1 de Windows x64 preparada para validación privada. No es una versión estable ni una entrega pública; la aceptación en otra máquina y la validación de macOS siguen pendientes. Consulta el [estado de la beta](docs/releases/1.0.0-beta.1.md).

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
- Creación de commits con detección de autor, validación de mensajes y opción de amend (modificar último commit) con respaldo automático del commit reemplazado.

#### Restauración y Deshacer (*Worktree Restore & Redo*)
- Diálogo modal accesible para restaurar archivos modificados del árbol de trabajo hacia el índice.
- Copia de seguridad atómica automática en .git/ravengit-restore/ antes de cada restauración.
- Acción de **Rehacer cambios** para recuperar el estado previo modificado desde el respaldo.
- Protección estricta contra obsolescencia (STALE_RESTORE): rechazo de confirmaciones si el archivo o repositorio cambió desde la última vista previa.

#### Rebase Interactivo
- Editor visual para secuencias de 1 a 50 commits lineales.
- Acciones soportadas: pick, reword (editar mensaje), squash (combinar con commit anterior), fixup (combinar descartando mensaje) y drop (descartar commit).
- Reordenamiento visual de commits en el plan interactivo.
- Generación de respaldo automático de la referencia de la rama antes de ejecutar reescrituras de historia.
- Detección de pausas por conflicto, con controles integrados para resolver y continuar o abortar limpiamente.

#### Conflictos y Operaciones Avanzadas
- Editor textual integrado de conflictos con acceso a tres versiones: Base, Local y Entrante.
- Guardado de resoluciones con respaldo automático antes de modificar el archivo en disco.
- Panel guiado de recuperación de operaciones interrumpidas para merge, rebase, cherry-pick y revert.
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
