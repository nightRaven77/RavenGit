# RavenGit · Índice de evidencia

## Validación macOS · Beta 1 · 02/11/2026

[Instalación convencional desde DMG y primer arranque](Beta_1_macOS_2026-11-02.md): paquete arm64 ad hoc con hash verificado, copia en `/Applications`, icono visible en Finder y Dock confirmado por el usuario; estado inicial sin repositorio. Suites automatizadas aprobadas; recorrido local de cambios y Stash con fixture desechable. `codesign` valida; `spctl` falla en ambas copias de esta Mac y `syspolicy_check` no termina. No se modificó la seguridad del sistema.

## Matriz instalada Windows · 2026-11-02

[Ejecución en WinQA](Matriz_beta_1_Windows_WinQA_2026-11-02.md): SHA256 del instalador coincide y Git/WebView2 están disponibles. Ejecución detenida antes de instalar/abrir: perfil beta previo y usuario limpio no acreditado; **0 aprobados, 0 fallidos, 48 bloqueados**, sin fixtures. No sustituye la matriz pendiente en otra máquina/usuario limpio.

## Matriz instalada Windows en otra máquina · preparada 30/10/2026

[Procedimiento y casos](../releases/MATRIZ_BETA_1_WINDOWS.md) · [Plantilla de informe](PLANTILLA_MATRIZ_BETA_1_WINDOWS.md). Documentación para una ejecución futura: **sin resultados nuevos en otra máquina**. El [registro de origen del 30/10](Beta_1_Windows_2026-10-30.md) conserva 271 UI, 8 referencias, 214 Rust y 2 del editor aprobadas, 6 Rust ignoradas, build e instalación básica bajo Codex; no certifica la matriz completa ni instalación limpia.

## Copia pública · 29/10/2026

[Snapshot y ZIP saneados](Copia_publica_2026-10-29.md): 330 archivos, Gitleaks sin alertas, datos privados anonimizados y capturas con píxeles conservados. Pruebas afectadas y frontend aprobados; sin publicación ni compilación nativa nueva. Avisos de terceros pendientes.

## Revisión previa a publicación · 29/10/2026

[Datos, historial y licencias](Revision_publicacion_2026-10-29.md): detector sin alertas en 34 commits/archivos actuales; datos privados y ejecutable antiguo localizados. Inventario de licencias creado; saneamiento y atribuciones pendientes. Sin publicación ni cambios de historial.

## Empaquetado por tag · 29/10/2026

[Eventos, versiones y precondiciones](Empaquetado_tags_2026-10-29.md): ocho pruebas y YAML aprobados, rechazo local de historial no integrado comprobado. Sin tag/push real ni ejecución remota.

## Preparación macOS en GitHub · 29/10/2026

[Workflow manual Apple Silicon y comprobación local](MacOS_empaquetado_GitHub_2026-10-29.md): empaquetado ad hoc, copia de DMG y arranque temporal comprobados; primera ejecución Actions e instalación macOS en Aplicaciones pendientes.

## Validación focalizada Beta 1 · macOS · 30/10/2026

[Bundle ad hoc, 271 UI, 206 Rust, Clippy/Rustfmt y aceptación nativa de Stash](Beta_1_macOS_2026-10-30.md): pruebas de referencias por tag y perfil beta aprobadas. La app abrió desde la copia de DMG aislada en `/private/tmp`; instalación en Aplicaciones y matriz amplia siguen pendientes.

## Preparación OSS y SignPath · 29/10/2026

[MIT, flujo GitHub y comprobaciones locales](SignPath_preparacion_2026-10-29.md): XML/YAML/PowerShell y versiones comprobados; rechazo de binario sin firma confirmado. Sin proyecto/certificado remoto ni primera ejecución CI o firma válida; la beta histórica permanece sin firma.

## Candidato beta Windows · 29/10/2026

[1.0.0-beta.1: regresión y empaquetado](Beta_1_Windows_2026-10-29.md): 271 UI, 214 Rust y 2 del editor aprobadas; seis auxiliares/manuales ignoradas. Incluye cortes controlados durante comandos de Stash. Estado del instalador y límites registrados por separado de la aceptación nativa histórica.

## Stash nativo y registro · Windows · 29/10/2026

[Guardar/restaurar capas, Unicode y recuperación tras conflicto](Stash_Windows_2026-10-29.md): nueve Rust y siete UI aprobadas, registro completo/exclusivo, Clippy y build aislado. UI Windows aprobada para guardado, restauración con index, ignorados conservados y conflicto con cierre forzado/reapertura/finalización sin repetir apply; entradas y respaldos conservados. Corte durante el comando, errores/escala/accesibilidad y nuevo guardado macOS pendientes.

## Hooks y fallos del registro · Windows · 29/10/2026

[Rechazo/timeout de hooks, archivo ocupado y almacenamiento simulado](Recuperacion_hooks_almacenamiento_Windows_2026-10-29.md): validación automatizada de recuperación y repetición de tres cortes forzados aprobadas. La pasada amplia tuvo un fallo de preparación por usar sólo lectura; el caso corregido con borrado denegado pasó por separado. Clippy/formato aprobados; no certifica disco lleno real, ACL completas, UI de estos fallos ni macOS.

## Corte durante checkout · Windows · 29/10/2026

[Regresión y corte de Tauri durante una transacción de índice](Corte_checkout_Windows_2026-10-29.md): una prueba aprobada y rechazo seguro nativo al reabrir. Archivo parcialmente actualizado y bloqueo retenido con registro/índice/HEAD/respaldo conservados. Continuación manual completada: evidencia archivada, originales restaurados, `main` limpia y reapertura nativa sin recuperación pendiente; no es recuperación automática.

## Aborto nativo tras corte · Windows · 29/10/2026

[Aborto desde UI después de cierre forzado y reapertura](Aborto_tras_corte_Windows_2026-10-29.md): aprobado en fixture aislada, con HEAD/árbol/contenido originales restaurados, `main` limpia, registro retirado y respaldo intacto. No cubre cortes durante escrituras, instalación ni macOS.

## Interrupciones forzadas de rebase · Windows · 28/10/2026

[Corte del proceso y recuperación en otro proceso](Interrupciones_rebase_Windows_2026-10-28.md): dos pruebas aprobadas, con tres cortes durante hook/conflicto, continuación/aborto, registro y respaldo conservados. Núcleo y contención Windows reales. Recorrido nativo adicional aprobado: inicio interactivo, cierre forzado detenido en conflicto, reapertura y continuación por UI con respaldo intacto y estado limpio. Sin red ni repositorios personales; aborto nativo tras corte, ventanas críticas restantes y macOS pendientes.

## Diagnóstico de autenticación · UI Windows · 28/10/2026

[Consulta SSH/HTTPS y portapapeles real](Diagnostico_autenticacion_UI_Windows_2026-10-28.md): éxito nativo aislado, siete identidades, invalidación al cambiar destino y JSON sin URLs/rutas verificados. Sin conexiones ni cambios de credenciales; integridad de fixture y ejecutable habitual comprobada. Fallos nativos y macOS pendientes.

## HTTPS · Windows · 28/10/2026

[Lectura GitHub/GitLab en repositorios desechables](HTTPS_Windows_2026-10-28.md): hash remoto esperado confirmado mediante núcleo RavenGit; HEAD/índice/configuración conservados. No acredita identidad, credenciales necesarias, publicación, UI ni macOS.

## Autenticación delegada · regresiones Windows · 28/10/2026

[Diagnóstico, copia sanitizada y Bitbucket](Cuentas_SSH.md#validación-automatizada-windows--28102026): 37 UI/4 archivos, 11 Rust + 2 manuales ignoradas, TypeScript/Vite, build debug Windows sin bundle, Clippy estricto y formato focalizado aprobados. Sin proveedores contactados ni publicaciones. Diagnóstico nativo nuevo, HTTPS real, múltiples identidades y macOS pendientes.

## Cuentas SSH · interfaz Windows · 28/10/2026

[Aceptación nativa aislada](Cuentas_SSH_UI_Windows_2026-10-28.md): agente inicial con siete identidades y lectura de cuatro remotos aprobados; revisión Push de Bitbucket/Gitea al día. GitHub/GitLab pasaron el reintento posterior solicitado por el usuario: ramas al día y confirmación deshabilitada; se conserva el registro del bloqueo inicial con agente vacío. Sin publicaciones adicionales. [Alta, edición y persistencia de perfiles](Perfiles_SSH_UI_Windows_2026-10-28.md) aprobadas en Windows, con revisión de alias sin guardar cambios Git; borrado y aplicación efectiva a descarga/publicación/ambas aprobados en la fixture Windows, con restauración exacta de configuración.

## Permisos SSH · remotos desechables Windows · 28/10/2026

[Lectura y publicación autorizadas](Permisos_SSH_Windows_2026-10-28.md): Gitea, GitLab, GitHub y Bitbucket confirmados mediante revisión/publicación del núcleo y hash remoto exacto; Bitbucket pasó al reintentar con ssh.bitbucket.org por petición del usuario. Sin borrados ni force push. No equivale a aceptación de la interfaz o macOS.

## Identidad SSH · Windows · 28/10/2026

[Saludos directos en Windows](Identidad_SSH_Windows_2026-10-28.md): GitHub/GitLab confirmaron nightRaven77 y alias gitea confirmó Erick; Bitbucket aceptó la llave sin revelar cuenta tras el ajuste del usuario. No prueba permisos de proyectos ni el flujo de RavenGit.

## Actividad, diagnóstico y avisos globales · 27/10/2026

[Registro persistente sanitizado y exportación](Actividad_diagnostico_avisos.md): hasta 500 resultados, nombres neutros al exportar, borrado consentido y avisos para las operaciones Git principales. **264 UI/29 archivos y 196 Rust aprobadas + 1 manual ignorada**, TypeScript/Vite, Rustfmt, Clippy estricto y bundle ARM64 aislado aprobados. Persistencia y exportación pasaron nativamente en macOS; borrado efectivo y Windows siguen pendientes.

## macOS actual · 27/10/2026

[Suites frescas y aceptación nativa acotada](MacOS_actual_2026-10-27.md) sobre `eb6621d`: 259 UI/28 archivos, 193 Rust aprobadas + 1 manual ignorada y 2 del editor, Clippy/formato/build/bundle; C.2 con teclado, errores y 300 cambios, más los cuatro ajustes UX pendientes a 900 × 640. VoiceOver, escalado, proveedores reales, interrupciones y distribución siguen abiertos.

## SSH real · Windows · 27/10/2026

[Lectura de GitLab, Gitea y GitHub con agente disponible](SSH_real_Windows_2026-10-27.md): SSH real en destinos elegidos por el usuario, HTTPS adicional de GitHub y núcleo de producción; HEAD/índice/configuración conservados y prueba manual ignorada por defecto. No certifica identidad exacta, publicación, UI ni macOS.

## Identidad SSH · macOS · 27/10/2026

[Saludo de autenticación de GitHub, GitLab y Bitbucket](Identidad_SSH_macOS_2026-10-27.md): GitHub y GitLab devolvieron la misma cuenta; Bitbucket aceptó la llave pero no revela el identificador. Verificación estricta del host; sin repositorios, permisos de proyecto ni flujo de RavenGit.

## Cuentas SSH y agente · 27/10/2026

[Perfiles por host/alias, revisión de remotos y selección al clonar](Cuentas_SSH.md): 259 UI/28 archivos y regresiones Rust focalizadas; metadatos sin credenciales y diagnóstico local sanitizado. Aceptación nativa y proveedores/agentes reales pendientes.

## Teclado y foco · preparación múltiple · 27/10/2026

[Accesibilidad focalizada](Accesibilidad_preparacion_2026-10-27.md): selección con Tab/Espacio, estado parcial, foco tras éxito/error y respeto del foco ajeno; 17 casos del módulo aprobados. La [aceptación nativa Mac posterior](MacOS_actual_2026-10-27.md) cubre teclado, estados AX y foco; lector de pantalla real y Windows siguen pendientes.

## Ajustes UX · Windows · 27/10/2026

[Comprobación visual a 900 × 640](UX_Windows_2026-10-27.md): Cerrar fijo desde el final del editor, ayuda Inicio/Fin, acceso a recuperación de merge y limpieza del aviso anterior al revisar otro rebase. La [repetición macOS](MacOS_actual_2026-10-27.md) también pasó de forma acotada; accesibilidad completa permanece pendiente.

## Windows actual · 26/10/2026

[Consolidación sobre e715539](Windows_actual_2026-10-26.md): 191 pruebas del núcleo + 2 del protocolo del editor y 241 UI aprobadas; un auxiliar de subprocesos ignorado. Incluye C.2, D.2d y D.3 automatizados. El [recorrido nativo posterior](Windows_nativo_2026-10-26.md) comprueba preparación múltiple/commit, conflictos/respaldos y seis acciones/orden de rebase con reapertura, continuación y aborto a 900 × 640; detalla los pendientes propios de Windows.

## C.2 · preparación múltiple nativa macOS · 25/10

[Preparar seleccionados y preparar todos](Preparacion_multiple.md): transacción única del índice, 241 UI, 190 Rust + 2 del editor y recorrido nativo a 900 × 640 con selección parcial, preparación total y commit de cierre en fixture desechable. Windows, accesibilidad completa, submódulos y quitar preparados en grupo siguen pendientes.

## D.3 · fixup, drop y commit vacío nativos macOS · 25/10

[Dos pausas fixup, drop antes de conflicto posterior y aborto de commit vacío](Rebase_interactivo_conflictos_restantes_macOS.md): 53 comprobaciones independientes, tres regresiones Rust y suite completa 188 + 2. Completa la matriz por acción en Mac; Windows, interrupciones forzadas, accesibilidad y hooks/permisos siguen pendientes.

## D.3 · conflictos reword/squash nativos macOS · 25/10

[Conflictos durante reword y squash](Rebase_interactivo_conflictos_acciones_macOS.md): planes iniciados desde UI, resolución y continuación guiadas, mensajes/padres/archivos/respaldo exactos; 47 verificaciones Git y regresión Rust nueva. Los casos restantes de Mac constan en el registro posterior; Windows e interrupciones siguen pendientes.

## D.3 · recuperación textual nativa macOS

[Conflicto, reapertura, continuar y abortar](Rebase_interactivo_recuperacion_macOS.md): dos picks, mensajes y respaldo exactos; 51 verificaciones por fase y 10 de limpieza. Windows, otras acciones/conflictos y encuadre completo estrecho pendientes.

## D.3 · cierre de foco de errores · 24/10

[Error visible y enfocado desde el final del diálogo](Rebase_interactivo.md#cierre-de-aceptación-del-error-visible--24102026): aceptación nativa independiente en ambas ventanas sobre `c8101a7`, 238 UI y 184 Rust + 2 del editor. No cierra Windows ni recuperación nativa completa.

## D.3 · rebase interactivo acotado

[Ordenar, pick/reword/squash/fixup/drop](Rebase_interactivo.md): primer alcance lineal 1–50 commits con revisión, respaldo y recuperación. Pruebas Git y éxito nativo Mac acotado; una regresión Unix cubre recuperación tras timeout de `pre-rebase`. Windows, matar la aplicación y aceptación completa siguen pendientes.

## D.2d · extremos por teclado en macOS

[Inicio/Fin y ⌘↑/⌘↓ en paneles extensos](D2d_teclado_macOS.md): foco conservado, salida por Tab y consentimiento intacto, con revisión nativa independiente y 6 invariantes conservados. No cierra accesibilidad completa.

## D.2d · límites de texto en macOS

[Límite exacto, exceso de tamaño y revisiones obsoletas](D2d_limites_macOS.md): 45 comprobaciones independientes y corrección visual de líneas extremas con reinspección. Teclado completo de paneles extensos pendiente.

## D.2d · aceptación adicional macOS

[Teclado, errores nativos y recuperación tras reapertura](D2d_aceptacion_macOS.md): 37 comprobaciones independientes; biblioteca del perfil nuevo vacía sin borrar archivos. No cierra Windows ni accesibilidad completa.

## Incremento D.2d · Recuperación guiada

[Recuperar respaldos de conflictos](Recuperar_respaldos_conflictos.md): comparar, confirmar y conservar otra copia antes del reemplazo. Primer alcance de merge pendiente compatible, sin índice/commit/continuación automática. **234 UI / 25 archivos y 178 Rust**, con límites y evidencia nativa en el registro específico.

## macOS · Conflictos D.2a–c · 23/10

[Consulta, guardado, preparación y reapertura](Conflictos_macOS_2026-10-23.md) sobre `4305dd1`, con merge textual en fixtures y perfiles de aplicación aislados. **225 UI / 24 archivos y 171 Rust**, Clippy, formato y bundles debug ARM64 aprobados. No cierra RG-06 ni extrapola la evidencia a otras operaciones o Windows.

## Incremento D.2c · Preparación de resolución

[Preparación revisada](Preparar_resoluciones.md): confirmación independiente tras guardar, índice temporal y comparación del contenido filtrado; sin commit/continuación. Ver el registro para evidencia y pendientes por operación/plataforma.

## Incremento D.2b · Guardado de resolución

[Editor textual y respaldo](Editar_conflictos.md): reemplaza sólo archivo de trabajo, sin preparar/continuar. 7 Rust focalizadas Windows y 222 UI aprobadas; conserva aceptación nativa, casos avanzados y recuperación como pendientes.

## Incremento D.2a · Consulta de conflictos

[Visor de tres vías](Consulta_conflictos.md): Base/Local/Entrante del índice, sólo lectura. No incluye edición, guardado ni continuación; mantiene pendiente aceptación nativa y RG-06.

Actualizado: 27 de octubre de 2026. Este índice organiza registros existentes; no ejecuta ni certifica pruebas nuevas. El [roadmap](../../ROADMAP.md) vincula evidencia con requisitos y aceptación. Las cifras históricas no se suman: las suites crecen y muchas pruebas se repiten entre incrementos.

## Incremento UX · Avisos de Push

[Avisos de operaciones](Avisos_operaciones.md): progreso y resultados generales de Push, contexto conservado al cambiar de vista/repositorio y cierre independiente. **212 pruebas UI/23 archivos y 152 Rust**, Clippy, formato y build Mac aprobados. No cierra la unificación de las demás operaciones ni certifica Windows o lector de pantalla.

## Incremento D.1 · Stash

[Stash recuperable](Stash_recuperable.md): guardar/restaurar con respaldo y registro persistente. **203 pruebas UI/22 archivos y 150 Rust**; Git real en fixtures, conflictos resueltos externamente y finalización sin reset. Los límites y la evidencia nativa se detallan en el registro; no cierra aceptación completa de Git avanzado.

## Punto anterior de código validado

`374c594` · versión de desarrollo 0.4.2. Validación macOS del **22/10**: **196 pruebas de interfaz en 21 archivos**, **143 Rust**, Clippy, Rustfmt/Prettier, TypeScript/Vite y bundle ARM64 aprobados. Incluye revisión nativa de amend, tag local/publicado/Coincide, init/clone local y colecciones tras reiniciar. La primera suite Rust encontró una expectativa antigua; se corrigió sólo la prueba y se repitió completa. [Registro](MacOS_actual_2026-10-22.md) y [resultados estructurados](MacOS_actual_2026-10-22_resultados.json).

La [actualización Windows](Windows_actual_2026-10-22.md) ejecutó la suite completa sobre `6533312`; las funciones posteriores tienen sus registros focalizados/UI/build. No se extrapola el resultado Mac a Windows ni se suman las suites históricas.

| Área                                 | Registro                                                                                                                                    | Evidencia y límites                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stash recuperable · Mac              | [Alcance y pruebas](Stash_recuperable.md), [resultados](Stash_macOS_resultados.json)                                                        | 203 UI/150 Rust. Guardar/restaurar con preparación nativo; conflicto/reapertura nativos pendientes                                                                                             |
| Avances 22/10 · Mac anterior a Stash | [Validación nativa y automatizada](MacOS_actual_2026-10-22.md)                                                                              | 196 UI/143 Rust, build y 41 comprobaciones independientes. Éxito native local; sin Papelera, ventana mínima o proveedores reales                                                               |
| Biblioteca/preferencias              | [Espacio local](../producto/06_Espacio_local.md)                                                                                            | Pruebas, pin/reapertura/persistencia tras reiniciar y quitar entrada en nativo Mac. Relocalización real, errores reales, filtro/búsqueda persistidos y ventana estrecha pendientes visualmente |
| Historial y filtros                  | [Historial visual](../producto/05_Historial_visual.md)                                                                                      | Backend paginado por ámbito; render/recorrido nativo Mac 1440 × 920. Sin benchmark de 100 000 commits                                                                                          |
| Navegación y agrupación              | [Rediseño](../producto/04_Rediseno_interfaz.md)                                                                                             | Revisión independiente amplia en Mac; no certifica lector de pantalla ni 900 × 640                                                                                                             |
| Rebase                               | [Ejecución](Rebase_ejecucion.md), [revisión](Rebase_revision.md), [Mac nativo](Rebase_macOS.md), [resultados](Rebase_macOS_resultados.json) | Incluye conflicto, cierre normal/reapertura, resolución/continuación, aborto e inicio rechazado. No cierre forzado ni Windows actual                                                           |
| Cherry-pick/revert                   | [Alcance y pruebas](Cherry_pick_revert.md), [resultados nativos](Cherry_pick_revert_macOS_resultados.json)                                  | Éxito nativo Mac sin conflicto; recuperación/conflicto en pruebas Rust. Falta reinicio nativo durante conflicto                                                                                |
| Merge                                | [Revisión](Merge_revision.md), [ejecución](Merge_ejecucion.md)                                                                              | Precondiciones, integración y recuperación acotadas. No editor de tres vías                                                                                                                    |
| Pull                                 | [Pull seguro](Pull_seguro.md)                                                                                                               | Fetch y merge separados; sin estrategia rebase ni aceptación completa de proveedores                                                                                                           |
| Diff                                 | [Diff dividido](Diff_dividido.md)                                                                                                           | Parser y visualización reutilizable; no benchmark de diff grande ni virtualización del diff                                                                                                    |
| Ramas                                | [Ramas locales](Ramas_locales.md)                                                                                                           | Documento histórico del incremento; sus pendientes de procesos/fixtures Windows se actualizan en Windows_estabilizacion, no se mantienen como estado actual                                    |
| Windows anterior                     | [Estabilización](Windows_estabilizacion.md), [viabilidad](Windows_viabilidad.md)                                                            | 62 pruebas Rust/43 de UI y build debug de aquel incremento; no extrapolar a las funciones recientes                                                                                            |
| SSH Windows                          | [Diagnóstico y selección de cliente](SSH_Windows.md)                                                                                        | Autenticación GitLab y `ls-remote` concretos. No implica Fetch/Push/Pull completos por proveedor                                                                                               |
| Base inicial                         | [M0](M0.md), [0.2.0](0.2.0.md), [0.3.0](0.3.0.md), [0.4.0](0.4.0.md), [0.4.1](0.4.1.md), [0.4.2](0.4.2.md)                                  | Registros históricos de versiones/incrementos. Rutas, números y funciones de entonces no describen necesariamente el punto actual                                                              |

## Puertas abiertas de validación

Incremento C de [clonado](Clonar_repositorio.md): 6 pruebas Rust específicas con
orígenes locales, 29 afectadas contando transporte/inicialización y 138 de interfaz
aprobadas; build Windows debug sin bundle aprobado. Incluye regresión de rutas Windows;
el recorrido nativo y clones SSH/HTTPS reales quedan pendientes.

Incremento C inicial: [inicializar repositorio](Inicializar_repositorio.md), creación
de carpeta/repositorio nuevo con rama explícita; 6 pruebas Rust del módulo aprobadas.
Aceptación nativa pendiente; clonado permanece fuera de este incremento.

Incremento B implementado en desarrollo: [colecciones locales](Colecciones_locales.md),
11 pruebas Rust de biblioteca y 125 de interfaz aprobadas. Migración conservadora,
gestión/asignación y revisión de fixture visual; aceptación nativa de la nueva función
pendiente. La confirmación del usuario del cierre de cherry-pick se registra por separado.

Incremento A en curso: [consolidación de biblioteca](Consolidacion_biblioteca.md)
añade recuperación de lectura y foco de teclado, 115 pruebas de interfaz aprobadas
y revisión de una fixture en navegador a 900 × 640 y 720 × 512. Conserva pendientes
la interacción/persistencia nativa y los restantes casos de A.

Actualización Windows del 22 de octubre de 2026 sobre `6533312`:
[consolidación automatizada actual](Windows_actual_2026-10-22.md), **96 pruebas Rust
aprobadas y 1 auxiliar ignorada**, **106 de interfaz**, formato, Clippy,
TypeScript/Vite y build nativo debug sin bundle aprobados. No incluye smoke de
interacción nativa ni instalador; los registros anteriores conservan sus cifras.

1. **Mac, prioridad inmediata:** ventana mínima/escalado y teclado; biblioteca con varias entradas, ubicación realmente movida y relocalización tras reiniciar; persistencia de filtro/búsqueda; error de guardado y reintento; replay con conflicto y reinicio.
2. **Rendimiento:** fixture de 100 000 commits, selección/diff, paginación profunda, memoria, p95 y cachés fría/caliente según objetivos originales. La prueba de cálculo de ancho con muchas filas no mide renderizado.
3. **Accesibilidad:** contraste medido, navegación completa por teclado, lector de pantalla y alternativa textual al grafo por plataforma.
4. **Transporte real:** GitHub/GitLab/Gitea autohospedado/Bitbucket, SSH/HTTPS, identidades y credenciales inválidas. Requiere servidores y cuentas de prueba autorizados; no se usan secretos ficticios como evidencia.
5. **Windows:** suites y build actuales repetidos el 22 de octubre; falta smoke nativo del mismo código. Biblioteca, rediseño y nuevas operaciones no quedan certificados visualmente por las pruebas automatizadas.
6. **Entrega:** instalación limpia, mínimos de sistema/Git, firma/notarización y recuperación ante interrupción forzada. Linux conserva su fase posterior.

Incremento de [destino predeterminado, nombre de clonado y Papelera](Destinos_y_papelera.md): 156 pruebas de interfaz y 9 pruebas Rust focalizadas aprobadas. El traslado real a Papelera requiere aceptación nativa; los fixtures simulan el traslado sin tocar repositorios del usuario.

Incremento C de [amend explícito](Amend_explicito.md): 7 pruebas Rust específicas con Git real y 165 de interfaz aprobadas; respaldo local y confirmación separada. La aceptación nativa Windows/macOS queda pendiente.

Nueva [revisión de interfaz, rendimiento y UX](Revision_UX_rendimiento.md): primera pasada de búsqueda virtualizada, diffs visibles y biblioteca cerrable durante carga. Mantiene pendientes benchmark y aceptación visual nativa.

Incremento C de [tags ligeros](Tags_ligeros.md): creación local con destino explícito y sin sobrescritura; aceptación nativa Windows/macOS pendiente.

Incremento C.1 de [publicación segura de tags](Publicar_tags.md): una etiqueta ligera/destino revisados, estados nueva/coincidente/conflictiva y verificación posterior; sin GitHub CLI ni releases. Aceptación nativa/proveedores pendiente.

No se cierra un criterio por la existencia de código, una maqueta, un build o una prueba de otra versión. Para cada nuevo registro incluir: fecha, commit/estado de fuentes, sistema/hardware, Git/toolchain, fixture, pasos, resultado, evidencia y exclusiones.
