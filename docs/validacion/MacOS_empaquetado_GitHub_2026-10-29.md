# Preparación de empaquetado macOS en GitHub · 29/10/2026

Base `10ddcbb`, con todos los cambios locales anteriores conservados. El usuario pidió automatizar el empaquetado Apple Silicon en GitHub Actions, sin membresía Apple. No se ha publicado código, modificado origin ni ejecutado un workflow remoto.

Preparado `.github/workflows/macos-beta.yml`: ejecución manual desde la rama predeterminada, runner macOS arm64, Node 24, Rust 1.99.1, dependencias fijadas por lockfile, comprobación de configuración y pruebas UI antes de compilar. Reutiliza el script local para `.app`/DMG ad hoc y sus verificaciones. Entrega DMG, licencia, guía, hash y manifiesto como artefacto de 30 días; no publica releases/tags ni requiere secretos Apple. La imagen conserva la estructura de la `.app`.

Comprobaciones locales: YAML parseado/formateado por Prettier, coherencia de versiones y configuración macOS aprobadas; `git diff --check` aprobado. Se revisaron las entradas de checkout/setup-node/upload-artifact y la etiqueta arm64 `macos-15` contra documentación oficial. No se generó un paquete ni se ejecutaron las pruebas UI/Rust de este workflow en Windows.

Pendientes: subir los cambios a GitHub mediante autorización independiente, primera ejecución real, resultados UI/compilación/firma/integridad en el runner y descarga/instalación/arranque/aceptación en la Mac del usuario. El workflow no ejecuta regresión Rust completa. Ninguna comprobación estática equivale a aceptación nativa o notarización.

[Guía de ejecución y descarga](../releases/MACOS_BETA.md) · [Runners de GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Actualización del 30/10: la [compilación local de Beta 1 en macOS](Beta_1_macOS_2026-10-30.md) aprobó `.app`, firma ad hoc y DMG. Luego se montó la DMG en sólo lectura, se copió la `.app` a `/private/tmp` y se abrió; Stash guardar/restaurar pasó desde UI en fixture desechable. Instalación en Aplicaciones, recorrido amplio y primera ejecución de Actions siguen pendientes.
