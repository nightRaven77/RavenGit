# Empaquetado por tag · preparación del 29/10/2026

Base `fccd587`, árbol limpio al iniciar. El usuario autorizó configurar empaquetado por tags de versión; no crear/subir tags ni publicar el proyecto.

Ambos workflows admiten push de tags beta y ejecución manual desde la rama predeterminada. Filtro amplio `v*-beta.*` seguido de comprobación estricta `vX.Y.Z-beta.N`, igualdad con versión coordinada npm/Cargo/Tauri, checkout del commit etiquetado e integración en la historia de la rama predeterminada. Checkout completo y grupos de concurrencia por ref. Eliminación de tag, push de rama y PR no activan el empaquetado automático.

Windows conserva activación explícita, repositorio público, environment y aprobación SignPath. Se documentó que sus reglas y las de origen deben admitir los tags revisados; no se cambió seguridad remota. No se añade un fallback sin firma.

## Comprobado localmente

- Ocho pruebas Node aprobadas: tag válido, versión distinta, formatos/sufijos, push de rama, manual permitido/rechazado, evento no permitido y contexto incompleto.
- YAML de ambos workflows parseado por Prettier y formato aprobado; versiones coordinadas y `git diff --check` aprobados.
- Lectura Git sobre el checkout actual: la guardia rechazó la entrega al no acreditar integración de HEAD en la historia remota local. No se hizo fetch ni se cambiaron referencias para forzar el resultado.

## Límites

No se creó ningún commit/tag, no hubo push y no se ejecutó GitHub Actions. Camino de tag real/annotated checkout completo, historial positivo remoto, permisos del environment, verificación de origen SignPath, compilación y paquetes por tag pendientes de primera ejecución. Los tests de nombres/eventos no certifican esos pasos. El proyecto sigue en GitLab hasta migración independiente autorizada.

[Uso y requisitos](../releases/TAGS_BETA.md) · [Sintaxis oficial de filtros GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore).
