# RavenGit · Análisis de arquitectura

**Estado:** especificación objetivo con seguimiento de implementación · **Versión documental:** 0.3 · **Actualizado:** 21 de octubre de 2026
**Producto:** RavenGit · **Identidad:** Obsidian / Azure / carmesí

Esta documentación conserva el alcance objetivo y las decisiones de producto. El [estado y roadmap](../../ROADMAP.md), con corte sobre el código `20c1856`, separa lo implementado de la aceptación pendiente; el `índice de validaciones` (archivo no incluido en este repositorio: `README.md`) enlaza la evidencia. «Confirmado» significa solicitado por el usuario; «propuesto» conserva una propuesta; «pendiente» es una decisión o comprobación abierta. La especificación no acredita por sí sola implementación, rendimiento ni validación con usuarios.


## 1. Conclusión y estado de la recomendación
Tauri + React + Rust queda aprobado por el usuario como stack de RavenGit. React/TypeScript es la implementación actual del frontend; la aprobación no fija versiones ni bibliotecas auxiliares. La composición web facilita iterar un lienzo denso y el núcleo Rust concentra servicios y ejecución; esta justificación es una inferencia de diseño, no un benchmark.

La comparación con C#/Avalonia se conserva como registro de alternativas. M0 se centra en validar el stack elegido en Windows y macOS. Avalonia queda como alternativa de contingencia si aparece un impedimento técnico material, sin exigir mantener dos prototipos. Una eventual sustitución requiere una nueva decisión explícita.

## 2. Hechos documentales y sus límites
Tauri separa un núcleo y WebViews; utiliza WebView2 en Windows, WKWebView en macOS y WebKitGTK en Linux [S1]. Sus capacidades permiten acotar exposición de comandos al frontend [S2]. Esto no vuelve segura por sí sola una orden propia: validar rutas, argumentos y permisos continúa siendo responsabilidad de RavenGit.

Avalonia documenta soporte multiplataforma y requisitos por sistema [S3]; su accesibilidad requiere revisar cobertura por plataforma [S4]. Soporte declarado por un framework no equivale a certificar RavenGit. Ninguna fuente demuestra que uno de estos stacks renderice mejor el grafo de este producto.
## 3. Comparación cualitativa
| Criterio | Tauri / React / Rust | C# / Avalonia |
| --- | --- | --- |
| Grafo y diff | DOM virtualizado para texto y lienzo SVG/Canvas para aristas; accesibilidad del lienzo exige capa textual. | Controles virtualizados y dibujo personalizado; requiere prototipo de selección, scroll y lector de pantalla. |
| Iteración visual | CSS y componentes facilitan tokens y prototipos; exige controlar complejidad del estado. | XAML, estilos y MVVM favorecen separación; curva depende del conocimiento .NET. |
| Complejidad | Tres ecosistemas y frontera IPC tipada; toolchains frontend y Rust. | C# como lenguaje principal y XAML; bindings y empaquetado multiplataforma por resolver. |
| Integración Git | CLI desde Rust; bibliotecas opcionales tras comparar cobertura. | CLI desde .NET; bibliotecas opcionales tras comparar cobertura. |
| Seguridad | Frontera WebView/núcleo, capacidades mínimas y CSP; riesgo de contenido no confiable. | Sin puente web en la propuesta; validar procesos, secretos, archivos y datos remotos igualmente. |
| Consistencia visual | Diferencias de WebView por plataforma deben probarse. | Renderizado y controles de Avalonia requieren validación visual y accesible por sistema. |
| Recursos | Tamaño y memoria dependen del paquete, WebView y grafo; sin cifras verificadas. | Tamaño y memoria dependen de runtime, publicación y grafo; sin cifras verificadas. |
| Mantenimiento | Contratos IPC y dependencias npm/crates requieren disciplina. | Dependencias NuGet y versiones .NET/Avalonia requieren disciplina. |
| Apertura futura | Arquitectura modular viable; auditar licencias concretas del árbol de dependencias. | Arquitectura modular viable; misma auditoría, incluidos controles adicionales. |

No se asignan puntuaciones numéricas sin medir ni se afirma una superioridad global. Los factores decisivos son grafo/diff, integridad Git, coste de mantenimiento individual y acceso real a las dos plataformas.
## 4. Arquitectura lógica común
Interfaz → servicios de aplicación → dominio Git → adaptadores Git/proveedores/secretos → sistema operativo o red.

La interfaz presenta estados y envía intenciones; nunca compone una línea de shell. Los servicios coordinan precondiciones, planificación, ejecución, registro y actualización. El dominio representa RepoId, WorktreeId, CommitId, RemoteId, OperationId y AccountRef, sin depender de React o Avalonia.

El adaptador Git devuelve objetos estructurados y errores normalizados. Los adaptadores de proveedor agregan capacidades y metadatos, sin sustituir el transporte Git. El almacén de secretos devuelve referencias opacas al servicio; el frontend recibe estado de conexión, nunca el token.

En Tauri: frontend React → comandos IPC específicos → servicios Rust. En Avalonia: vistas → ViewModels → los mismos límites lógicos en servicios .NET. No se propone mantener ambos backends simultáneamente.
## 5. Motor Git propuesto
Usar inicialmente Git CLI instalado y detectado, con validación de versión al abrir la app. Esto conserva un camino próximo al flujo del usuario, pero exige soportar diferencias de versiones, prompts, hooks y helpers. D-02 decidirá si distribuir un Git propio; no se descargará automáticamente sin diseño de actualización y licencias.

Ejecutar procesos con argumentos separados, cwd validado y rutas tras separadores de opciones cuando correspondan; nunca concatenar shell ni aceptar flags arbitrarios desde la UI. Usar salidas diseñadas para parseo, delimitación NUL cuando aplique y formatos explícitos: status porcelain, refs y logs estructurados. Git documenta el formato porcelain para uso programático [S5].

Bibliotecas como libgit2 o alternativas Rust quedan bajo evaluación. No mezclar lectores y escritores sin normalizar semántica y caché. La elección de framework no decide automáticamente el motor Git.

Git puede ejecutar hooks, filtros y helpers configurados. Mostrar confianza del repositorio al primer uso, no activar directorios inseguros globalmente y conservar la salida de hooks sin secretos. SSH host keys y TLS se verifican; no ofrecer desactivar validación como arreglo automático.
## 6. Contratos y concurrencia
Lecturas paginadas: HistoryQuery(repo, refs, filtros, cursor, generation) → commits, aristas, cursor y estado shallow. DiffQuery especifica ambos lados, archivo, modo y límite. Nunca interpretar un commit como autor confiable: mensajes y nombres se muestran como texto escapado.

Mutaciones: PlanOperation(repo, tipo, argumentos tipados, expectedHead, fingerprintIndex) → resumen, precondiciones y nivel de riesgo. ExecuteOperation(planId) revalida el estado; un plan obsoleto se rechaza. Eventos incluyen OperationId, fase, progreso indeterminado o medido y resultado.

Máquina de estados: preparada → ejecutando → completada / fallida / requiere resolución. Una operación Git interrumpida se reconstruye desde disco al iniciar. Cancelar una tarea de lectura es distinto de abortar un rebase; matar un proceso no garantiza revertir sus efectos.

Serializar mutaciones por repositorio, incluyendo recursos compartidos entre worktrees. Respetar locks de Git; no borrar index.lock automáticamente. Lecturas tienen cancelación y generación para descartar respuestas antiguas. Watchers disparan invalidación con debounce y comprobación posterior; no son la fuente de verdad.
## 7. Grafo, diff y persistencia
Historial: extraer DAG por lotes, conservar todos los padres conocidos y marcar límites de carga. Calcular carriles de forma determinista, virtualizar filas y renderizar sólo la ventana visible. Alinear selección, texto y aristas bajo scroll; no usar posiciones visuales como identidad de commit. Considerar merges de múltiples padres y repositorios shallow.

Diff: separar working tree/index/commit, preservar bytes y nombres de archivo, detectar binarios y límites. Staging de bloque genera parche basado en la versión leída y revalida antes de aplicarlo. Una modificación concurrente obliga a refrescar; no intentar aplicar a ciegas.

Persistencia actual: biblioteca y preferencias del historial en JSON versionado bajo la configuración local de Tauri; autorización por ruta y registros de recuperación específicos se guardan de forma independiente. El [incremento del espacio local](06_Espacio_local.md) documenta reemplazo por temporal, validaciones y límite de una instancia. No existe aún un registro general de actividad ni almacén de cuentas.

Persistencia futura propuesta: SQLite para varias colecciones, cuentas sin secretos y registro sanitizado; caché de historial descartable con claves de repo/generación. No almacenar contenido de archivos ni diffs de forma persistente por defecto. Migraciones versionadas, copia de metadatos antes de migrar y exportación manual de configuración sin credenciales. Borrar un workspace elimina su metadata, nunca el repositorio.

Actualización del incremento de colecciones (22 de octubre): la implementación local usa JSON v2 y conserva v1 intacto al migrar. No requiere SQLite para esta escala acotada; SQLite sigue siendo una opción para necesidades posteriores. Quitar una colección desasigna sus repositorios sin borrar sus entradas ni preferencias. No se promete coordinación multiinstancia. Véase `colecciones locales` (archivo no incluido en este repositorio: `Colecciones_locales.md`).
## 8. Cuentas, seguridad y red
Guardar secretos mediante mecanismos del sistema, sujetos a prueba de disponibilidad; si el almacén falla, pedir reautenticación o uso temporal en memoria, sin fallback a texto plano. SSH se delega al agente/configuración de Git. Mantener separados acceso Git, token de API y nombre/email de autor.

Perfiles por proveedor, host normalizado, puerto y cuenta. Evitar enviar credenciales al host equivocado en redirects o cambios de URL. Permitir Gitea autohospedado sin imponer dominio público; certificados internos se resuelven con confianza administrada por el sistema.

Adapters publican capacidades: transporte Git, abrir web, listar repos, leer PR/MR. Estados: no configurado, conectado, expirado, sin permisos, sin red y limitado por tasa. Timeouts y reintentos limitados para lecturas idempotentes; no repetir push u otras mutaciones sin comprobar resultado.

Logs redactan secretos y rutas según opción de exportación. Sin contenido de repositorio enviado a RavenGit. URLs y textos externos se validan antes de abrir; sin HTML remoto ejecutable en el diff. Actualizaciones firmadas y canal de distribución siguen pendientes antes de distribución pública.
## 9. Spike M0 y validación del stack aprobado
Construir en Tauri/React/Rust una vertical: abrir fixture, renderizar historial paginado, seleccionar commit, mostrar diff, ejecutar commit en repositorio temporal y resolver un conflicto. Emplear datasets reproducibles y registrar sus límites; registrar horas de implementación sin convertirlas en promesa.

| Prueba | Evidencia requerida | Regla propuesta |
| --- | --- | --- |
| Grafo de 100 000 commits | Tiempos p95, memoria, captura y errores de carriles. | Cumplir objetivos RG-02; sin aristas incorrectas ni bloqueo sostenido. |
| Diff grande y nombres complejos | 1 MB textual, binario, Unicode, espacios y salto de línea en nombres. | Lectura correcta, límites visibles y staging íntegro. |
| Git avanzado | Rebase con conflicto, reinicio y aborto; edición externa. | AC-05 y AC-10 en ambos sistemas. |
| Accesibilidad | Teclado y lector de pantalla en grafo textual/diff. | Completar AC-11; documentar carencias. |
| Distribución | Instalación limpia en versiones candidatas de Windows/macOS. | Inicio, detección de Git y credenciales sin pasos ocultos. |

El stack está aprobado; M0 verifica los objetivos de integridad, accesibilidad, rendimiento y distribución. Ante fallos, ajustar la implementación y documentar impedimentos. Sólo un impedimento material justificaría proponer reabrir D-01. Aún no se ejecutó ninguna de estas pruebas.
## 10. ADR-001 aceptado y verificación posterior
Estado: aceptado por el usuario para Tauri/React/Rust. Contexto: grafo como centro, Git avanzado, dos sistemas y mantenimiento personal. Git CLI instalado y servicios Rust son la implementación actual. D-02 conserva pendientes la distribución de Git y su mínimo soportado, no la existencia del motor ya implementado. Consecuencias: frontera IPC explícita, toolchains frontend y Rust, y pruebas entre WebViews. Alternativa considerada: Avalonia/.NET. M0 verifica viabilidad; la aprobación no acredita resultados de pruebas.

Pruebas posteriores: dominio y parser con fixtures; integración en repositorios temporales; pruebas de recuperación y concurrencia; smoke de cada proveedor; instalación en máquinas limpias. Comparar árbol, refs e index contra Git, no sólo capturas. No usar repositorios personales como fixtures destructivos.
## 11. Fuentes primarias
Consulta documental: 19 de octubre de 2026. No se fijan versiones del stack a partir de páginas cambiantes; se registrarán en el ADR aprobado.

[S1] Tauri, Process Model: https://v2.tauri.app/concept/process-model/
[S2] Tauri, Capabilities: https://v2.tauri.app/es/security/capabilities/
[S3] Avalonia, Supported platforms: https://docs.avaloniaui.net/docs/supported-platforms
[S4] Avalonia, Accessibility: https://docs.avaloniaui.net/docs/app-development/accessibility
[S5] Git, git-status: https://git-scm.com/docs/git-status
[S6] Git, git-rebase (continuar, abortar y modo interactivo): https://git-scm.com/docs/git-rebase

Las fuentes sustentan características de los frameworks y Git. La selección del stack está aprobada; los objetivos de rendimiento y la evolución de persistencia siguen siendo propuestas específicas de RavenGit, sin benchmark acreditado.
