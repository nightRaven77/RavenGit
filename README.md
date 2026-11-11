# RavenGit

[![Licencia](https://img.shields.io/badge/Licencia-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-dea584.svg)](https://www.rust-lang.org)
[![Plataforma en validación](https://img.shields.io/badge/Plataforma-Windows%20x64%20beta-lightgrey.svg)](docs/releases/1.0.0-beta.1.md)

**RavenGit** es un cliente Git de escritorio de arquitectura **local-first**, construido para explorar el historial y trabajar con repositorios desde una interfaz gráfica.

Está construido con **Tauri 2**, **React 19** y **Rust**, y utiliza Git instalado en el sistema para operar sobre los repositorios.

> **Estado:** `1.0.0-beta.1` es un candidato de Windows x64 para validación privada. La aceptación en una máquina limpia y la matriz funcional instalada siguen pendientes. La preparación para macOS no equivale a una versión validada o distribuida. Consulta las [notas de la beta](docs/releases/1.0.0-beta.1.md).

---

## Características Principales

### 🌳 Historial Visual y Grafo DAG
- Grafo interactivo paginado para explorar el historial de commits, bifurcaciones y uniones de ramas.
- Filtros por rama local, remota o referencia HEAD.
- Navegación ágil por teclado entre commits padres e hijos.
- Búsqueda local instantánea por mensaje, autor o hash.

### 📝 Panel de Cambios y Preparación Granular
- Visualización de diferencias en modo **Unificado** o **Dividido (Side-by-side)**.
- Preparación selectiva (*staging*): prepara archivos completos, bloques específicos (*hunks*) o utiliza la **preparación múltiple** con casillas de selección para transacciones atómicas de índice.
- Detección de bloqueos de Git (index.lock) con mensajes claros y seguros.

### 🛡️ Restauración Atómica y Deshacer con Respaldo
- **Restaurar archivo:** revierte modificaciones del árbol de trabajo al estado del índice con previsualización de diferencias.
- **Respaldo automático:** cada restauración guarda una copia segura en .git/ravengit-restore/.
- **Rehacer cambios:** recupera en cualquier momento el estado previo desde el respaldo.
- **Protección anti-obsolescencia:** detección estricta de modificaciones externas concurrentes (STALE_RESTORE) para impedir sobreescrituras accidentales.

### 🔀 Rebase Interactivo Visual
- Editor visual para secuencias de 1 a 50 commits lineales.
- Acciones intuitivas: pick, reword, squash, fixup y drop.
- Reordenamiento de commits con arrastre o botones de subida/bajada.
- Copias de seguridad automáticas antes de iniciar reescrituras de historia.

### ⚡ Resolución Visual de Conflictos
- Editor textual integrado con acceso a las versiones **Base**, **Local** y **Entrante**.
- Respaldo automático antes de guardar resoluciones.
- Flujos guiados de recuperación y aborto para merge, rebase, cherry-pick y revert.

### 📦 Stash, Ramas y Etiquetas
- **Stash avanzado:** almacena y recupera cambios preservando capas de preparación y archivos sin seguimiento.
- **Gestión de ramas:** creación, cambio de contexto y renombrado con comprobación de colisiones.
- **Etiquetas (Tags):** creación de tags ligeros locales y publicación selectiva hacia remotos autorizados.

### 🔒 Seguridad, Privacidad y Confianza
- **100% Offline-first:** ninguna operación local requiere conexión a internet ni envía telemetría.
- **Confianza por ruta:** autorización explícita requerida antes de realizar operaciones de lectura o escritura en un nuevo directorio.
- **Serialización de escrituras:** operaciones de modificación protegidas por cerrojos internos y planes de un solo uso.
- **Autenticación delegada:** soporte para remotos HTTPS y SSH integrándose con el agente OpenSSH y los asistentes de credenciales del sistema.

### ♿ Accesibilidad y Rendimiento
- Navegación por teclado con foco visible y controles habituales; la aceptación completa de accesibilidad sigue pendiente.
- Interfaz con tamaño mínimo de ventana de **900 × 640 píxeles**; la validación integral de escalado sigue pendiente.
- Escala optimizada para gestionar cientos de archivos preparados sin congelar la interfaz.

---

## Requisitos del Sistema

- **Git:** Git 2.38 o superior instalado y accesible en la variable de entorno PATH.
- **Windows:** Windows 10 u 11 (x64) con el runtime de [Microsoft Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (generalmente preinstalado en el sistema).
- **macOS:** la compilación está preparada para Apple Silicon; instalación, compatibilidad y distribución aún requieren validación. Consulta [Preparación de macOS](docs/releases/MACOS_BETA.md).

---

## Instalación y Desarrollo

### Prerrequisitos de compilación
- [Node.js](https://nodejs.org/) v20 o superior.
- [Rust](https://rustup.rs/) (herramienta cargo y cadena MSVC en Windows o Apple Clang en macOS).

### Clonar y ejecutar en desarrollo

```bash
# Clonar el repositorio
git clone URL_DEL_REPOSITORIO RavenGit
cd RavenGit

# Instalar dependencias de frontend
npm install

# Iniciar la aplicación en modo desarrollo
npm run tauri dev
```

### Ejecutar pruebas automatizadas

```bash
# Pruebas unitarias y de componentes (React/Vitest)
npm test

# Pruebas unitarias de Rust
cargo test --manifest-path src-tauri/Cargo.toml
```

### Compilación para producción

```bash
# Compilar frontend y binario nativo
npm run build
npm run tauri build
```

---

## Firma de Código y Entregas

RavenGit implementa políticas estrictas de verificación e integridad de binarios:
- En **Windows**, la firma Authenticode está preparada para solicitarse mediante [SignPath Foundation](docs/releases/SIGNPATH.md); el proyecto remoto y la firma siguen pendientes.
- En **macOS**, hay una guía de compilación para Apple Silicon; la firma de distribución y la verificación de Gatekeeper siguen pendientes.
- Consulta las notas de versión y candidatas en [docs/releases/](docs/releases/1.0.0-beta.1.md).

---

## Hoja de Ruta y Contribución

- Conoce nuestras próximas metas en el [Roadmap del proyecto](ROADMAP.md).
- Revisa el historial de cambios en el [Changelog](CHANGELOG.md).
- Para colaborar, reportar fallos o proponer mejoras, consulta la guía de [Contribución](CONTRIBUTING.md).

---

## Licencia

Este proyecto está licenciado bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

Las dependencias de terceros y componentes de plataforma conservan sus respectivas licencias de código abierto, inventariadas en [docs/legal/INVENTARIO_DEPENDENCIAS.md](docs/legal/INVENTARIO_DEPENDENCIAS.md).
