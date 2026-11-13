# RavenGit

[![Versión](https://img.shields.io/badge/Versión-1.0.5-blue.svg)](CHANGELOG.md)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-dea584.svg)](https://www.rust-lang.org)
[![Plataformas](https://img.shields.io/badge/Plataformas-Windows%20x64%20%7C%20macOS-blueviolet.svg)](#requisitos-del-sistema)

**RavenGit** es un cliente Git de escritorio moderno, visual y de arquitectura **local-first**, diseñado para inspeccionar el historial, resolver conflictos y gestionar repositorios con total seguridad, rapidez y privacidad.

Construido sobre **Tauri 2**, **React 19** y un núcleo seguro en **Rust**, RavenGit opera directamente sobre el Git nativo del sistema sin intermediarios ni telemetría.

---

## Características Principales

### 🌳 Historial Visual y Grafo DAG
- **Grafo interactivo paginado:** renderizado eficiente para explorar bifurcaciones, fusiones y commits sin degradar el rendimiento.
- **Filtros dinámicos:** visualización por rama local, remota o referencia `HEAD`.
- **Navegación ágil por teclado:** desplazamiento fluido entre commits padres e hijos con indicadores de foco continuo.
- **Búsqueda instantánea:** filtrado en memoria por mensaje, autor o hash.

### 📝 Panel de Cambios y Preparación Granular
- **Comparador visual de diferencias:** visualización en modo **Unificado** o **Dividido (Side-by-side)**.
- **Staging selectivo y múltiple:** prepara archivos enteros, bloques de código específicos (*hunk staging*) o selecciona múltiples archivos para transacciones atómicas de índice.
- **Protección contra bloqueos:** detección y gestión segura de archivos `index.lock` con explicaciones claras.
- **Commits y Modificaciones:** creación de commits con detección de autor y soporte para `amend` con respaldo automático.

### 🛡️ Restauración Atómica y Respaldo Automático
- **Restauración con vista previa:** revierte modificaciones del árbol de trabajo al estado del índice con previsualización de diferencias.
- **Respaldo automático (.git/ravengit-restore/):** cada archivo restaurado genera una copia de seguridad inmediata.
- **Acción "Rehacer cambios":** recupera en cualquier momento el estado modificado previo desde el respaldo.
- **Protección anti-obsolescencia (STALE_RESTORE):** bloqueo estricto si el archivo en disco sufrió cambios externos desde la última inspección.

### 🔀 Rebase Interactivo Visual
- Editor visual para secuencias lineales de 1 a 50 commits.
- Acciones estándar: `pick`, `reword`, `squash`, `fixup` y `drop`.
- Reordenamiento visual mediante arrastre o botones de subida/bajada.
- Respaldos automáticos de la rama antes de iniciar reescrituras de historia.

### ⚡ Resolución Visual de Conflictos
- Editor textual integrado con acceso simultáneo a versiones **Base**, **Local** y **Entrante**.
- Respaldo de seguridad antes de escribir las resoluciones en disco.
- Panel guiado para operaciones interrumpidas: `merge`, `rebase`, `cherry-pick` y `revert`, con controles seguros de **Continuar** y **Abortar**.

### 📦 Stash, Ramas y Etiquetas
- **Stash completo:** almacenamiento de cambios preservando capas de preparación y archivos sin seguimiento (*untracked*).
- **Gestión de ramas:** creación, cambio de contexto (*checkout*) y renombrado con comprobación previa de colisiones.
- **Etiquetas (Tags):** creación de etiquetas locales y publicación selectiva individual hacia remotos autorizados.

### 🔒 Seguridad, Privacidad y Confianza Local-First
- **100% Offline-first:** ninguna operación local requiere conexión a internet; cero recolección de datos o telemetría.
- **Puerta de confianza por ruta:** confirmación explícita del usuario requerida antes de abrir o manipular rutas no autorizadas.
- **Serialización de escrituras:** exclusión mutua en Rust para impedir ejecuciones destructivas concurrentes sobre el repositorio.
- **Autenticación delegada:** soporte para remotos HTTPS y SSH integrándose con el agente OpenSSH y los administradores de credenciales del sistema operativo.

---

## Requisitos del Sistema

- **Git:** Git 2.38 o superior instalado y accesible en la variable de entorno `PATH`.
- **Windows:** Windows 10 u 11 (x64) con el runtime de [Microsoft Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (incluido por defecto en Windows 10/11).
- **macOS:** macOS 12 (Monterey) o superior; compatible con Apple Silicon (arm64) e Intel (x86_64).

---

## Instalación y Desarrollo

### Prerrequisitos de compilación
- [Node.js](https://nodejs.org/) v20 o v24.
- [Rust](https://rustup.rs/) (versión 1.80+ con cadena MSVC en Windows o Apple Clang en macOS).

### Clonar y ejecutar en desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/nightRaven77/RavenGit.git
cd RavenGit

# Instalar dependencias de frontend
npm install

# Iniciar la aplicación en modo desarrollo (Hot Reload)
npm run tauri dev
```

### Pruebas automatizadas

```bash
# Pruebas unitarias de frontend (React/Vitest)
npm test

# Pruebas unitarias de Rust
cargo test --manifest-path src-tauri/Cargo.toml

# Verificación de consistencia de versión y entregas
npm run release:check
```

### Compilación para producción

```bash
# Compilación completa del instalador y binarios
npm run build
npm run tauri build
```

### Gestión de versiones

El repositorio incluye un script automatizado para sincronizar versiones en todos los manifiestos (`package.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json` y notas de entrega):

```bash
npm run version:bump patch   # Incrementa parche (ej. 1.0.3 -> 1.0.4)
npm run version:bump minor   # Incrementa menor (ej. 1.0.3 -> 1.1.0)
npm run version:bump major   # Incrementa mayor (ej. 1.0.3 -> 2.0.0)
npm run version:bump 1.0.4   # Versión específica
```

---

## Integración Continua y Firma de Código

RavenGit cuenta con flujos automatizados de CI/CD mediante **GitHub Actions**:
- **Windows (x64):** compilación, validación de iconos, empaquetado NSIS y firma Authenticode automatizada vía la API de [SignPath](docs/releases/SIGNPATH.md).
- **macOS:** compilación y empaquetado en imagen DMG.
- Cada entrega genera manifiestos de integridad y sumas de verificación SHA-256 publicados en los artefactos de la release.

---

## Hoja de Ruta y Contribución

- Conoce nuestras próximas metas en el [Roadmap del proyecto](ROADMAP.md).
- Revisa el historial de cambios en el [Changelog](CHANGELOG.md).
- Para colaborar, reportar fallos o proponer mejoras, consulta la guía de [Contribución](CONTRIBUTING.md).

---

## Licencia

Este proyecto está licenciado bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

Las dependencias de terceros y componentes de plataforma conservan sus respectivas licencias de código abierto, inventariadas en [docs/legal/INVENTARIO_DEPENDENCIAS.md](docs/legal/INVENTARIO_DEPENDENCIAS.md).
