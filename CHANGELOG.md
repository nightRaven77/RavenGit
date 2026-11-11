# Cambios

## 1.0.0-beta.1 · candidato local Windows · 2026-10-29

- Alcance funcional congelado para estabilización; sin publicación, tag ni cierre de v1 estable.
- Beta Windows con nombre/perfil independientes, comprobación de versiones y preparación de instalador NSIS para el usuario actual.
- Registros de rebase/Stash publicados de forma exclusiva después de escritura completa y sincronización; validación Windows de conflictos, interrupciones y fallos acotados.
- Autenticación delegada a Git/OpenSSH, diagnóstico sanitizado y aceptación reciente conservan sus límites por plataforma/proveedor.
- [Plan de aceptación](docs/releases/PLAN_BETA_1.md) y [notas del candidato](docs/releases/1.0.0-beta.1.md). Instalación, firma, macOS y requisitos restantes se registran expresamente, sin extrapolar pruebas.

## Desarrollo · Actividad, diagnóstico y avisos globales · 2026-10-27

- **Herramientas → Actividad y diagnóstico…** conserva hasta 500 resultados finales con fecha, operación, estado y nombre de carpeta. No persiste rutas, URLs, credenciales, referencias, mensajes, diffs ni salida Git; la exportación reemplaza nombres por identificadores neutros y el borrado exige consentimiento/token vigente.
- Los avisos generales se extienden desde Push a las operaciones Git principales, confianza y perfiles SSH. Progreso y resultado comparten aviso; errores y fallos de refresco no disparan reintentos automáticos.
- 264 pruebas UI/29 archivos y 196 Rust aprobadas + 1 manual ignorada; TypeScript/Vite, Rustfmt, Clippy estricto y bundle ARM64 aislado aprobados. Persistencia y exportación sanitizada pasaron nativamente en macOS. La primera pasada descubrió y corrigió el permiso de guardado ausente; borrado efectivo y Windows siguen pendientes. [Alcance y límites](docs/validacion/Actividad_diagnostico_avisos.md).

## Desarrollo · Preparación múltiple de cambios · 2026-10-25

- Cambios incorpora casillas, contador, **Preparar seleccionados** y **Preparar todos**, conservando preparación individual y por bloque. Una única operación Rust valida el estado completo e instala el índice una sola vez; no crea commits ni cambia HEAD.
- 241 pruebas UI, 190 Rust del núcleo + 2 del editor, build/bundle y recorrido nativo macOS a 900 × 640 aprobados. La fixture confirmó selección parcial, altas/modificaciones/eliminaciones, borrador conservado y commit exacto posterior. [Evidencia y límites](docs/validacion/Preparacion_multiple.md). Windows, accesibilidad completa, submódulos y quitar preparados en grupo permanecen pendientes.

## Validación · Matriz restante de rebase interactivo en macOS · 2026-10-25

- `fixup` completado tras dos conflictos consecutivos; `drop` permaneció omitido antes y después de un conflicto posterior; un commit recién vacío se detuvo y el aborto restauró HEAD/árbol originales.
- 53 comprobaciones independientes, tres regresiones Rust nuevas y suite completa de 188 + 2 aprobadas. [Evidencia y límites](docs/validacion/Rebase_interactivo_conflictos_restantes_macOS.md). La matriz por acción queda cubierta en Mac; Windows, interrupciones forzadas, accesibilidad y errores de hooks/permisos siguen pendientes.

## Validación · Conflictos reword/squash en macOS · 2026-10-25

- Planes nativos `reword + pick` y `pick + squash + pick` detenidos por conflicto textual, preparados y continuados desde Ramas. Mensajes literales, padres, archivos, base y respaldos comprobados con 47 verificaciones Git.
- Regresión Rust nueva para conflicto durante `squash`; suite completa de aquel corte: 185 + 2, formato, Clippy y bundle aislado aprobados. [Evidencia y límites](docs/validacion/Rebase_interactivo_conflictos_acciones_macOS.md). Los casos posteriores se registran por separado.

## Validación · Recuperación de rebase interactivo en macOS · 2026-10-24

- Plan de dos picks iniciado desde UI, conflicto textual real, cierre/reapertura, preparación y continuación nativas; aborto independiente en copia de la fixture pausada. Mensajes completos, padres, archivos y respaldo comprobados.
- 51 verificaciones por fase y 10 de limpieza; entradas retiradas sin Papelera. [Evidencia y límites](docs/validacion/Rebase_interactivo_recuperacion_macOS.md). Sin cambios de producción; Windows y matriz completa pendientes.

## Validación · Rebase interactivo y foco de errores · 2026-10-24

- Sobre `c8101a7`, revisión inválida desde el final del diálogo muestra/enfoca automáticamente el error en ambas ventanas; reinspección independiente aprobada. 238 UI, 184 Rust + 2 del editor, formato, Clippy y bundle aprobados.
- Fixture y biblioteca nuevas aisladas; historial intacto y entrada retirada sin Papelera. [Evidencia y límites](docs/validacion/Rebase_interactivo.md#cierre-de-aceptación-del-error-visible--24102026). Sin cambios de producción en esta tanda.

## Desarrollo · Rebase interactivo acotado · 2026-10-23

- Desde Ramas, editar orden y acciones pick/reword/squash/fixup/drop de 1–50 commits lineales. Revisar hashes, asuntos y mensajes y consentir antes de reescribir, con respaldo persistente y recuperación de conflictos existente.
- Secuencia tipada y editor interno restringido; sin comandos libres, publicación ni force push. Pruebas Git de acciones/conflicto/continuación/aborto y éxito nativo Mac de reordenar/squash/reword. [Alcance y límites](docs/validacion/Rebase_interactivo.md); Windows y aceptación completa pendientes.

## Desarrollo · Retorno de foco de recuperación · 2026-10-23

- Al cerrar recuperación abierta por clic, el foco vuelve a su acceso también en WebKit/macOS. Escape/Cerrar y reapertura por teclado comprobados en instancia aislada; 32 pruebas UI y bundle aprobados. [Evidencia y límites](docs/validacion/D2d_teclado_macOS.md#actualización--retorno-al-acceso-después-de-apertura-por-clic).

## Desarrollo · Navegación de contenidos recuperables · 2026-10-23

- Inicio/Fin y ⌘↑/⌘↓ llevan al extremo del contenido enfocado sin desplazar el diálogo. Ayuda contextual, foco conservado y salida por Tab comprobados en macOS con textos de 512 KiB. [Evidencia y límites](docs/validacion/D2d_teclado_macOS.md).

## Desarrollo y validación · Límites D.2d en macOS · 2026-10-23

- Comparación de recuperación envuelve líneas extremas para evitar panel vacío al desplazarse horizontalmente. Reinspección independiente en ambas ventanas y restauración exacta de 512 KiB aprobadas.
- Rechazo nativo de exceso de un byte e índice/merge modificados durante revisión; 45 comprobaciones independientes. [Evidencia y límites](docs/validacion/D2d_limites_macOS.md).

## Validación · Aceptación adicional D.2d en macOS · 2026-10-23

- Recorrido con teclado, rechazo de archivo obsoleto/lock/metadatos corruptos y recuperación del trabajo posterior tras cerrar/reabrir, con 37 comprobaciones independientes. Registro inválido identificado correctamente tras revisión visual independiente.
- Perfil de aceptación nuevo limpiado sin Papelera; archivos y respaldos conservados. [Evidencia y límites](docs/validacion/D2d_aceptacion_macOS.md). Windows y accesibilidad completa siguen pendientes.

## Desarrollo · Recuperación guiada de respaldos · 2026-10-23

- Herramientas permite listar respaldos persistentes y comparar original/actual antes de restaurar un archivo durante un merge pendiente compatible. Conserva otra copia del trabajo actual antes de reemplazarlo y permite revisar esa copia para volver atrás.
- Revisión de un uso, verificación de hashes/estado, rechazo de enlaces y locks ajenos. No cambia el índice, HEAD ni continúa/aborta el merge. Al cerrar, Cambios se relee conservando el borrador del commit.
- Siete pruebas Rust nuevas, siete del diálogo y dos de integración/recarga. [Alcance, evidencia y límites](docs/validacion/Recuperar_respaldos_conflictos.md). Windows y la aceptación completa permanecen pendientes.

## Validación · Conflictos en macOS · 2026-10-23

- Revisados los avances de consulta/editor y preparación de resoluciones sobre `4305dd1`. 225 pruebas UI, 171 Rust, Clippy, formato y bundles ARM64 de validación aprobados.
- Recorrido de merge textual en perfiles aislados a 1440 × 920 y 900 × 640: guardar conserva índice en conflicto; preparar instala sólo el blob revisado, preservando otro preparado, HEAD, merge pendiente y respaldo. Recuperación de bytes a archivo nuevo comprobada en ambas fixtures; reapertura en amplia. Minor pendiente: mantener Cerrar visible al hacer scroll.
- No cambia lógica de producción, no crea una publicación y no cierra la matriz de conflictos por operación/plataforma. [Evidencia y límites](docs/validacion/Conflictos_macOS_2026-10-23.md).

## Desarrollo · Preparación revisada de resoluciones · 2026-10-23

- Después de guardar una resolución con respaldo, revisar el contenido/hash/modo que Git preparará y confirmar únicamente ese archivo.
- Reutiliza índice temporal, bloqueos y comprobaciones de estado; rechaza cambios del contenido filtrado respecto de la revisión. Conserva guardado/respaldo ante fallos, sin reintentos, commit ni continuación automática. [Alcance y evidencia](docs/validacion/Preparar_resoluciones.md).

## Desarrollo · Guardado de resolución de conflictos · 2026-10-23

- Editor de resultado UTF-8 para conflictos regulares de tres etapas, con elección explícita de versión completa, confirmación y conservación de LF/CRLF.
- Plan de un uso, revisión repetida de estado y respaldo persistente antes del reemplazo. Errores conservan borrador, sin reintentos ni preparación/continuación automática. [Alcance, evidencia y límites](docs/validacion/Editar_conflictos.md).

## Desarrollo · Consulta de conflictos · 2026-10-23

- Desde Cambios, consultar Base/Local/Entrante de un archivo en conflicto sin modificar índice ni archivos. Etapas ausentes, vacías y contenidos restringidos se distinguen explícitamente.
- Lectura por hash con confianza y estado comprobados, sin filtros ni descarga automática; cierre durante carga y descarte de respuestas antiguas. No incluye editor/guardado ni marca resoluciones. [Alcance y validación](docs/validacion/Consulta_conflictos.md).

## Desarrollo · Avisos generales de Push · 2026-10-22

- Progreso y resultado visibles fuera del panel de Push, con repositorio, ubicación y destino originales; resultados con cierre independiente durante la sesión.
- Estado explícito desde Rust: publicación confirmada, destino ya igual o resultado incierto. Los errores anteriores al envío se distinguen de una publicación sin confirmar.
- Un fallo de seguimiento o refresco local conserva el éxito confirmado y añade una advertencia sin reintentar el Push. No hay cierre automático ni cambio de foco.
- 212 pruebas UI y 152 Rust aprobadas, junto con Clippy, formato y build macOS. Las demás operaciones conservan sus avisos actuales y quedan pendientes de unificación. [Alcance y límites](docs/validacion/Avisos_operaciones.md).

## Desarrollo · Stash recuperable · 2026-10-22

- Botón Stash con guardado descrito, inclusión optativa de archivos nuevos, revisión y confirmación; los ignorados permanecen en el árbol.
- Restauración por hash completo, diff revisable y recuperación optativa de la preparación. Conserva la entrada original y respaldo `refs/ravengit/stash/<hash>`.
- Registro persistente ante fallo/interrupción; recuperación tras reabrir y finalización sin commit, reset ni repetición automática. Bloquea escrituras incompatibles mientras hay registro; conflictos resueltos externamente desde Git.
- Siete pruebas Rust nuevas y siete de interfaz. Caso de regresión con nombres acentuados: la invocación de stash permite el tratamiento interno de rutas de Git y verifica que los cambios seleccionados se retiraron antes de declarar éxito.
- Alcance acotado: sin pop/drop/clear ni aborto automático. RG-05 y la aceptación completa siguen abiertos. Ver `docs/validacion/Stash_recuperable.md`.

## Sin publicar · Revisión y validación macOS del 22 de octubre

- Revisados los avances de `6533312..374c594`; C.2 se mantiene como planificación, sin preparación múltiple implementada.
- 196 pruebas de interfaz y 143 de Rust aprobadas, formato/Clippy/build macOS ARM64. Corregida una expectativa antigua en la prueba de acceso remoto ausente y añadidas aserciones de no exposición de rutas; sin cambio en lógica de producción.
- Recorridos nativos y comprobaciones independientes de amend, tag local/publicado/Coincide, init/clone desde bare local y colecciones/pin tras reiniciar. Verificación del ICNS empaquetado y limpieza de metadatos de las fixtures.
- Evidencia, hashes, límites y roadmap actualizados en `docs/validacion/MacOS_actual_2026-10-22.md`. Ventana mínima, errores nativos, Papelera y proveedores reales siguen pendientes; siguiente desarrollo acordado D, sin adelantar C.2 automáticamente.

## Sin publicar · Publicar tags seleccionados

- Diagnósticos posteriores: distingue lectura local de consulta remota y clasifica repositorio inexistente/sin acceso y conexiones SSH interrumpidas, sin mostrar stderr ni credenciales. No cambia autenticación, permisos ni URLs automáticamente.

- Publicar una etiqueta ligera desde Herramientas o continuar explícitamente después de crearla. Selección de remoto, consulta de sólo esa referencia y confirmación independiente.
- Estados nueva/coincidente/conflictiva, plan de un uso, hash congelado y comprobaciones de configuración/origen/destino. Sin sobrescritura, mirror, envío masivo, ramas ni tags seguidos automáticamente.
- Verificación remota posterior y advertencias sin reintento ante resultado incierto o refresco fallido. Reutiliza SSH/HTTPS y credenciales existentes, sin GitHub CLI ni releases todavía.
- Evidencia y límites en `docs/validacion/Publicar_tags.md`.

## Sin publicar · Tags ligeros

- Crear etiquetas locales desde Herramientas o el commit seleccionado, con revisión de nombre/hash/asunto y confirmación independiente.
- Sin sobrescribir tags existentes, anotados o dañados; referencia exclusiva, plan de un uso y rechazo de revisión obsoleta. No cambia HEAD, index ni archivos, y no publica remotos.
- Errores conservan el nombre sin reintentos; éxito con refresco fallido no repite la creación. Evidencia y límites en `docs/validacion/Tags_ligeros.md`.

## Sin publicar · Identidad RavenGit

- Corrección de recursos nativos obsoletos: Cargo vigila `icons` para recompilar el ICO al regenerarlo. `npm run icons:verify` valida los seis tamaños dentro del ejecutable, además de los recursos fuente.

- Icono propio: cuervo Azure con ramificación Git en negativo y ojo carmesí sobre Obsidian.
- Aplicado en cabecera y favicon; regenerados PNG, ICO de Windows e ICNS de macOS desde `public/ravengit.svg`.
- `npm run icons` mantiene una única fuente vectorial, sin dependencias nuevas. Alcance y aceptación por plataforma en `docs/producto/07_Identidad_visual.md`.

## Sin publicar · Consolidación UX y rendimiento

- Búsqueda de historial virtualizada también con muchas coincidencias; índice reutilizable, filtrado diferido y navegación con Flechas/Inicio/Fin.
- Resultados más legibles y sin cabeceras del grafo ajenas a la búsqueda; referencias del lateral aclaran que no cambian de rama.
- Evita nuevas lecturas de diffs ocultos y espera al estado fresco de Cambios al volver. Diff unificado sin cálculo innecesario de filas divididas.
- Biblioteca cerrable durante la lectura inicial, conservando el bloqueo durante acciones. Confirmaciones Git y de Papelera intactas.
- Revisión y pendientes de aceptación en `docs/validacion/Revision_UX_rendimiento.md`; no sustituye benchmark ni auditoría nativa.

## Sin publicar · Amend explícito

- Reemplazar el último commit desde Cambios, con mensaje anterior/nuevo, autor conservado, contenido original y delta preparado revisables, y confirmación independiente del commit normal.
- Advierte si HEAD está contenido en referencias remotas locales; la ausencia de coincidencias no garantiza que no esté publicado. No consulta la red ni hace Push.
- Respaldo previo bajo `refs/ravengit/amend/`, plan de un uso y comprobación de HEAD/index/archivos/identidad/referencias. Un error no provoca reintento ni restauración automática.
- Sólo commits raíz o lineales en una rama local de un repositorio completo/simple. Merge, operaciones pendientes y configuraciones avanzadas quedan bloqueados. [Alcance y pruebas](docs/validacion/Amend_explicito.md).

## Sin publicar · Destinos y Papelera

- Carpeta predeterminada Documentos/RavenGit/Repositorios al crear o clonar, sin mover repositorios existentes y con ubicación alternativa.
- Nombre de carpeta sugerido desde el origen al clonar; conserva los cambios manuales.
- Quitar de la biblioteca sigue siendo sólo metadatos. Una opción separada permite enviar la carpeta a la Papelera, con revisión de ruta y confirmación escrita del nombre, sin alternativa de borrado permanente.
- Protecciones y límites de validación documentados en `docs/validacion/Destinos_y_papelera.md`. La interacción real con la Papelera requiere aceptación nativa.

## Sin publicar · Clonado seguro

- Clonar desde el lateral con origen/destino explícitos y confirmación de confianza en configuración/filtros Git. Destinos nuevos, sin sobrescritura ni repositorios anidados.
- Reutiliza SSH/HTTPS y diagnósticos existentes; admite orígenes locales normalizados a file:// en Windows. No introduce login web ni guarda credenciales en URL.
- Sin recursión de submódulos, LFS automático, plantillas/hooks ni objetos compartidos por optimización local; apertura posterior y biblioteca sin reclonar tras un fallo de refresco.
- Errores/resultados inciertos sin reintento ni borrado automático de destinos. Plazo 60 s; aceptación nativa y matriz de proveedores pendientes. Evidencia en `docs/validacion/Clonar_repositorio.md`.

## Sin publicar · Inicializar repositorio

- Nuevo repositorio desde el lateral: carpeta contenedora, carpeta nueva y rama inicial explícita, con confirmación separada.
- Creación exclusiva sin sobrescribir destinos ni anidar repositorios; sin plantillas/hooks, commits, remotos o autorización automática.
- Apertura y biblioteca mediante el flujo existente; si abrir falla tras crear, reintenta sólo apertura. Los resultados inciertos conservan el destino para inspección sin borrado automático.
- Primer incremento C de RG-01; clonado, amend y tags ligeros permanecen pendientes. Evidencia en `docs/validacion/Inicializar_repositorio.md`.

## Sin publicar · Colecciones locales

- Crear, renombrar, ordenar y quitar colecciones con confirmación; filtro combinado con búsqueda y Fijados/Recientes.
- Asignación por repositorio; quitar una colección conserva sus entradas, fijaciones, preferencias y archivos en Sin colección.
- Migración conservadora a `repositories-v2.json`, manteniendo v1 intacto; rechazo de datos inconsistentes y protección frente a expulsar entradas asignadas al alcanzar el límite.
- Recuperación de lectura/foco de biblioteca y cierre explícito de cherry-pick/revert, con claves React independientes de Cambios.
- Evidencia y límites en `docs/validacion/Colecciones_locales.md`. No declara completada la aceptación nativa ni una nueva versión.

## Sin publicar · Recuento y roadmap

- Estado consolidado sobre `20c1856`: matriz de requisitos RG-01–12 y criterios AC-01–12, estado de M0–M5 y orden recomendado de próximos incrementos en `ROADMAP.md`.
- Actualizados visión, arquitectura y UX a revisión documental 0.3; separan especificación objetivo de implementación actual, incluidas persistencia JSON y limitaciones de cuentas/colecciones.
- Nuevo índice de evidencia con alcance por plataforma/incremento. Se conservan cifras históricas y se distingue Windows anterior de macOS actual; no se declaran pruebas nuevas ni una nueva versión de aplicación.

## Sin publicar · Espacio local

- Biblioteca de repositorios recientes/fijados en el lateral: búsqueda, reapertura, quitar de la lista con confirmación y relocalización validada sin mover ni borrar código.
- Preferencias de historial por repositorio: filtro, búsqueda, selección de la primera página, columnas e inspector; estado de guardado, reintento y guardado antes de cambiar de repositorio.
- Metadatos versionados en la configuración de RavenGit, escritos mediante temporal y reemplazo. Archivos incompatibles se conservan y abrir carpetas manualmente continúa disponible.
- Primer incremento de RG-07, sin agrupación en varias colecciones ni sincronización. Evidencia y límites en `docs/producto/06_Espacio_local.md`.
- Validación: 106 pruebas de interfaz, 93 de Rust, Clippy sin advertencias y bundle macOS ARM64. Revisión nativa de biblioteca, fijación y persistencia tras reiniciar; centrado y confirmación de quitar comprobados en el bundle final.

## Sin publicar · Historial visual, segunda fase

- Filtro real de ascendencia por HEAD o rama local/remota, sin checkout ni fetch. La lectura paginada valida tanto el estado de las referencias como el ámbito seleccionado para impedir mezclar páginas.
- Actualizar conserva el filtro; cambiarlo reinicia la búsqueda y posición sólo cuando la lectura termina correctamente. Si falla, se conservan los commits y el filtro previos.
- Accesos a HEAD, padres y commits adyacentes en la lista. Si HEAD queda fuera de lo cargado, su acceso abre el historial de HEAD; un padre fuera de la ventana conserva el aviso explícito de carga.
- Validación: 98 pruebas de interfaz, 89 de Rust y Clippy sin advertencias. La revisión visual y sus límites se registran en la especificación del historial.

## Sin publicar · Historial visual, primera fase

- Avatares locales por iniciales del autor, sin solicitudes externas, con colores estables y alternativa para nombres vacíos.
- Columnas de autor y fecha; hash opcional desde Vista. Ancho del autor y proporción del inspector ajustables mediante controles accesibles por teclado.
- Inspector plegable que conserva la selección. Identidad y fecha resumidas; hash completo y padres bajo Más detalles. Cabecera sincronizada con el desplazamiento horizontal del historial.
- Validación automatizada de la primera fase: 95 pruebas de interfaz; bundle macOS ARM64 generado. Los filtros por rama y nueva navegación del grafo se describen en la segunda fase.

## Sin publicar · Simplificación de la interfaz

- Navegación principal en Cambios, Historial y Sincronizar; Remotos/Fetch, Pull y Publicar agrupados en una subnavegación que recuerda su última sección durante la sesión.
- Herramientas avanzadas y grupos de referencias plegables; gestión de autorización bajo demanda. La autorización inicial y los avisos de recuperación conservan su visibilidad.
- Barra de comandos centrada en funciones implementadas, tipografía compacta e inspector más amplio. Se conservan las revisiones y confirmaciones de Git existentes.
- Especificación y límites de la iteración en `docs/producto/04_Rediseno_interfaz.md`.

## Sin publicar · Ramas, integración y revisión de rebase

- Cherry-pick y revert de un commit normal con revisión/diff, confirmación, respaldo, resolución de texto y continuación/aborto recuperables. Acceso desde el inspector y Operaciones de commit; sin reescritura ni publicación automática.

- Diff dividido reutilizable en inspector de commits y Cambios, con numeración Antes/Después y vuelta al formato unificado para contenido no compatible. Preparación por bloques conserva el contrato IPC de Rust.

- Avances recibidos: gestión de ramas locales, merge recuperable, Pull con Fetch e integración separados, confianza persistente y mejoras de procesos/SSH en Windows. Sus evidencias se conservan en `docs/validacion/`.
- Nueva revisión local de rebase: rama activa/base explícitas, hashes, commits candidatos y detección de merges; sin ejecutar reescrituras.
- Continuación: ejecución explícita de rebase lineal, respaldo de la referencia original, resolución de texto, continuación y aborto recuperables tras reinicio. Se bloquean merges y archivos ignorados al iniciar; los parches que se vuelven vacíos detienen la operación.
- Validación nativa macOS ARM64 de rebase lineal, conflicto con cierre/reapertura, resolución/continuación y aborto. Recuperación visual de registros de inicio rechazado cuando se verifican rama original, árbol limpio y respaldo.
- Corregida la lista de comandos pendientes del README: Pull ya está conectado.
- La versión de desarrollo continúa en 0.4.2; no se declara una nueva versión publicada ni la aceptación completa de RG-05.

## 0.4.2 · Estabilización tras revisión

- Autorización previa a status/filtros e inspección de archivos; sin locks ni falsa indicación de árbol limpio antes de confiar.
- Bloqueo de lazy fetch en todos los comandos y ejecutor compartido con deadline para proceso, streams y entrada.
- Avisos globales fuera de los paneles ocultos y resultado explícito del refresco posterior a operaciones.
- Cálculo iterativo del ancho del grafo y fuentes de Tailwind limitadas al producto.
- Vista actual anunciada, acceso para saltar navegación y cierre de ayudas con Escape.
- Regresiones de filtros, objetos ausentes, pipes retenidos, avisos fuera de Historial y cálculo de gran cantidad de filas.

## 0.4.1 · Barra de comandos

- Barra compacta inspirada en la referencia visual del usuario, con contexto de repositorio/rama y grupos de iconos con etiquetas.
- Accesos a Abrir, Cambios, Actualizar, Fetch, Push y Buscar; se conservan las confirmaciones de red y publicación.
- Acciones pendientes inactivas con explicación, bloqueo durante operaciones y desplazamiento horizontal en ventanas estrechas.
- Cuatro pruebas de interacción de la barra; revisión visual con datos sintéticos a 1280 y 900 px.

## 0.4.0 · Publicación normal con revisión

- Vista Publicar con remoto, ramas y URL efectiva de publicación.
- Comparación con el destino real, total y lista acotada de commits, detección de atraso/divergencia.
- Revisión guardada en Rust y consumida al confirmar; refspec único con commit fijo, sin force ni etiquetas.
- Seguimiento opcional cuando descarga/publicación comparten destino; advertencia separada si falla tras publicar.
- Revalidación antes de enviar y serialización de apertura de repositorio con operaciones de publicación.
- 13 pruebas nuevas Rust con servidores bare locales y 10 pruebas de UI con IPC simulado.

Pendientes: validación con proveedores reales, interacción nativa completa y plataformas adicionales.

## 0.3.0 · Remotos y fetch explícito

- Vista Remotos: alta, edición y eliminación con revisión del destino y efectos.
- URLs de descarga/publicación separadas; remotos sin dependencia de cuentas o proveedor.
- Comprobación de lectura y fetch individual de ramas, sin merge, push, tags ni prune.
- Configuraciones avanzadas conservadas; rechazo de credenciales embebidas y solicitudes obsoletas.
- 13 pruebas Rust de remotos con repositorios locales y 7 pruebas de UI con IPC simulado.

No cierra los hitos MVP ni valida autenticación real con proveedores.

## 0.2.0 · Incremento de cambios locales

- Carpeta principal independiente y repositorio Git local en main.
- Vista Cambios con preparados/sin preparar, stage y unstage por archivo y bloque.
- Commit normal y primer commit, con borrador conservado ante errores.
- Habilitación de escrituras por repositorio, index temporal, locks y rechazo de huellas obsoletas.
- Pruebas Git de staging/commit y pruebas de interfaz con IPC simulado.

Este incremento cubre parte de RG-03 / M2; no cierra M0, M1 ni M2 como hitos de aceptación. Permanecen las validaciones de rendimiento, accesibilidad y plataformas.

## 0.1.0 · Prototipo de lectura

- Historial paginado, grafo de padres, referencias e inspector de diff por commit.
- Primera compilación de desarrollo macOS arm64.
