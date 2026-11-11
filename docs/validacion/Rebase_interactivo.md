# Rebase interactivo acotado · primer alcance

23/10/2026 · 0.4.2 en desarrollo, base `808c6ca` más cambios locales. No es una publicación ni una aceptación completa de RG-05/AC-06.

## Recorrido y límites

**Herramientas → Ramas → Revisar rebase** junto a la rama base → **Editar plan interactivo…**. También permite editar commits exclusivos cuando la rama ya contiene la base y no necesita rebase lineal.

Secuencia completa de **1 a 50 commits lineales**, de arriba hacia abajo. Subir/Bajar permite ordenar sin arrastrar. Cada commit aparece exactamente una vez y conserva su hash original como identidad de la fila:

- **pick** conserva cambios y mensaje.
- **reword** aplica los cambios con el mensaje final indicado.
- **squash** combina con el commit anterior conservado y usa el mensaje final explícito del grupo. El último squash del grupo define su mensaje.
- **fixup** combina con el anterior sin incorporar su mensaje.
- **drop** omite ese commit y sus cambios.

No se admiten squash/fixup antes de un commit conservado, eliminar todo el rango, hashes desconocidos/duplicados, listas parciales, merges ni mensajes vacíos donde se exige uno. Cada mensaje admite hasta 4096 bytes UTF-8; sin NUL, CR u otros controles salvo tabulador/salto de línea. No hay exec/edit/autosquash/rebase de merges ni comandos libres.

**Revisar plan** muestra orden, acciones, asuntos, hashes, mensajes finales, HEAD y base. Cambiar un campo o el orden invalida revisión y consentimiento. **Ejecutar plan revisado** requiere consentimiento independiente sobre la reescritura y haber comprobado por cuenta propia si el historial está compartido. La aplicación no certifica que esos commits sean privados ni publica o fuerza Push.

## Seguridad y recuperación

Confianza por ruta y bloqueo compartido de escrituras. Se reutiliza la revisión del rango de rebase y se guarda un token de ejecución de un uso; antes de escribir se comprueban de nuevo estado, rama, HEAD, base, configuración y límites. El árbol/índice deben estar limpios y se rechazan también archivos ignorados. Un plan semánticamente inválido puede corregirse y revisarse sin conservar la autorización previa; estado obsoleto exige releer Ramas.

Se conserva `refs/ravengit/rebase/...` apuntando al HEAD original y un registro persistente `ravengit-rebase.json` con la secuencia revisada. Git ejecuta `rebase --interactive` con opciones acotadas y editor interno de RavenGit, antes de iniciar Tauri. La secuencia usa sólo acciones tipadas y hashes comprobados; no interpola mensajes en comandos de shell. Los argumentos de rutas del editor se citan y el editor verifica hash del registro, archivos regulares y destino Git exacto antes de escribir. El mensaje revisado se entrega literalmente, incluido `#`, con un salto final cuando falta.

Si hay conflicto, Ramas conserva el flujo existente de preparar resolución, continuar o abortar. La secuencia pendiente/completada debe coincidir con el plan persistente: instrucciones externas o cambios de orden/acción bloquean la continuación guiada. El respaldo no se elimina al terminar o abortar. Commits recién vacíos detienen la operación; no se omiten automáticamente. No hay reintento automático ante resultado incierto.

El editor textual y la restauración D.2d siguen limitados al merge pendiente; este incremento no los habilita para rebase. Los conflictos de rebase mantienen la resolución externa y preparación/continuación acotadas de su recuperación existente.

## Validación automatizada

Suite UI: **238 pruebas en 26 archivos**. Cuatro casos nuevos con IPC simulado comprueban reordenamiento/mensajes, invalidación y consentimiento, token de ejecución/doble envío/cierre y rechazo sin reintento. Pruebas focalizadas de diálogo y Ramas: **19 aprobadas**, repetidas después de los ajustes visuales.

Suite Rust: **183 pruebas del núcleo aprobadas**. Incluye cuatro casos nuevos con fixtures Git reales: las seis acciones con árboles/mensajes/backup verificados; conflicto, reapertura del estado, continuación y aborto; confianza/estado sucio/obsolescencia e instrucciones externas; planes y rangos inválidos antes de escribir. Otro caso nuevo comprueba igualdad de la secuencia revisada frente a omisiones, reordenamiento y exec.

Dos pruebas de integración del editor ejecutable aprobadas por separado: protocolo incompleto rechazado sin GUI; registro/destino/hash, mensajes literales y enlace Unix rechazado. `cargo test --manifest-path src-tauri/Cargo.toml` construye también el ejecutable que usan las pruebas del editor; no sustituir por `--lib` en esta área.

Tras el ajuste de conservación literal de líneas `#`, se repitieron las cuatro pruebas de dominio interactivas y Clippy all-targets con `-D warnings`. Formato Rust/Prettier, TypeScript/Vite y bundle debug macOS ARM64 aprobados. Las cifras de suites completas corresponden al punto indicado; no se suman ejecuciones repetidas.

## Aceptación nativa y pendientes

Instancia aislada **RavenGit Interactive Acceptance**, `dev.ravengit.interactive.acceptance`, fixture desechable y biblioteca propia. Recorrido de tres commits: reordenar Dos antes de Uno, combinar Uno mediante squash con mensaje «Grupo Dos y Uno», reword de Tres a «Tres revisado», revisar, consentir y ejecutar. Diez comprobaciones independientes aprobaron: rama, HEAD nuevo, árbol final idéntico, base intacta, dos commits resultantes, mensajes, respaldo original, árbol limpio y ausencia de rebase/registro activo.

Este recorrido exitoso precedió al ajuste final exclusivamente visual y a la conservación literal de `#`; esta última se verificó en pruebas Git de continuación. No se afirma que todos los casos automatizados tengan aceptación nativa.

Pendientes actuales: Windows, interrupción forzada, lector de pantalla, escalado adicional, rendimiento al límite de 50 commits y matriz de errores de hooks/permisos. Los conflictos, continuación, aborto y matriz por acción nativos en Mac se actualizan en los registros posteriores. No se certifica distribución, durabilidad ante corte eléctrico ni aislamiento completo frente a procesos externos que cambien archivos después de comprobarlos. RG-05 y la fase D permanecen parciales.

## Cierre de aceptación del error visible · 24/10/2026

Base **c8101a7**, commit «Añade rebase interactivo acotado», árbol limpio al retomar. El código ya contiene el ajuste que enfoca el aviso con `role="alert"` y lo desplaza al área visible al fallar una revisión. En esta tanda no se modificó producción.

El juez independiente había encontrado un problema mayor de usabilidad: desde el botón al fondo, el error aparecía arriba fuera de vista. Se reconstruyó una instancia nueva **RavenGit Interactive Focus**, `dev.ravengit.interactive.focus`, con biblioteca propia y fixture desechable de seis commits. Configurar squash en el primero; desplazar el diálogo hasta el fondo; pulsar **Revisar plan**. El aviso «Squash y fixup necesitan un commit anterior conservado» recibió foco y quedó visible automáticamente, **sin scroll manual posterior**, en **900 × 640 y 1920 × 1049**. La repetición del mismo error en amplia también quedó visible y enfocada.

Reauditoría independiente de cuatro capturas y traza: defecto cerrado en ese recorrido, sin hallazgos nuevos.

| Comprobación del juez | Resultado                                              |
| --------------------- | ------------------------------------------------------ |
| Visibilidad           | Pasa: banner completo y legible después del envío      |
| Orientación           | Pasa: identifica squash/fixup sin antecesor conservado |
| Foco                  | AX del ejecutor confirma foco en el banner             |
| Control               | Cerrar y la primera acción permanecen accesibles       |
| Repetición            | La segunda revisión inválida muestra/enfoca el aviso   |

Capturas: [estrecha antes](capturas/rebase-interactivo-foco/narrow-before.jpg), [estrecha después](capturas/rebase-interactivo-foco/narrow-after.jpg), [amplia antes](capturas/rebase-interactivo-foco/wide-before.jpg), [amplia después](capturas/rebase-interactivo-foco/wide-after.jpg), [biblioteca vacía](capturas/rebase-interactivo-foco/library-empty.jpg).

No se ejecutó rebase, no se marcó consentimiento ni se creó respaldo nuevo en esta tanda. **Siete comprobaciones independientes** conservaron HEAD, árbol, índice completo, referencias y estado limpio, sin rebase/registro activo. Entrada retirada mediante UI con Papelera desmarcada; biblioteca nueva vacía, fixture conservada e instancia propia cerrada. [Resultados y hashes](Rebase_interactivo_foco_resultados.json).

Validación actual sobre c8101a7 más una regresión sin commit: **238 UI / 26 archivos**, **185 Rust del núcleo y 2 del protocolo del editor**, TypeScript/Vite y bundle debug ARM64 aprobados. Rustfmt, Clippy all-targets `-D warnings` y formato Prettier de la documentación aprobados. Los doctests fallaron inicialmente al buscar un artefacto de Tauri mientras se compilaba el bundle sobre el mismo target; repetidos **en serie**, aprobaron con cero casos. No se oculta esa incidencia ni se trata como fallo funcional de rebase.

Este registro completa únicamente la aceptación del error visible; no repite el recorrido exitoso anterior ni certifica Windows, lector de pantalla, conflictos/continuación/aborto nativos o rendimiento con 50 commits. Los snapshots temporales del recorrido exitoso anterior no sobrevivieron al reinicio del entorno; el registro narrativo conserva su alcance, sin inventar aquí los hashes o resultados estructurados perdidos. Las capturas y snapshots de esta tanda sí quedan conservados en el repositorio.

## Recuperación nativa posterior

[Conflicto textual, reapertura, continuación y aborto en macOS](Rebase_interactivo_recuperacion_macOS.md): plan interactivo de dos picks iniciado desde UI, mensajes completos conservados y respaldo verificado; 51 comprobaciones por fase y 10 de limpieza. Actualiza ese pendiente acotado; el encuadre completo de controles en estrecha, Windows y los demás casos siguen abiertos.

## Conflictos por acción posteriores · 25/10/2026

[Reword y squash con conflicto real en macOS](Rebase_interactivo_conflictos_acciones_macOS.md): ambos planes iniciados desde UI, resolución externa, preparación y continuación guiadas. Mensajes literales, padres, archivos, base y respaldo verificados con 47 comprobaciones Git. Se añadió una regresión Rust para conflicto durante `squash`; la suite de ese corte quedó en 185 + 2. En ese registro permanecían abiertos `fixup`/`drop` y varias pausas; el cierre posterior consta a continuación.

## Cierre de matriz por acción en macOS · 25/10/2026

[Fixup con dos pausas, drop antes de un conflicto posterior y commit recién vacío abortable](Rebase_interactivo_conflictos_restantes_macOS.md): tres planes iniciados desde UI sobre fixtures nuevas, con 53 comprobaciones independientes. Tres regresiones Rust adicionales elevan la suite actual a **188 + 2**. Junto con los registros anteriores, queda cubierta la matriz de acciones en macOS; permanecen abiertos Windows, interrupciones forzadas, hooks/permisos, accesibilidad y rendimiento al límite.

## Recuperación de inicio sin respaldo confirmado · 27/10/2026

Continuación del 28/10: [publicación completa del registro antes de iniciar Git](#guardado-del-registro-ante-interrupciones--28102026), implementada sin ejecutar pruebas por petición del usuario. No amplía la aceptación histórica descrita aquí.

Una fixture Git desechable verifica el caso en que existe el registro de RavenGit pero el ref de respaldo no: si la rama original sigue intacta y Git no informa una operación activa, la lectura presenta un inicio rechazado sin afirmar que el respaldo exista. La retirada sigue exigiendo confirmación explícita y sólo quita el registro de RavenGit; HEAD y el árbol permanecen intactos. Si el respaldo sí está presente, se conserva su verificación y se sigue mostrando.

La prueba Rust focalizada `branches::tests::rejected_rebase_start_without_backup_can_clear_record_when_branch_is_intact` aprobó (1 caso); `src/RebaseRecovery.test.tsx` aprobó sus 5 casos. Esto cubre automatización local, no aceptación nativa, Windows ni una interrupción forzada del proceso durante rebase.

La prueba `branches::tests::timed_out_rebase_hook_keeps_explicitly_recoverable_record_and_backup` bloquea `pre-rebase` en una fixture desechable hasta el timeout corto de prueba. Pasó en Unix: el inicio devolvió resultado incierto, el HEAD original y el respaldo se conservaron, y el estado se pudo leer y retirar/abortar de forma explícita. No simula matar la aplicación ni cierra Windows o la aceptación nativa.

## Guardado del registro ante interrupciones · 28/10/2026

Implementación sobre `b380c1c`, inicialmente **sin pruebas ni compilación por petición del usuario**. La validación posterior de autenticación incluyó este código en su build debug Windows y Clippy, pero no ejercitó esta nueva escritura ni interrupciones; sus pruebas siguen pendientes. Revisión estática del código y del diff; no constituye evidencia de ejecución Windows/macOS.

Antes se creaba directamente `ravengit-rebase.json` y después se escribía/sincronizaba su contenido. Una interrupción en esa ventana podía dejar un JSON incompleto con el nombre que la recuperación considera activo.

`rebase::save_record` serializa primero, crea un archivo temporal exclusivo en el mismo directorio Git, escribe todos sus bytes y ejecuta `sync_all` antes de cerrar. Sólo entonces publica el nombre definitivo mediante `hard_link`, que falla si ese nombre ya existe. No se sustituye un registro previo y no hay fallback a un reemplazo no exclusivo. Crear el respaldo e invocar rebase siguen ocurriendo después del guardado satisfactorio, con las revisiones y serialización de escrituras existentes.

Los fallos de creación, escritura, sincronización o publicación detienen el inicio antes de modificar referencias o ejecutar rebase. La retirada del temporal propio es de mejor esfuerzo: una interrupción puede dejar `ravengit-rebase-<pid>-<nonce>.tmp`; no se interpreta como registro activo ni se limpia automáticamente al abrir el repositorio. Si el nombre definitivo ya se publicó, contiene el registro completo y conserva la recuperación existente, incluido el inicio sin respaldo confirmado.

Límites: los sistemas de archivos que no permitan enlaces físicos rechazan el inicio con error explícito. No se certifican durabilidad ante corte eléctrico, sincronización del directorio, procesos externos que alteren archivos, ni recuperación después de que Git haya terminado pero antes de retirar el registro. No se cambiaron las reglas de continuar, abortar o retirar un registro.

### Validación focalizada Windows · 28/10/2026

Actualización 29/10: [hooks y fallos de registro en Windows](Recuperacion_hooks_almacenamiento_Windows_2026-10-29.md). Rechazo/timeout de hooks ya ejecutados con Git Windows; denegaciones reales de acceso compartido/borrado y errores simulados de escritura/sincronización cubiertos. Esta actualización sustituye el pendiente de tests de hook excluidos en Windows que figura en el registro histórico siguiente, sin extrapolar a UI ni fallos físicos.

Continuación: [interrupciones forzadas Windows](Interrupciones_rebase_Windows_2026-10-28.md), dos pruebas nuevas aprobadas con tres cortes del proceso propietario durante hook/conflicto y recuperación en procesos nuevos (retirar registro, continuar y abortar). Sin cierre/reapertura de ventana Tauri ni cobertura de todas las ventanas críticas.

Tras la autorización de validación, `cargo test --manifest-path src-tauri/Cargo.toml rebase::tests -- --nocapture` aprobó **5 pruebas**, incluidas cuatro regresiones nuevas. Se comprobó publicación de bytes completos y lectura del registro con nombre Unicode, retirada del temporal propio, conservación exacta de un registro previo incluso inválido, rechazo de un directorio en el destino conservando su contenido y fallo sin registro definitivo cuando falta el directorio Git. Sólo se usaron carpetas temporales generadas por las pruebas; sin red ni repositorios personales.

La regresión posterior `cargo test --manifest-path src-tauri/Cargo.toml rebase -- --nocapture` aprobó **23 pruebas del núcleo y 2 del protocolo del editor**, sin fallos (las cinco anteriores están incluidas, no se suman). Cubre rebase lineal/interactivo, respaldo, conflictos/reapertura/continuación/aborto, registro sin respaldo confirmado, rechazo de estados obsoletos y protocolo del editor. También pasó Rustfmt del archivo modificado y `git diff --check`. No se ejecutó la suite completa ni se preparó instalador.

El enlace físico funcionó en la ubicación temporal de este Windows. No se extrapola a otros volúmenes, APFS ni ubicaciones de red. Siguen pendientes fallos reales de permisos/espacio/sincronización e interrupción antes/después de publicar y crear el respaldo, además de la interrupción forzada de la aplicación. Los tests Unix de hooks rechazados y timeout siguen excluidos en Windows. Estas regresiones no certifican aceptación nativa ni durabilidad ante corte eléctrico; la fase D y v1 siguen abiertas.
