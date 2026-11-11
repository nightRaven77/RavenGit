# Empaquetado automático por tag beta

Configurado el 29/10/2026 para GitHub Actions. No se ha creado/subido ningún tag ni ejecutado un workflow remoto durante esta preparación.

## Qué lo inicia

Subir un tag **`vX.Y.Z-beta.N`**, por ejemplo **`v1.0.0-beta.1`** para la versión actual. El tag debe estar en el mismo commit que el código revisado, con versiones npm/Cargo/Tauri/lockfiles coordinadas y título beta actualizado. El commit tiene que pertenecer a la historia de la rama predeterminada de GitHub.

Los workflows deben existir en el commit etiquetado. Subir sólo una rama no inicia los paquetes; crear un tag sólo en tu computadora tampoco. Los tags estables/RC/alpha no están habilitados en este alcance. No se retaggea una versión ya publicada: preparar la siguiente versión y un tag nuevo.

## Preparar una entrega

1. Terminar y revisar los cambios de la versión, incluidas notas en `docs/releases/<versión>.md`.
2. Integrar y subir ese commit a la rama predeterminada del futuro repositorio GitHub. La migración a GitHub sigue siendo una acción independiente.
3. Crear el tag de esa versión y publicarlo explícitamente en ese GitHub, desde RavenGit o Git. Comprobar antes el destino: **origin sigue apuntando a GitLab hasta que se autorice la migración**.
4. Revisar ambas ejecuciones en Actions. Descargar los paquetes en Artifacts. El empaquetado no crea un GitHub Release ni publica adjuntos en él.

No se proporcionan comandos de push contra un remoto supuesto: primero confirmar nombre y URL del remoto GitHub. Esta configuración no autoriza al agente a crear commits/tags o publicar el proyecto.

## Resultado por plataforma

- macOS: DMG Apple Silicon con `.app` ad hoc, sin notarización ni secretos Apple; SHA256 y manifiesto. Instalación y aceptación final en Mac pendientes.
- Windows: instalador y aplicación firmados sólo si `SIGNPATH_ENABLED=true`, el repositorio es público y están listos certificado, secretos, environment y reglas de origen. Cada solicitud requiere aprobación humana en SignPath. Sin configuración, ese job se omite; no genera como sustituto un paquete sin firma.
- Opción manual conservada: Run workflow desde la rama predeterminada. La misma comprobación de historial se aplica.

La verificación exige checkout completo (`fetch-depth: 0`), formato estricto, versión exacta y tag apuntando al HEAD construido. Las ejecuciones de tags distintos usan grupos separados para no desplazar otras entregas pendientes. No se ejecutan al borrar tags ni al abrir PR.

## Verificación local de la preparación

`node --test scripts/check-release-ref.test.mjs`: ocho pruebas aprobadas para formato/versión/evento/rama permitidos y rechazados. YAML/formato, versiones y `git diff --check` comprobados. No prueba un push real, políticas de GitHub/SignPath, ancestro de un tag remoto ni una compilación nativa. La primera ejecución real permanece pendiente.

[macOS](MACOS_BETA.md) · [SignPath/Windows](SIGNPATH.md).
