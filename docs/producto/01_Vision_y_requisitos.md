# RavenGit · Visión y requisitos de producto

**Estado:** especificación objetivo con seguimiento de implementación · **Versión documental:** 0.3 · **Actualizado:** 21 de octubre de 2026
**Producto:** RavenGit · **Identidad:** Obsidian / Azure / carmesí

Esta documentación conserva el alcance objetivo y las decisiones de producto. El [estado y roadmap](../../ROADMAP.md), con corte sobre el código `20c1856`, separa lo implementado de la aceptación pendiente; el [índice de validaciones](../validacion/README.md) enlaza la evidencia. «Confirmado» significa solicitado por el usuario; «propuesto» conserva una propuesta; «pendiente» es una decisión o comprobación abierta. La especificación no acredita por sí sola implementación, rendimiento ni validación con usuarios.


## 1. Visión y contexto
RavenGit será un cliente Git de escritorio local-first, visual y multiproveedor. Su valor principal será comprender el historial y ejecutar operaciones avanzadas con contexto y recuperación explícita. Nace para uso personal y debe poder evolucionar a open source sin depender de un servicio propio.

El flujo actual combina GitHub Desktop para Gitea autohospedado y repositorios privados, y GitKraken para repositorios públicos en GitHub y GitLab. Bitbucket amplía el escenario. RavenGit aspira a reducir esa fragmentación; no se promete paridad completa con otro producto.

Confirmado: Windows y macOS primero, Linux después; prioridad en grafo y Git avanzado; GitHub, GitLab, Gitea autohospedado, Bitbucket y remotos genéricos. Aprobado por el usuario: Tauri/React/Rust y experiencia visual tipo GitKraken. La licencia, las versiones mínimas de sistemas y los plazos siguen pendientes.

La conversación de referencia pudo consultarse, pero sus respuestas del asistente sólo contienen marcadores. Las decisiones denominadas «2 y 3» no son recuperables; no se les atribuye contenido. El presente encargo es la fuente de alcance.
## 2. Usuario y resultados buscados
Usuario inicial: desarrollador que trabaja con repositorios locales y varios hosts, conoce conceptos Git y necesita inspeccionar bifurcaciones, integrar cambios y resolver conflictos sin perder orientación.

JTBD-01: al alternar entre proyectos privados y públicos, abrir el repositorio correcto sin cambiar de herramienta.
JTBD-02: ante ramas divergentes, comprender qué commits faltan y escoger merge, rebase o cherry-pick con información suficiente.
JTBD-03: ante un conflicto o un fallo de red, conservar el trabajo y saber cómo continuar o abortar.

El éxito inicial se evaluará con tareas reproducibles y uso personal documentado. No existen entrevistas ni métricas de adopción registradas. El stack Tauri/React/Rust y la dirección visual están aprobados por el usuario; no se presentan como decisiones pendientes.
## 3. Principios y límites
Local-first significa que historial, diff, staging y commits funcionan sin cuenta ni conexión. Clone, fetch, push y funciones de API sí requieren red y permisos. Los datos de proveedores son complementarios y pueden quedar obsoletos; siempre se muestra la hora de actualización.

El repositorio en disco es la fuente de verdad. RavenGit vuelve a leer su estado tras cambios externos. No sincroniza código con una nube de RavenGit. No exige una cuenta de producto. La telemetría queda desactivada por defecto en la propuesta.
## 4. Alcance MVP propuesto
MVP significa una versión personal utilizable en ambos sistemas prioritarios. Las operaciones avanzadas forman parte del cierre del MVP; no se relegan todas al futuro. P0 es requisito para ese cierre, P1 pertenece a una iteración posterior.

| ID | Prioridad | Requisito y límite |
| --- | --- | --- |
| RG-01 | P0 | Abrir, inicializar y clonar repositorios; detectar Git ausente y repositorio movido o inválido. |
| RG-02 | P0 | Grafo paginado con padres reales, merges, refs locales/remotas, tags, HEAD y búsqueda por hash, mensaje y autor. |
| RG-03 | P0 | Cambios staged/unstaged, diff unificado y dividido, stage/unstage por archivo y bloque, commit y amend explícito. |
| RG-04 | P0 | Crear/cambiar/renombrar ramas, crear tags ligeros, configurar remotos, fetch, push y pull con estrategia elegida. |
| RG-05 | P0 | Merge, rebase lineal e interactivo acotado, cherry-pick, revert y stash con estados de continuar/abortar aplicables. |
| RG-06 | P0 | Conflictos con base/local/entrante y resultado; marcar resuelto sólo después de revisar y guardar. |
| RG-07 | P0 | Workspaces locales: agrupar y fijar repositorios; guardar selección, filtros y disposición sin copiar código. |
| RG-08 | P0 | SSH y HTTPS mediante Git y credenciales del sistema; perfiles por host/cuenta, Gitea con URL configurable. |
| RG-09 | P0 | Registro local de operaciones sanitizado, precondiciones y recuperación para acciones de riesgo. |
| RG-10 | P0 | Navegación por teclado, alternativa textual al grafo, escalado y estados accesibles sin depender sólo del color. |
| RG-11 | P1 | APIs de proveedores: listado privado de repositorios, metadatos, PR/MR, pipelines y revisión. |
| RG-12 | P1 | Crear y administrar Git worktrees, submódulos y flujos LFS especializados. |

RG-05 incluye en rebase interactivo ordenar, pick, reword, squash, fixup y drop en una secuencia lineal. Edit, exec, autosquash y rebase de merges quedan fuera de este MVP. No se permite interpretar comandos arbitrarios desde el plan visual. Reset destructivo y force push quedan para una ampliación con diseño específico; revert es la acción preferida para historial publicado.

Fuera del MVP: revisión completa de PR/MR, gestor de issues, terminal integrada, plugins de terceros, IA, colaboración en tiempo real, sincronización de workspaces, marketplace, paridad completa con GitKraken y distribución Linux. Un repositorio con worktrees debe detectarse y no dañarse aunque su administración visual llegue después.
## 5. Proveedores y compatibilidad
| Destino | Compromiso MVP | Ampliación pendiente |
| --- | --- | --- |
| GitHub / GitLab | Remotos Git SSH/HTTPS, repositorios privados según autorización del usuario; abrir URL web verificable. | OAuth, descubrimiento y PR/MR. GitLab autohospedado requiere matriz propia. |
| Gitea autohospedado | URL y puerto configurables; SSH/HTTPS; confianza TLS del sistema y errores explicados. | API por versión, tokens y compatibilidad con instalaciones concretas. |
| Bitbucket | Remotos Git SSH/HTTPS; selección explícita del destino. | Cloud frente a Data Center: decisión pendiente; no prometer una API común. |
| Git genérico | URL SSH/HTTPS compatible con Git; sin exigir detección de proveedor. | Otros transportes y extensiones sólo tras definir soporte. |

Un perfil de proveedor no sustituye a una identidad de autor Git. Un repositorio puede tener varios remotos y cada remoto una credencial distinta. Ningún fallo de API debe bloquear el historial local. Compatibilidad declarada exige probar cada combinación publicada; aún no existe esa matriz ejecutada.
## 6. Criterios de aceptación del MVP
| ID | Escenario verificable | Resultado esperado |
| --- | --- | --- |
| AC-01 / RG-01,08 | Sin conexión y sin cuentas, abrir un repositorio existente. | Historial, diff, staging y commit funcionan; red indica indisponibilidad sin bloquear lo local. |
| AC-02 / RG-02 | Cargar fixture con bifurcación, merge de dos padres, tag y detached HEAD. | Aristas y refs coinciden con Git; paginar no inventa padres; HEAD separado se identifica. |
| AC-03 / RG-03 | Archivo con dos bloques; preparar uno y crear commit. | Sólo el bloque preparado entra; el otro permanece; comparación de árbol confirma el resultado. |
| AC-04 / RG-04 | Fetch y push a cada familia de host con autorización y luego credencial inválida. | Éxito sólo tras código de salida correcto; fallo no se presenta como éxito ni revela secretos. |
| AC-05 / RG-05,06 | Rebase con conflicto; cerrar y reabrir RavenGit. | Reconoce operación en curso, permite resolver/continuar y abortar; aborto restaura el estado Git previsto. |
| AC-06 / RG-05 | Reordenar y squash en una rama local de prueba. | Previsualiza plan y nuevos hashes esperados conceptualmente; al ejecutar, árbol y padres se verifican con Git. |
| AC-07 / RG-05 | Cherry-pick con conflicto y revert de commit normal. | Explica estado, ofrece controles válidos y produce historial verificable; revert de merge queda bloqueado si no se elige padre principal. |
| AC-08 / RG-07 | Mover un repositorio del workspace y reabrir la app. | Señala ubicación ausente y permite relocalizar sin borrar ni recrear el repositorio. |
| AC-09 / RG-08,09 | Cambiar de cuenta en un host y exportar diagnóstico. | No reutiliza silenciosamente otra identidad; exportación excluye tokens, contraseñas y URL con secretos. |
| AC-10 / RG-09 | Otro proceso modifica HEAD antes de ejecutar un plan. | Invalida el plan y exige actualizarlo; no opera sobre una revisión diferente. |
| AC-11 / RG-10 | Completar selección de commit, lectura de diff y commit sólo con teclado. | Foco visible, orden lógico y lectura textual equivalente; registrar resultados por sistema. |
| AC-12 / RG-01–10 | Ejecutar suite de fixtures en Windows y macOS. | Sin defectos conocidos de pérdida de datos; errores reproducibles documentados; evidencias vinculadas a versión. |

Las credenciales y servidores para AC-04 se aportarán en la fase de prueba. No se afirma acceso ni validación de proveedores. Cada caso registrará versión de Git, sistema, fixture, pasos y evidencia.
## 7. Calidad y objetivos de rendimiento propuestos
Objetivos para validar, no mediciones: primera ventana de 200 commits en ≤2 s sobre fixture de 100 000 commits; respuesta visible a selección en ≤100 ms y diff textual de 1 MB en ≤500 ms. Medir p95 de 20 repeticiones con caché fría/caliente separadas y hardware registrado; ratificar umbrales tras el spike.

La UI debe seguir respondiendo durante Git y red. Historial y diff se cargan de forma incremental. Archivos grandes o binarios muestran límites explícitos y apertura externa; no se truncan silenciosamente. Integridad prima sobre velocidad. Sin cambios destructivos implícitos al cambiar de rama.
## 8. Roadmap por hitos, sin fechas comprometidas

La secuencia M0–M5 conserva el alcance original. El [roadmap de seguimiento](../../ROADMAP.md) es la fuente del estado actual, la matriz RG/AC y el orden recomendado de trabajo.

| Hito | Entrega objetivo | Situación al 21 de octubre de 2026 |
| --- | --- | --- |
| M0 · viabilidad | Stack, grafo/diff y motor Git con evidencia | Stack operativo; rendimiento, distribución y aceptación de base pendientes |
| M1 · lectura local | Apertura, grafo e inspección de commits/diff | Implementación principal disponible; aceptación nativa completa y rendimiento abiertos |
| M2 · trabajo diario | RG-03,04,07,08; transporte multiproveedor | Parcial: cambios/commit, ramas, transporte, biblioteca y colecciones; faltan operaciones básicas, aceptación de colecciones, perfiles y hosts reales |
| M3 · MVP avanzado | RG-05,06,09,10; recuperación y empaquetado | Parcial: merge/rebase lineal/replay; faltan stash, rebase interactivo, editor de conflictos y aceptación restante |
| M4 · integración | APIs por proveedor, PR/MR, worktrees y productividad | Planificado; definir capacidades por API/edición antes de implementarlas |
| M5 · apertura y Linux | Licencia, contribución, saneamiento y soporte Linux | Planificado; no se declara distribución pública ni Linux verificado |

El trabajo ha avanzado en varios hitos en paralelo; eso no cierra sus condiciones de aceptación. No hay fechas comprometidas ni porcentaje global. La siguiente prioridad es validar las colecciones locales implementadas en desarrollo y continuar con las operaciones básicas; la deuda de validación por plataforma y el resto de P0 permanecen visibles en el roadmap.

## 9. Riesgos y decisiones pendientes
| ID | Decisión o riesgo | Propuesta / evidencia necesaria |
| --- | --- | --- |
| D-01 | Stack aprobado | Tauri/React/Rust aprobado por el usuario. M0 valida su implementación, no vuelve a abrir la selección por defecto. |
| D-08 | Dirección visual aprobada | Experiencia tipo GitKraken: grafo central, paneles coordinados y acceso visual a operaciones; identidad propia RavenGit. |
| D-02 | Motor y distribución Git | CLI instalada es la implementación actual; distribución embebida, versión mínima, empaquetado, firma y credenciales conservan validaciones pendientes. |
| D-03 | Alcance exacto de APIs | Git como base común; acordar Cloud/Data Center y versiones autohospedadas antes de M4. |
| D-04 | Licencia y apertura | Mantener módulos desacoplados y sin secretos; elegir licencia y política de contribución antes de publicar. |
| D-05 | Rendimiento y tamaño | Medir fixtures reales, monorepos y diffs grandes; ajustar límites explícitos. |
| D-06 | Plataformas mínimas | Registrar versiones y arquitecturas objetivo antes de distribuir M3. |
| D-07 | Riesgo de pérdida de trabajo | Serializar escrituras, validar estado y diseñar recuperación; no prometer deshacer universal. |

Glosario: workspace = colección de repositorios en RavenGit; worktree = árbol de trabajo administrado por Git; cuenta = acceso remoto; autor = identidad escrita en commits; proveedor = familia del host. Estos términos son comunes a los tres documentos.
