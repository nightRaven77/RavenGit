# RavenGit

Para retomar el desarrollo sin leer toda la documentación: [contexto breve](docs/CONTEXTO.md) y [mapa de módulos/pruebas](docs/MAPA.md). Las instrucciones de trabajo para agentes están en [AGENTS.md](AGENTS.md).

[Validación Windows del 26/10/2026](docs/validacion/Windows_actual_2026-10-26.md) sobre `e715539`: suites completas Rust/UI aprobadas, sin certificar aún la interacción nativa ni proveedores reales.

[Validación macOS del 27/10/2026](docs/validacion/MacOS_actual_2026-10-27.md) sobre `eb6621d`: suites actuales, C.2 por teclado con errores/carga de 300 cambios y los ajustes UX pendientes comprobados en bundle aislado a 900 × 640. VoiceOver, escalado, proveedores reales y distribución siguen abiertos.

Conflictos: **Cambios → Consultar conflicto… → Editar resultado…** permite guardar texto con respaldo, sin preparar ni continuar automáticamente. [Alcance y restricciones](docs/validacion/Editar_conflictos.md); [recorrido nativo macOS de merge textual](docs/validacion/Conflictos_macOS_2026-10-23.md) comprobado de forma acotada, sin cerrar la aceptación completa.

Después de guardar, **Revisar preparación…** muestra lo que Git llevará al índice y pide una confirmación independiente. Prepara sólo ese archivo; continuar la operación sigue siendo una acción separada. [Alcance y límites](docs/validacion/Preparar_resoluciones.md).

**Herramientas → Recuperar respaldo de conflicto…** permite comparar el archivo actual con un original guardado y restaurarlo, conservando otra copia del contenido actual. Funciona durante un merge pendiente compatible y no cambia lo preparado en el índice, HEAD ni la operación. Las copias nuevas también pueden revisarse para volver al contenido anterior. [Alcance y límites](docs/validacion/Recuperar_respaldos_conflictos.md).

Cliente Git de escritorio local-first con grafo visual e identidad Obsidian / Azure / carmesí. Licencia [MIT](LICENSE); preparación para publicar el código en GitHub una vez concluido el cierre. **Versión: 1.0.0-beta.1, candidato Windows construido e instalado localmente; no es v1 estable ni una publicación.** [Notas y límites](docs/releases/1.0.0-beta.1.md) · [Plan de cierre](docs/releases/PLAN_BETA_1.md).

[Contribuir](CONTRIBUTING.md) · [Code signing policy](docs/releases/CODE_SIGNING_POLICY.md) · [Preparar SignPath](docs/releases/SIGNPATH.md). La integración de firma está preparada para GitHub y desactivada hasta su configuración/aprobación; la beta local sigue sin firma.

MIT cubre el código propio de RavenGit; dependencias y material auxiliar de terceros conservan sus licencias. [Inventario y pendientes de avisos](docs/legal/INVENTARIO_DEPENDENCIAS.md) · [Revisión previa a publicación](docs/validacion/Revision_publicacion_2026-10-29.md).

Para preparar la beta Apple Silicon sin membresía: [compilación local o GitHub Actions](docs/releases/MACOS_BETA.md). Comando local: `npm run beta:build:macos`. En GitHub, [subir un tag beta de versión](docs/releases/TAGS_BETA.md) iniciará ambos workflows; Windows requiere SignPath configurado y aprobado. También se conserva Run workflow desde la rama predeterminada. Primera ejecución remota e instalación macOS pendientes.

Stack aprobado: Tauri 2 + React/TypeScript + Rust. Windows y macOS son los objetivos iniciales; hay compilaciones de desarrollo verificadas en macOS arm64 y Windows x64. La aceptación multiplataforma completa conserva los límites registrados en la documentación de validación.

## Estado del proyecto · 25 de octubre de 2026

Base funcional de uso personal en desarrollo, **MVP aún abierto**. Sobre `4ab47fa` ya hay rebase interactivo acotado, visor/editor de conflictos, preparación revisada y preparación múltiple, además de colecciones, inicialización/clonado, amend, tags, Stash y los flujos Git anteriores.

Validación actual sobre `eb6621d` más cambios sin commit: **264 pruebas de interfaz en 29 archivos y 196 Rust aprobadas + 1 manual ignorada**, Clippy, formato, TypeScript/Vite y bundle ARM64 aislado aprobados. Persistencia y exportación sanitizada de Actividad pasaron nativamente en macOS; el borrado efectivo y Windows siguen pendientes. [Actividad y diagnóstico](docs/validacion/Actividad_diagnostico_avisos.md), [registro macOS anterior](docs/validacion/MacOS_actual_2026-10-27.md), [preparación múltiple](docs/validacion/Preparacion_multiple.md), [rebase interactivo](docs/validacion/Rebase_interactivo.md) y los demás registros mantienen alcance y límites propios.

Recorridos nativos Mac comprobados: amend con preparado y respaldo, crear/publicar/reconsultar un tag en bare local, inicializar, clonar desde ese bare y persistir colección/fijación tras reiniciar. No equivalen a validar proveedores reales, Papelera, ventana mínima o todo Windows. Se conserva por separado la [evidencia Windows](docs/validacion/Windows_actual_2026-10-22.md).

Amend explícito está en **Cambios → Reemplazar último commit…**, con revisión/confirmación separadas, autor conservado y respaldo. El éxito nativo Mac está verificado; sus errores nativos y aceptación completa continúan pendientes.

Tags ligeros locales implementados en desarrollo desde **Herramientas → Crear etiqueta…** o **Etiquetar commit…** en el inspector, sin sobrescritura ni publicación automática. [Alcance y evidencia](docs/validacion/Tags_ligeros.md).

Publicación explícita desde **Herramientas → Publicar etiqueta…** o **Publicar esta etiqueta…** después de crearla: una sola etiqueta ligera, remoto/URL/hash revisados, sin sobrescritura ni creación de release. [Alcance y evidencia](docs/validacion/Publicar_tags.md).

Pendientes principales del MVP: aceptación completa de inicialización/clonado/amend/tags/stash/rebase interactivo y conflictos, autenticación/recuperación críticas por host/cuenta, aceptación nativa del registro/diagnóstico, colecciones, accesibilidad, rendimiento y plataformas.

Consulta el [roadmap y matriz RG/AC](ROADMAP.md) y el [índice de evidencias](docs/validacion/README.md). D incorpora un primer flujo de stash recuperable; el editor textual de conflictos y el rebase interactivo acotado están implementados en desarrollo. C.2 añade **Preparar todos/seleccionados** sin crear commits automáticamente. Las puertas de validación de cada área permanecen abiertas donde lo indica su registro. No hay fechas comprometidas.

La [revisión inicial de viabilidad Windows](docs/validacion/Windows_viabilidad.md) conserva el diagnóstico de partida. La [estabilización Windows](docs/validacion/Windows_estabilizacion.md) registra el cierre de procesos auxiliares, fixtures portables y la evidencia posterior.

## Actividad, diagnóstico y avisos

Las operaciones Git principales muestran progreso y resultado en una zona general
que conserva el contexto original al cambiar de vista. Si falla el refresco después
de una operación confirmada, conserva el éxito y añade la advertencia; no repite la
acción. Cada aviso se puede cerrar y permanece durante la sesión hasta hacerlo.

**Herramientas → Actividad y diagnóstico…** conserva hasta 500 resultados finales
con fecha, operación, estado y nombre de carpeta. No guarda rutas, URLs, ramas,
mensajes, diffs, salida Git ni credenciales. La exportación sustituye los nombres
por identificadores neutros; el borrado exige consentimiento y no toca repositorios
ni respaldos. [Alcance, seguridad y pruebas](docs/validacion/Actividad_diagnostico_avisos.md);
el [primer incremento de Push](docs/validacion/Avisos_operaciones.md) mantiene su
evidencia histórica.

## Stash recuperable

El botón **Stash** de la barra permite guardar cambios preparados y sin preparar,
con descripción e inclusión opcional de archivos sin seguimiento. La revisión
muestra los archivos que se retirarán del árbol. Los ignorados se conservan.

Para restaurar, selecciona una entrada, revisa su diff y confirma. Puedes recuperar
también la preparación del index. La entrada original se conserva y se mantiene
un respaldo en `refs/ravengit/stash/<hash>`; no hay `pop`, borrado ni `clear` implícito.
Se requiere una rama local con commit, repositorio completo/simple y árbol limpio
para restaurar, incluidos archivos nuevos e ignorados.

Si Git falla o la aplicación se interrumpe, vuelve a abrir **Stash** para revisar
el registro persistente. Los conflictos se editan y preparan externamente desde Git;
tras actualizar, confirma **Finalizar revisión**. Esta acción conserva los archivos y
el index actuales: no hace commit, no restaura una versión anterior ni repite Stash.
No hay aborto automático. [Alcance, pruebas y límites](docs/validacion/Stash_recuperable.md).

## Comenzar

Requisitos: Git en PATH, Node/npm, Rust/Cargo estable y las herramientas de compilación del sistema. En macOS, Command Line Tools de Apple.

```sh
npm ci
npm run tauri dev
```

En la carpeta original del proyecto las dependencias ya están instaladas, por lo que basta `npm run tauri dev`. En una terminal que no detecte Cargo, carga el entorno de Rust o abre una terminal nueva.

`npm run dev` sirve únicamente el frontend: el navegador no ejecuta operaciones Git. La aplicación funcional se inicia con Tauri.

## Barra de comandos

La barra superior mantiene visibles el repositorio y la rama actual. Abrir, Actualizar, Fetch, Pull, Push, Rama, Stash y Buscar están conectados a los flujos existentes. Cambios, Historial y Sincronizar forman la navegación principal. Fetch abre Remotos y Fetch para elegir destino y confirmar; Pull abre la revisión del upstream para confirmar Fetch y después el merge; Push abre Publicar para revisar antes del envío. Rama abre la gestión de ramas locales. Actualizar relee información local conservando el filtro del historial; Buscar enfoca la búsqueda en los commits cargados. La barra no inicia conexiones por sí sola.

Stash abre el flujo de guardado/restauración con revisión. Clonar está en el lateral; Deshacer/Rehacer, Pop y Terminal siguen pendientes y no ocupan botones en la barra. Durante una operación Git se bloquean los comandos. En ventanas estrechas la tira permite desplazamiento horizontal y conserva acceso por teclado.

## Funciones disponibles

- **Repositorios** en el lateral: recientes/fijados, búsqueda, reapertura, relocalización y colecciones con nombre/orden. Quitar una colección conserva sus entradas en Sin colección; quitar de la lista no borra archivos. La migración conserva el archivo anterior. [Alcance y validación](docs/validacion/Colecciones_locales.md).
- **Nuevo repositorio…** en el lateral: elegir carpeta contenedora, nombre nuevo y rama inicial; confirmar para crear y abrir un repositorio vacío. No sobrescribe destinos ni inicializa dentro de otro repositorio. [Alcance y validación](docs/validacion/Inicializar_repositorio.md).
- **Clonar repositorio…** en el lateral: HTTPS, SSH o ruta local absoluta hacia una carpeta nueva, sin sobrescribir destinos; usa credenciales Git/sistema y recuerda la copia en la biblioteca. Sin submódulos ni descarga automática LFS. [Alcance y validación](docs/validacion/Clonar_repositorio.md).
- Preferencias del historial por repositorio: columnas, inspector, filtro, búsqueda y selección dentro de la primera página. El pie indica cuándo se guardaron; esperar esa indicación antes de cerrar conserva el último ajuste. [Alcance del espacio local](docs/producto/06_Espacio_local.md).

- Abrir repositorios locales con árbol de trabajo, incluidos subdirectorios.
- Historial real de todas las refs y HEAD, o de la ascendencia de HEAD/una rama local o remota concreta, en orden topológico y páginas de 200 commits. El filtro sólo lee referencias locales, no cambia de rama ni hace fetch. Las páginas se vinculan a la referencia elegida y al estado del repositorio.
- Filas virtualizadas, grafo con todos los padres, avatares locales por iniciales, columnas configurables e inspector plegable. Accesos a HEAD, padres y commits adyacentes en la lista; los saltos a padres fuera de lo cargado lo indican explícitamente.
- Ramas locales/remotas, etiquetas, HEAD separado, inspección de commits y diff contra el padre elegido, incluidos merges.
- Búsqueda por hash, mensaje o autor dentro de lo cargado, con alcance visible.
- Vista **Cambios**: preparados / sin preparar, diff por archivo, stage y unstage completos, además de casillas para **Preparar seleccionados** o **Preparar todos** en una sola transacción revisada. [Alcance y evidencia](docs/validacion/Preparacion_multiple.md).
- Selector **Unificado / Dividido** en el diff del commit y en Cambios. La vista dividida muestra Antes/Después con números de línea para parches de texto compatibles; preparar/quitar bloques mantiene sus validaciones existentes. [Alcance y evidencia](docs/validacion/Diff_dividido.md).
- Stage y unstage por bloque en modificaciones de texto compatibles. Los bloques se regeneran en Rust; la UI no envía parches ejecutables.
- Commit normal y primer commit, con resumen, descripción y autor configurado en Git. El borrador se conserva al fallar y al alternar entre Historial y Cambios en la misma apertura.
- Autorización explícita recordada por repositorio en este equipo. No se modifican configuraciones de Git al concederla; se puede revocar desde Cambios.

Las refs remotas son las almacenadas localmente; se actualizan cuando ejecutas explícitamente Fetch en Remotos. Seleccionar una rama en el lateral sólo localiza el commit, sin checkout.

## Ramas locales

**Revisar merge** compara una rama local de origen con la rama activa de destino, muestra sus hashes y hasta 100 commits entrantes, e identifica integración al día, fast-forward o divergencia. Revisar no modifica archivos, índice ni referencias, no contacta remotos y no predice conflictos. **Confirmar merge** vuelve a validar el estado y los hashes: fast-forward avanza directamente; un merge divergente usa `ort` y se detiene antes del commit para revisar sus cambios.

Si hay un merge pendiente, **Ramas** lo recupera desde Git incluso después de reiniciar. Edita y guarda externamente o usa el [editor acotado de Cambios](docs/validacion/Editar_conflictos.md) para texto regular de tres etapas de hasta 512 KiB. Después pulsa **Actualizar merge** y **Marcar resuelto** por archivo. Puedes inspeccionar los diffs en **Cambios** y después **Continuar merge** con un mensaje, o **Abortar merge** confirmando que las resoluciones pueden perderse. No hay combinación ni continuación automática. El flujo de preparación de merge admite texto UTF-8 de hasta 2 MiB y eliminaciones; binarios, enlaces y casos avanzados se resuelven/preparan desde Git. Véase [ejecución y recuperación de merge](docs/validacion/Merge_ejecucion.md).

Desde **Rama** en la barra o **Ramas** en el lateral puedes crear una rama desde HEAD sin cambiar la rama activa, cambiar a una rama local existente y renombrar una rama local. Cada fila incluye **Cambiar** para activar esa rama en un clic y **Renombrar** para editar su nombre sin cambiar de rama. La rama activa permanece resaltada y el hash de cada destino es visible. No configura seguimiento ni publica automáticamente; renombrar conserva el comportamiento normal de Git sobre configuración y reflog de esa rama.

Este incremento requiere autorización y un árbol limpio, incluidos los archivos sin seguimiento, para las tres operaciones. Bloquea conflictos, operaciones Git activas, worktrees enlazados, submódulos, sparse checkout, split index y marcas assume-unchanged/skip-worktree que pueden ocultar modificaciones. HEAD separado puede conservarse creando una rama; antes de abandonarlo se exige que algún historial de rama local contenga ese commit. No se fuerzan cambios ni se descartan archivos; un archivo ignorado que el destino sobrescribiría bloquea el cambio.

Rust vuelve a comprobar la huella de cambios, ramas y worktrees antes de ejecutar, serializa las escrituras e invalida revisiones de push anteriores. Git mantiene sus locks y hooks. Si un hook posterior falla pero el cambio queda confirmado, se informa éxito con advertencia. Un resultado incierto exige actualizar y comprobar antes de repetir. No hay aislamiento completo frente a otros procesos ni rollback de los efectos de hooks. La [evidencia del incremento de ramas](docs/validacion/Ramas_locales.md) registra pruebas y límites por plataforma.

## Cherry-pick y revert

En el inspector del commit, **Cherry-pick** aplica sus cambios sobre la rama activa y **Revertir commit** crea un nuevo commit con el cambio inverso, sin borrar historial. **Operaciones de commit** en el lateral permite introducir un hash completo o recuperar una operación pendiente al reabrir RavenGit.

Se revisan el commit, la rama, HEAD y el diff antes de confirmar. La ejecución consume una revisión guardada en Rust, revalida estado/configuración y conserva un respaldo en `refs/ravengit/replay/…`. Se admite un commit sin merges por operación, con repositorio completo/simple, autor configurado, árbol limpio y archivos ignorados apartados. No hay publicación automática.

Los conflictos se editan fuera de RavenGit, se actualizan y preparan por archivo en el diálogo; después se puede continuar o abortar, incluso tras reiniciar. Un resultado vacío no se omite automáticamente. Los registros sin operación activa pueden retirarse tras revisar un estado verificable y limpio; los casos inciertos requieren Git. [Alcance y evidencia](docs/validacion/Cherry_pick_revert.md).

## Rebase: revisión previa local

En **Ramas**, **Revisar rebase** junto a otra rama analiza cómo se relaciona la rama activa con esa base. Muestra ambos hashes, hasta 100 commits exclusivos de la activa y presencia de merges. Distingue base ya contenida, avance sin reproducir commits y divergencia. Los candidatos son una comparación de ascendencia, no una simulación de parches ni una garantía sobre conflictos o commits que Git conservaría. No verifica si están publicados.

La revisión sólo lee información local. **Confirmar rebase** consume una revisión guardada en Rust y admite rangos lineales, con aceptación explícita de la posible reescritura. Conserva el commit original bajo `refs/ravengit/rebase/…`. Si se detiene, Ramas ofrece preparar resoluciones de texto, continuar y abortar, incluso tras reiniciar. No publica automáticamente ni habilita force push. Consulta [ejecución y recuperación de rebase](docs/validacion/Rebase_ejecucion.md) y la [primera revisión](docs/validacion/Rebase_revision.md).

Requiere repositorio completo/simple y limpio; el inicio también bloquea archivos ignorados para evitar sobrescribirlos al cambiar de base. No admite rangos con merges, autostash ni rebase iniciado desde otras herramientas. **Editar plan interactivo…** añade ordenar/pick/reword/squash/fixup/drop en rangos completos de 1–50 commits lineales, con revisión, mensajes finales y consentimiento independientes; [alcance y evidencia](docs/validacion/Rebase_interactivo.md). Los commits inicialmente vacíos se conservan; los que se vuelven vacíos detienen la operación para revisión desde Git o aborto. RG-05 y AC-05 conservan pendientes de aceptación nativa y multiplataforma.

Se validaron en el bundle nativo de macOS ARM64 los flujos lineal, conflicto/resolución/continuación, cierre normal y reapertura, y aborto. El detalle y sus límites están en [validación macOS de rebase](docs/validacion/Rebase_macOS.md). Si Git rechaza el inicio y la rama original sigue intacta, Ramas permite revisar y retirar sólo el registro de RavenGit; conserva el respaldo. Otros estados inciertos se inspeccionan desde Git.

## Remotos y acceso de lectura

La vista **Remotos** permite añadir, editar y quitar destinos Git locales; distingue URL de descarga y URL de publicación opcional. No presupone que exista `origin`: puedes usar `origin` para tu Gitea y `upstream` para GitHub, o varios destinos del mismo proveedor. Una cuenta de proveedor será una integración independiente; esta fase no implementa OAuth ni APIs.

- **Guardar** sólo cambia configuración local. **Comprobar acceso** ejecuta una consulta de lectura; no verifica permiso de publicación. **Fetch** requiere confirmación del destino y actualiza referencias remotas de ramas, sin merge ni push.
- Quitar un remoto elimina su configuración, referencias de seguimiento y asociación upstream; conserva ramas locales, archivos y servidor. Hay confirmación previa.
- HTTPS sin credenciales embebidas, SSH y rutas locales absolutas. Usa credenciales configuradas en Git o un agente SSH; no se almacenan tokens en RavenGit ni se aceptan contraseñas en URLs. El acceso es no interactivo: prepara las credenciales y la confianza del host desde Git. No se desactiva TLS ni se aceptan hosts SSH desconocidos automáticamente.
- SSH respeta `GIT_SSH_COMMAND`, `core.sshCommand` y `GIT_SSH`, en ese orden. Se admite un ejecutable OpenSSH literal, también con espacios y comillas; opciones como IdentityFile se configuran en `~/.ssh/config`. Scripts, argumentos embebidos y variantes plink se rechazan explícitamente en conexiones SSH, sin afectar Fetch local/HTTPS. Sin selección explícita, Windows prefiere OpenSSH del sistema si está instalado y no hay `SSH_AUTH_SOCK`; en los demás casos usa `ssh` del entorno. No instala ni activa agentes ni cambia claves.
- Los fallos reconocibles distinguen autenticación SSH, confianza del host, DNS, conexión, credenciales HTTPS y TLS mediante mensajes fijos. No se muestra ni persiste stderr bruto, URLs secretas o salida de helpers. [Diagnóstico y corrección SSH Windows](docs/validacion/SSH_Windows.md).
- Varias URLs, mirrors, refspecs especiales y configuración heredada no se sobrescriben desde la interfaz. Configuraciones heredadas estándar pueden permitir consulta/fetch conservando bloqueada su edición.
- Fetch de un único remoto, ramas solamente, sin tags, prune, submódulos ni escritura de FETCH_HEAD. El momento del último fetch confirmado se conserva sólo durante esta apertura; no significa sincronización continua.
- Las operaciones de configuración pueden involucrar varios comandos Git. Un fallo intermedio puede dejar un cambio parcial: actualiza y revisa antes de repetir. La huella de configuración/referencias detecta cambios previos, pero no ofrece aislamiento completo frente a otros procesos Git.

No se realiza contacto de red al listar remotos. Una conexión explícita ejecuta Git y puede invocar los helpers configurados; autoriza sólo repositorios de confianza. Límite de ejecución: 60 segundos por conexión. Sin reintentos automáticos.

## Publicación normal

La vista **Publicar** permite elegir un remoto, una rama local y una rama del servidor. Abrirla sólo lee configuración local. **Revisar push** consulta la URL efectiva de publicación y, si faltan objetos para comparar, descarga el historial necesario sin cambiar ramas, archivos, índice ni FETCH_HEAD. Distingue rama nueva, al día, adelantada, atrasada o divergente; muestra el total de commits locales ausentes en el destino y hasta 200 mensajes.

**Confirmar publicación** consume una revisión guardada en Rust. Se publica el hash revisado mediante un único refspec completo y push normal, sin force, mirror, etiquetas ni recursión de submódulos. Se vuelven a comprobar configuración, refs, rama y tip remoto antes de enviar. Las ramas atrasadas o divergentes quedan bloqueadas. Cambiar cualquier campo invalida la revisión en la UI; un error exige revisar de nuevo. No hay reintentos automáticos.

La opción explícita **Establecer seguimiento** sólo está disponible cuando las URLs efectivas de descarga y publicación coinciden. Tras confirmar el commit en el servidor se actualiza el seguimiento local; si ese paso falla, se muestra una advertencia separada del éxito del push. La configuración del seguimiento puede quedar parcial y debe revisarse desde Git, sin repetir la publicación para corregirla.

Los hooks locales y del servidor y la firma de push configurada en Git siguen aplicándose. El acceso de lectura no demuestra permisos de publicación. Un timeout o una caída de conexión puede dejar resultado incierto: consulta el destino antes de repetir. El servidor mantiene su comprobación de avance directo; las comprobaciones de RavenGit no son un bloqueo remoto ni una transacción con otros procesos.

Esta fase bloquea publicación desde clones shallow/parciales y remotos avanzados, heredados, con varias URLs o con reglas `insteadOf`/`pushInsteadOf`. No publica cambios sin commit ni implementa force push, borrado de ramas remotas, OAuth o gestión de credenciales propia. Se validó con servidores bare locales; HTTPS/SSH con proveedores reales sigue pendiente.

## Pull seguro con upstream explícito

**Pull** en la barra o el lateral muestra la rama activa, su único upstream configurado y la URL efectiva de Fetch. Abrir la vista sólo hace lecturas locales: no elige `origin`, no crea seguimiento ni inicia conexiones. Si falta upstream, hay cambios locales u operaciones activas, se bloquea el flujo con una explicación.

**Confirmar Fetch y revisar Pull** descarga únicamente la rama vinculada y actualiza su referencia de seguimiento; no integra, no escribe FETCH_HEAD ni modifica archivos o índice. La revisión muestra hashes, commits entrantes, fast-forward/divergencia y la fecha del Fetch. **Confirmar integración con merge** consume una revisión guardada en Rust y vuelve a comprobar configuración, referencias y estado local. Integra ese commit revisado sin reconectar al servidor: éste puede haber cambiado desde el Fetch. No se utiliza `git pull` ni se hereda silenciosamente `pull.rebase`.

Los conflictos y merges divergentes se gestionan desde **Ramas** con el flujo de resolver/continuar/abortar existente. Un Fetch fallido nunca habilita integrar una referencia antigua. Actualizar la vista, un error o una confirmación descartan la revisión visual; no hay reintentos automáticos. Se aplican las restricciones de merge y de remotos simples. [Alcance y pruebas de Pull](docs/validacion/Pull_seguro.md).

## Autorización y límites de lectura

Antes de confiar en un repositorio, Cambios sólo muestra la autorización: no ejecuta status, no inspecciona archivos y no presenta el árbol como limpio. Inspeccionar cambios puede ejecutar filtros Git configurados; se habilita explícitamente al autorizar. Los endpoints de diff local y escritura también rechazan solicitudes sin confianza, antes de adquirir locks.

La autorización se guarda en la configuración local de RavenGit, vinculada a la ruta canónica del repositorio. Se comparte entre Cambios, Remotos y Publicar y se recupera al reabrir la aplicación. Un repositorio en otra ubicación requiere autorización propia. «Revocar autorización» en Cambios elimina el permiso guardado y descarta la revisión de publicación pendiente. Una autorización persistente también confía en futuros cambios de configuración, filtros y hooks de esa ubicación: revócala si deja de ser de confianza. No almacena credenciales ni inicia conexiones; las confirmaciones de fetch, push y eliminación de remotos siguen vigentes.

Todos los procesos Git comparten un ejecutor con salida acotada y presupuesto que incluye el proceso, stdout/stderr y la entrada. Las lecturas usan `GIT_NO_LAZY_FETCH=1`: un diff con objetos ausentes falla de forma controlada, sin descargarlos implícitamente. La recuperación de objetos de clones parciales sigue requiriendo una acción explícita desde Git; el bloqueo previo de push desde clones parciales se conserva.

Los errores globales de Abrir/Actualizar permanecen visibles desde cualquier vista. Un fallo de refresco posterior a un commit/push no cambia su resultado confirmado ni causa un reintento. La navegación anuncia la vista actual, permite saltar al contenido y las ayudas flotantes se cierran con Escape.

El máximo del grafo se calcula iterativamente; la prueba de un millón de filas comprueba ese cálculo, no certifica el rendimiento de renderizado. Tailwind sólo detecta clases en `src/` e `index.html`, para que instalar skills o añadir documentos no altere el CSS de distribución.

## Escrituras locales

RavenGit serializa sus escrituras, crea un index temporal en una carpeta exclusiva y adquiere el lock del index real. Comprueba una huella de HEAD, rama, index, estado y contenido de archivos modificados antes de operar; en staging vuelve a comprobarla antes de instalar el index. Los bloques requieren además que coincida la huella del diff mostrado.

Git se ejecuta con argumentos separados, rutas literales y sin shell. El staging parcial utiliza `git apply --cached`. Quitar de preparados no descarta cambios del archivo. Los conflictos y operaciones Git en curso bloquean las escrituras ordinarias de Cambios y la gestión de ramas; el flujo específico de merge permite preparar resoluciones, continuar o abortar bajo sus propias validaciones. No se eliminan locks de otros procesos.

Los commits utilizan Git normal, con sus hooks y configuración de firma. Se requiere `user.name` y `user.email`, sin inventar ni cambiar el autor. Los filtros, hooks y firmadores son herramientas externas del usuario y pueden producir efectos propios; por eso se solicita confianza del repositorio. Si falla un hook, el index principal se conserva; sus efectos sobre otros archivos no se revierten automáticamente.

La comprobación previa no es aislamiento completo frente a otros programas: cambios directos de refs o modificaciones que ignoren los locks pueden ocurrir entre la comprobación y la ejecución de Git. Evita operaciones Git paralelas mientras se crea un commit. No se promete deshacer universal ni rollback de hooks.

## Verificación

```sh
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
```

En una máquina nueva, quitar `--offline` para descargar las dependencias Rust. La evidencia y los límites están en `docs/validacion/`.

Empaquetar para pruebas en macOS:

```sh
npm run tauri build -- --debug --bundles app
```

La compilación de desarrollo no sustituye la firma/notarización de distribución ni una prueba de instalación limpia.

## Estructura

- `src-tauri/src/process.rs`: ejecución compartida, entrada/salida acotada y deadline de procesos/auxiliares.
- `src-tauri/src/branches.rs`: lectura y mutaciones de ramas locales con validación de estado y pruebas Git.
- `src-tauri/src/merge.rs`: revisión, ejecución, preparación de resoluciones, continuación y aborto de merge local.
- `src-tauri/src/pull.rs`: upstream explícito, Fetch acotado y plan de integración con merge.
- `src-tauri/src/git.rs`: lectura Git, historial y fixtures de DAG.
- `src-tauri/src/changes.rs`: estado local, huellas, index temporal, staging, commits y pruebas de integración Git.
- `src-tauri/src/push.rs`: comparación con el destino real, planes de publicación, push normal y seguimiento.
- `src-tauri/src/remotes.rs`: configuración de destinos y ejecución acotada de conexiones Git.
- `src-tauri/src/rebase.rs` y `src-tauri/src/replay.rs`: revisión, ejecución y recuperación de rebase lineal/interactivo y cherry-pick/revert acotados; `rebase_plan.rs` valida la secuencia interactiva y el editor interno.
- `src-tauri/src/library.rs`: biblioteca y preferencias versionadas bajo configuración local, sin modificar los repositorios.
- `src/LibraryDialog.tsx`: recientes/fijados, reapertura, relocalización y quitar metadatos con confirmación.
- `src/AuthorAvatar.tsx`: iniciales y color locales por autor; no consulta cuentas de proveedores.
- `src/PushPanel.tsx`: selección de ramas, revisión de commits y confirmación de publicación.
- `src-tauri/src/lib.rs`: comandos asíncronos, repositorio activo, confianza y exclusión de escrituras.
- `src/graph.ts`: trazado del grafo y pruebas de topología.
- `src/ChangesPanel.tsx`: listas de archivos, diff por bloque y compositor de commit.
- `src/ChangesPanel.test.tsx`: pruebas de interacción con IPC simulado, sin escribir repositorios reales.
- `dev/push.html`: fixture visual de publicación con IPC simulado y operaciones Git deshabilitadas.
- `dev/changes.html`: fixture visual con IPC simulado; nunca ejecuta Git y no se incluye en el build de aplicación.
- `docs/producto/`: documentos de visión, arquitectura y UX aprobados como base de trabajo.
- `ROADMAP.md`: estado actual, brechas RG-01–12, criterios AC-01–12 y prioridades de próximos incrementos.
- `docs/validacion/README.md`: índice de evidencia histórica y puertas de validación abiertas.

## Límites actuales

Sin descarte general de archivos, checkout manual de archivos o refs remotas, borrado de ramas ni cuentas/API de proveedores. Rebase interactivo limitado a 1–50 commits lineales, sin exec/edit/autosquash/merges; aceptación completa pendiente. Amend sólo reemplaza un tip raíz/lineal con revisión explícita y respaldo; su éxito nativo Mac está comprobado, con errores y aceptación completa pendientes. Inicializar y clonar sólo usan carpetas nuevas; clonado conserva aceptación completa pendiente y no incluye submódulos/LFS automáticos. Las colecciones organizan la biblioteca local, sin sincronización ni coordinación multiinstancia. Pull sólo integra el upstream configurado mediante merge explícito; no incorpora rebase ni configuración visual de seguimiento. Merge/rebase quedan acotados a repositorios completos y simples: sin submódulos, worktrees enlazados, sparse/split index, historial reemplazado, autostash ni marcas que oculten cambios. El resto de operaciones avanzadas continúa en el roadmap; RG-05 y AC-05 no se presentan como terminados.

Los archivos nuevos, binarios, eliminados o con cambios de modo/tipo se preparan completos; la preparación parcial se limita a modificaciones de texto regulares. Submódulos, repositorios anidados, commits con HEAD separado y split index se rechazan explícitamente para escritura. No se desactiva split index automáticamente.

La salida de lectura Git se limita a 2 MiB; los archivos modificados se verifican hasta 64 MiB. Salidas o nombres que no se puedan representar como UTF-8 se rechazan. Lecturas: hasta 15 segundos por proceso; escrituras: hasta 60 segundos. Un timeout exige comprobar el estado antes de repetir. En Unix se intenta terminar el grupo de procesos de Git. En Windows, Git se inicia suspendido y sin crear una consola, se asigna a un Job Object antes de reanudarlo y se termina el árbol contenido al vencer el plazo. Cerrar el job también detiene auxiliares que sigan vivos tras una salida normal. Si no se puede preparar la contención, no se ejecuta Git sin ella. Estos controles no son una sandbox para scripts ni revierten sus efectos.

La búsqueda es sobre lo cargado y el diff aún no está virtualizado. Rendimiento con 100 000 commits, accesibilidad completa, aceptación nativa completa de Windows, Linux, firma y notarización siguen pendientes. La revisión visual en navegador no constituye validación del flujo nativo completo.

## Repositorio y licencia

La rama principal es `main`. Los remotos se configuran localmente; RavenGit no publica automáticamente. Licencia y política de contribución siguen pendientes. Ya hay icono propio RavenGit y el ICNS Mac empaquetado fue verificado; marca/distribución y presencia visual en Dock/Finder conservan su aceptación pendiente.

Documentación técnica consultada: [git-status](https://git-scm.com/docs/git-status), [git-apply](https://git-scm.com/docs/git-apply) y [git-commit](https://git-scm.com/docs/git-commit), [git-push](https://git-scm.com/docs/git-push) y [git-fetch](https://git-scm.com/docs/git-fetch).
