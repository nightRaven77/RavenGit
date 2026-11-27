# Documentación de RavenGit

Este directorio reúne documentación de usuario, producto, arquitectura, distribución y licencias. Los documentos de producto describen tanto decisiones vigentes como propuestas y registros históricos; consulta el estado indicado en cada documento antes de tomar una propuesta como función disponible.

## Manual de uso

- [Manual de uso de RavenGit](manual/README.md): índice general y guía de primeros pasos en 5 minutos.
- [Interfaz, grafo Tributary y navegación](manual/interfaz-y-grafo.md): pestañas, estilos *Tributary* y *Compacto*, filtros, 7 temas, 5 paletas y Paleta de comandos.
- [Cambios locales, diffs y commits](manual/cambios-y-commits.md): staging granular, diff dividido y visual de imágenes, commits, `amend` y `stash`.
- [Ramas, rebase interactivo, conflictos y etiquetas](manual/ramas-y-conflictos.md): gestión de ramas, rebase visual, editor de conflictos a 3 vías y etiquetas.
- [Sincronización, remotos y PRs / MRs opt-in](manual/sincronizacion-y-forjas.md): `Fetch`, `Pull`, `Push`, credenciales y consulta bajo demanda con `gh` / `glab`.
- [Seguridad 2.0 y herramientas avanzadas](manual/herramientas-y-seguridad.md): snapshots, `Undo / Redo`, búsqueda profunda, `--follow`, Blame, comparación de rango, worktrees y LFS/Submódulos.
- [Atajos de teclado, entorno y soporte](manual/atajos-y-soporte.md): referencia de los 18 atajos (`?`), verificador de entorno y solución de problemas.

## Producto

- [Visión y requisitos](producto/01_Vision_y_requisitos.md): alcance, criterios de aceptación y decisiones pendientes.
- [Análisis de arquitectura](producto/02_Analisis_de_arquitectura.md): arquitectura y fundamento técnico.
- [Especificación de UX](producto/03_Especificacion_UX.md): flujos y criterios de interfaz.
- [Rediseño de interfaz](producto/04_Rediseno_interfaz.md): dirección y simplificación visual.
- [Historial visual](producto/05_Historial_visual.md): grafo, navegación y filtros.
- [Espacio local](producto/06_Espacio_local.md): biblioteca, colecciones y preferencias locales.
- [Identidad visual](producto/07_Identidad_visual.md): icono e identidad de RavenGit.
- [Plan maestro de mejoras](producto/08_Plan_maestro_de_mejoras.md): hoja de ruta técnica en cinco fases aprobada para la evolución del producto.

## Entregas y publicación

- [Notas de RavenGit 2.0.0](releases/2.0.0.md): novedades de 2.0.0, actualización desde `1.0.x` y distribución.
- [Notas de RavenGit 1.0.0-beta.1](releases/1.0.0-beta.1.md): alcance y límites conocidos de la beta.
- [Plan de beta](releases/PLAN_BETA_1.md) y [matriz de Windows](releases/MATRIZ_BETA_1_WINDOWS.md): preparación y aceptación pendiente.
- [Empaquetado por tag](releases/TAGS_BETA.md): condiciones de los workflows de entrega.
- [Preparación de macOS](releases/MACOS_BETA.md): compilación y límites de distribución.
- [Preparación de Linux](releases/LINUX.md): empaquetado `.deb` y `.AppImage` en `ubuntu-22.04`.
- [Preparación de SignPath](releases/SIGNPATH.md), [política de firma](releases/CODE_SIGNING_POLICY.md) y [lista para apertura pública](releases/OPEN_SOURCE_CHECKLIST.md).
- [Inventario de licencias](legal/INVENTARIO_DEPENDENCIAS.md): dependencias y obligaciones por revisar.

## Documentos relacionados

El [README principal](../README.md) explica el proyecto y cómo ejecutarlo. El [changelog](../CHANGELOG.md) registra cambios por versión, el [roadmap](../ROADMAP.md) resume prioridades y [CONTRIBUTING](../CONTRIBUTING.md) describe cómo colaborar.

Algunos documentos históricos mencionan registros de validación que no están incluidos en este checkout. Esas referencias se identifican en el propio texto; no implican que las pruebas estén aprobadas o disponibles aquí.
