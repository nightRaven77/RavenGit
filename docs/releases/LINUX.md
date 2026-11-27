# Preparación y empaquetado de RavenGit en Linux

Este documento describe los requisitos del sistema y el empaquetado oficial de **RavenGit** para distribuciones **Linux x64** en formatos **`.deb`** y **`.AppImage`**.

---

## Requisitos en tiempo de ejecución

- **Git CLI:** Git **2.38 o superior** accesible en `PATH`.
- **WebKitGTK 4.1:** requerido por Tauri v2 (`libwebkit2gtk-4.1-0` en Debian/Ubuntu).
- **AppImage:** requiere `libfuse2` en distribuciones recientes (ej. Ubuntu 22.04/24.04) o ejecutar con `--appimage-extract-and-run`.
- **Explorador y navegador externo:** usa `xdg-open` estándar del escritorio Linux.

> **Nota sobre Wayland / NVIDIA:** si en alguna configuración de escritorio Wayland + GPU NVIDIA WebKitGTK presenta pantalla en blanco o parpadeos DMA-BUF, ejecuta con `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

---

## Dependencias de compilación (Debian / Ubuntu 22.04+)

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  pkg-config \
  file
```

Además de **Node.js 20/24** y **Rust 1.80+**.

---

## Validación y empaquetado local

```bash
# Validar configuración multiplataforma (también ejecutable desde macOS o Windows)
npm run release:check:linux

# Compilar paquetes .deb y .AppImage (solo en Linux)
npm run release:build:linux
```

El script `scripts/build-linux.mjs` compila con `--ci -- --locked`, copia el `.deb`, el `.AppImage` y `LICENSE` a `state/linux.local/<versión>/<timestamp>/`, y genera `MANIFEST.json` y `SHA256SUMS.txt`.

---

## Integración continua y publicación

- **CI continuo (`.github/workflows/ci.yml`):** verifica formato, pruebas y compilación Rust en `ubuntu-22.04`.
- **Release Linux (`.github/workflows/linux-release.yml`):** empaqueta `.deb`, `.AppImage` y `SHA256SUMS-linux.txt` al crear un tag `v*` o mediante `workflow_dispatch`.
- **Alcance pendiente:** el formato **Flatpak** y la validación interactiva en escritorios limpios (Wayland/X11) permanecen como metas independientes del [Roadmap](../../ROADMAP.md).
