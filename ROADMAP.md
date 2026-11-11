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
  - Empaquetado oficial en formatos **AppImage**, **Flatpak** y paquetes .deb.
  - Integración con llaveros de contraseñas de escritorio (*Secret Service API*).
- [ ] **Git LFS (Large File Storage):**
  - Detección automática de punteros LFS en el árbol de trabajo.
  - Visualización del estado de descarga y bloqueo de archivos grandes.
- [ ] **Mejoras en Visualización de Diferencias:**
  - Comparador visual lado a lado para imágenes (modo cortina y diferencias por capas).
  - Marcado de diferencias a nivel de palabra/carácter en cambios de una sola línea.
- [ ] **Personalización de Temas:**
  - Modo de alto contraste estricto para usuarios con necesidades visuales específicas.
  - Soporte para tema claro (*light mode*).

---

## 🔮 v1.2.0 — Flujos de Equipo y Extensiones

- [ ] **Soporte para Submódulos Git:**
  - Visualización del estado de submódulos en el panel de cambios y grafo.
  - Actualización atómica de referencias de submódulos.
- [ ] **Flujos de Trabajo Remotos:**
  - Detección de Pull Requests / Merge Requests asociados a ramas remotas en GitHub y GitLab.
  - Accesos directos para creación de ramas basadas en incidencias.
- [ ] **Filtros Avanzados en el Historial:**
  - Búsqueda por rango de fechas, rutas de archivos específicas (*file history*) y sintaxis de búsqueda regular.

---

## Contribuciones y Sugerencias

¿Tienes alguna idea o necesidad para el roadmap?
Cuando se anuncie el canal público del proyecto, comparte la propuesta allí y sigue las pautas de [CONTRIBUTING.md](CONTRIBUTING.md). La migración y publicación del repositorio siguen pendientes.
