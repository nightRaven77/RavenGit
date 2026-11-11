# RavenGit

[![Licencia](https://img.shields.io/badge/Licencia-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-dea584.svg)](https://www.rust-lang.org)
[![Plataformas](https://img.shields.io/badge/Plataformas-Windows%20%7C%20macOS-lightgrey.svg)](docs/releases/1.0.0-beta.1.md)

**RavenGit** es un cliente Git de escritorio gráfico, ligero y de arquitectura **local-first**, diseñado para ofrecer máxima velocidad, transparencia operativa y seguridad en cada operación con tus repositorios.

Construido sobre **Tauri 2**, **React 19** y un núcleo seguro en **Rust**, RavenGit combina una interfaz visual limpia y accesible con la solidez del motor Git de tu sistema.

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
- Acciones intuitivas: pick, eword, squash, ixup y drop.
- Reordenamiento de commits con arrastre o botones de subida/bajada.
- Copias de seguridad automáticas antes de iniciar reescrituras de historia.

### ⚡ Resolución Visual de Conflictos
- Editor textual integrado con acceso a las versiones **Base**, **Local** y **Entrante**.
- Respaldo automático antes de guardar resoluciones.
- Flujos guiados de recuperación y aborto seguro para merge, ebase, cherry-pick y evert.

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
- Operación 100% realizable mediante teclado (atajos estándar, foco visual continuo, navegación con Tab, Espacio, Enter y Escape).
- Diseño adaptable y probado en resoluciones compactas desde **900 × 640 píxeles**.
- Escala optimizada para gestionar cientos de archivos preparados sin congelar la interfaz.

---

## Requisitos del Sistema

- **Git:** Git 2.38 o superior instalado y accesible en la variable de entorno PATH.
- **Windows:** Windows 10 u 11 (x64) con el runtime de [Microsoft Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (generalmente preinstalado en el sistema).
- **macOS:** macOS 11.0 (Big Sur) o superior (Apple Silicon y compatibilidad Intel).

---

## Instalación y Desarrollo

### Prerrequisitos de compilación
- [Node.js](https://nodejs.org/) v20 o superior.
- [Rust](https://rustup.rs/) (herramienta cargo y cadena MSVC en Windows o Apple Clang en macOS).

### Clonar y ejecutar en desarrollo

`ash
# Clonar el repositorio
git clone git@github.com:nightRaven77/RavenGit.git
cd RavenGit

# Instalar dependencias de frontend
npm install

# Iniciar la aplicación en modo desarrollo
npm run tauri dev
`

### Ejecutar pruebas automatizadas

`ash
# Pruebas unitarias y de componentes (React/Vitest)
npm test

# Pruebas unitarias de Rust
cargo test --manifest-path src-tauri/Cargo.toml
`

### Compilación para producción

`ash
# Compilar frontend y binario nativo
npm run build
npm run tauri build
`

---

## Firma de Código y Entregas

RavenGit implementa políticas estrictas de verificación e integridad de binarios:
- En **Windows**, la integración de firma digital Authenticode se gestiona mediante [SignPath Foundation](docs/releases/SIGNPATH.md) para proyectos de código abierto.
- En **macOS**, los ejecutables se preparan para su distribución con firma y verificación de Gatekeeper.
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
