# Conflictos D.2a–c · validación macOS

23 de octubre de 2026 · código `4305dd1cc950895e190f161be7c92efa98ba7ac3`, versión de desarrollo 0.4.2. Revisión de los avances `d04d479..4305dd1`: consulta Base/Local/Entrante, guardado textual con respaldo y preparación revisada de una ruta. No corresponde a una publicación nueva.

## Automatización ejecutada

- Editor/visor: **12 pruebas UI focalizadas**; suite completa **225/225 en 24 archivos**, con IPC simulado.
- Filtro Rust `conflict`: **25/25**, incluyendo consulta/guardado/preparación, casos Unix y regresiones de recuperación existentes. No son 25 casos nuevos.
- Suite Rust completa: **171/171**, doctests sin casos; Clippy all-targets con `-D warnings`, Rustfmt y Prettier aprobados. TypeScript/Vite y bundles debug ARM64 aprobados.
- Las cifras corresponden a macOS en este punto de código; no se suman con Windows ni registros anteriores. No se modificó lógica de producción para ejecutar estas comprobaciones.

## Aislamiento del recorrido nativo

Se generaron dos aplicaciones mediante superposición de configuración de Tauri por CLI, sin editar `tauri.conf.json`:

| Aplicación de prueba | Identificador | Ventana inicial |
| --- | --- | --- |
| RavenGit Validation | `dev.ravengit.validation` | 1440 × 920 |
| RavenGit Validation Narrow | `dev.ravengit.validation.narrow` | 900 × 640 |

Cada una tiene su propia configuración/biblioteca/confianza. No se cerró RavenGit normal ni se utilizaron sus repositorios. Se inspeccionó el render amplio y se confirmó la ventana estrecha real de 900 × 640; no se deduce su aceptación únicamente de la configuración.

Fixture temporal con merge real y tres etapas de texto: `file.txt` con Base, Local y Entrante; `other.txt` ya preparado con contenido distinto de HEAD. La instancia estrecha utiliza una copia independiente de la fixture original. No se ejecuta commit, continuación ni aborto del merge durante la validación.

## Comprobaciones de Git

1. Consultar las tres etapas y editar un resultado explícito sin marcadores.
2. Después de guardar: comprobar bytes del resultado, respaldo `original` y hashes de `metadata.json`; las etapas en conflicto, el otro preparado, HEAD y MERGE_HEAD deben conservarse.
3. Revisar preparación y confirmar por separado: sólo `file.txt` debe pasar a etapa 0 con el blob revisado; conservar el otro preparado, archivo de trabajo, HEAD, MERGE_HEAD y respaldo.
4. Reabrir la instancia de prueba y comprobar que continúan presentes el estado del merge y el respaldo. La revisión de preparación de sesión no se considera persistente.

Ventana amplia: consulta de las tres versiones, guardado, revisión del blob/modo, preparación y cierre/reapertura completados en la aplicación nativa. Se verificaron ocho condiciones tras guardar y diez tras preparar, sin escribir sobre el repositorio durante esas consultas.

- Resultado de trabajo: `Resolución validada en macOS` con salto final LF.
- Blob revisado e instalado: `669a49ccd903f91436f860d9647e690e459a5f0f`, modo `100644`.
- Después de guardar, las tres etapas del conflicto continuaron iguales. Después de preparar, sólo esa ruta pasó a etapa 0.
- La entrada y contenido de trabajo de `other.txt`, preparados antes del conflicto, se conservaron; HEAD y MERGE_HEAD no cambiaron.
- Se verificaron los hashes de original/resultado de `metadata.json`. El original respaldado conservó todos los marcadores anteriores.
- Se recuperaron sus bytes a un archivo nuevo fuera del repositorio y se compararon con el original conocido. Esto demuestra recuperación del contenido, no una restauración del índice, aborto de merge o interfaz de recuperación.
- Tras reabrir la instancia amplia, Cambios mostró dos archivos preparados, ninguno sin preparar y MERGE_HEAD pendiente; commit/amend ordinarios permanecieron bloqueados.

En la instancia estrecha también se completaron consulta, edición, guardado, revisión y preparación, con el mismo hash/modo y resultado. Las tres versiones se distribuyeron en dos columnas más una sección inferior; editor y confirmaciones requirieron scroll normal del diálogo, sin controles inaccesibles ni recorte horizontal. Doce condiciones finales de Git aprobaron, incluida recuperación del original a otro archivo nuevo fuera del repositorio. No se repitió la reapertura en la instancia estrecha.

Las comprobaciones de Git se realizaron con locks opcionales desactivados para no refrescar el índice mientras se verificaba la separación entre pasos. [Resultados estructurados, fixture y hashes de los bundles](Conflictos_macOS_2026-10-23_resultados.json): ocho comprobaciones tras guardar en amplia, diez tras preparar en amplia y doce tras preparar en estrecha; todas verdaderas.

## Revisión independiente de UX

El juez no construyó los incrementos y recorrió las dos aplicaciones nativas, capturando el estado inicial y las transiciones. No encontró bloqueantes ni problemas mayores en estas tareas.

| Heurística | Evidencia / hallazgo localizado | Estado y acción |
| --- | --- | --- |
| Estado visible | Guardado conserva el aviso de índice en conflicto; preparación confirma que no creó commit ni continuó | Comprobado en el recorrido |
| Correspondencia | Base/Local/Entrante y resultado editado identificados | Comprobado |
| Control y libertad | Cierre disponible; confirmaciones separadas antes de guardar y preparar | Menor: Cerrar deja de verse al hacer scroll; proponer cabecera fija |
| Consistencia | Mismos controles y revisión en ambas ventanas | Comprobado |
| Prevención | Casilla de reemplazo y casilla de preparación independientes | Comprobado en el caso de éxito; errores nativos pendientes |
| Reconocimiento | Texto/hash/modo del blob y ubicación del respaldo visibles | Comprobado |
| Eficiencia | Guardar y preparar desde el mismo diálogo, sin continuación implícita | Comprobado |
| Minimalismo | Versiones se redistribuyen; confirmaciones accesibles con scroll | Comprobado en esta fixture breve; textos extensos pendientes |
| Recuperación | Respaldo persistente, comprobado y recuperado a archivo nuevo externamente | Sin recuperación guiada ni interrupción real durante escritura |
| Ayuda | Mensajes distinguen guardar, preparar y continuar | Comprobado; no sustituye evaluación con lector de pantalla |

La cabecera fija se registra como mejora pendiente, sin afirmar que se haya corregido. La aceptación de ventana mínima corresponde a este recorrido, no a todas las pantallas de RavenGit ni a toda la accesibilidad.

## Cierre de la validación

Se quitaron únicamente las entradas de las dos bibliotecas de prueba, con Papelera desmarcada; ambas quedaron con cero entradas. Fixtures, respaldos y copias recuperadas permanecen en el directorio temporal. RavenGit normal, su biblioteca y los repositorios del usuario no se utilizaron para estas operaciones. No se hizo commit en el repositorio de desarrollo.

## Límites

Este recorrido se centra en merge de texto regular. No certifica conflictos de rebase/replay/Stash, binarios, enlaces, etapas ausentes, filtros reales de otros equipos, lectores de pantalla, pérdida de energía ni cierres forzados durante una escritura. La restauración automática del respaldo y el rebase interactivo siguen pendientes. RG-06 y D permanecen parciales.
