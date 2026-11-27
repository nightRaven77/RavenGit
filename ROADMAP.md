# Hoja de Ruta (Roadmap)

Este documento describe la visión a corto y mediano plazo para el desarrollo y evolución de **RavenGit**.

Las prioridades reflejan nuestro compromiso con la arquitectura **local-first**, la seguridad estricta en las operaciones con Git y una experiencia de usuario accesible y rápida.

---

## 🎯 v1.0.0 — Lanzamiento Estable Oficial

El objetivo principal de esta fase es culminar los procesos de distribución segura y validación externa sobre la base funcional completada en la versión Beta 1.

- [ ] **Firma digital Windows:** Integración con [SignPath Foundation](docs/releases/SIGNPATH.md) para firma digital de instaladores y ejecutables bajo la política de proyectos Open Source.
- [ ] **Notarización macOS:** Automatización de la firma con Apple Developer ID y proceso de *stapling* en los flujos de GitHub Actions.
- [ ] **Publicación de Releases oficiales:** Empaquetado automatizado de instaladores NSIS para Windows y archivos .dmg para macOS en cada versión etiquetada (v1.0.0).
- [ ] **Validación en máquinas limpias:** Verificación final de instalación desatendida y convivencia con SmartScreen y Gatekeeper en sistemas operativos limpios.

---

## 🚀 v1.1.0 — Ampliación de Plataformas y Rendimiento

Mejoras orientadas a extender la disponibilidad de RavenGit y optimizar flujos de trabajo con repositorios complejos.

- [ ] **Soporte para Linux:**
  - [x] Empaquetado oficial en formatos **AppImage** y paquetes **.deb** con pipeline CI en `ubuntu-22.04` (`npm run release:build:linux`).
  - [ ] Empaquetado **Flatpak** y validación interactiva en escritorios Linux limpios.
  - Integración con llaveros de contraseñas de escritorio (*Secret Service API* / `git-credential-libsecret`).
- [x] **Git LFS (Large File Storage):**
  - Detección automática de punteros LFS en el árbol de trabajo.
  - Visualización del estado de descarga y bloqueo de archivos grandes.
- [x] **Mejoras en Visualización de Diferencias:**
  - Comparador visual lado a lado para imágenes (modo cortina, lado a lado y superposición).
  - Marcado de diferencias a nivel de palabra/carácter en cambios de una sola línea, resaltado de sintaxis y staging por línea.
- [x] **Personalización de Temas:**
  - Modo de alto contraste estricto para usuarios con necesidades visuales específicas.
  - Soporte para tema claro (*Arctic Light*), paletas del grafo y estilos Tributary/Compacto.

---

## 🔮 v1.2.0 — Flujos de Equipo y Extensiones

- [x] **Soporte para Submódulos Git:**
  - Visualización del estado de submódulos en el panel integrado.
  - Inicialización y actualización atómica de referencias de submódulos.
- [ ] **Flujos de Trabajo Remotos (opt-in):**
  - [x] Detección explícita bajo demanda de Pull Requests / Merge Requests asociados a ramas remotas en GitHub y GitLab.
  - [ ] Accesos directos para creación de ramas basadas en incidencias.
- [x] **Filtros Avanzados en el Historial:**
  - Búsqueda profunda por rango de fechas, rutas de archivos, búsqueda en código (`-S` / `-G`), historial `--follow`, *Git Blame* y expresiones regulares.
- [x] **Modo Simple (interfaz guiada):**
  - Alternador en un clic para reducir densidad visual y priorizar flujos cotidianos.

---

## 🧭 Próximas mejoras (post-2.0.0)

- [ ] **Sincronización opcional de etiquetas (tags) en Fetch:**
  - Opción explícita en Fetch / Remotos (o acción dedicada en Etiquetas) para descargar tags remotos sin cambiar el comportamiento seguro por defecto (`--no-tags`).
  - Garantizar que nunca sobrescriba etiquetas locales existentes ni realice `--prune-tags` implícito.

---

## Contribuciones y Sugerencias

¿Tienes alguna idea o necesidad para el roadmap?
Cuando se anuncie el canal público del proyecto, comparte la propuesta allí y sigue las pautas de [CONTRIBUTING.md](CONTRIBUTING.md). La migración y publicación del repositorio siguen pendientes.
