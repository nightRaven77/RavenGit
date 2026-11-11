# RavenGit · Especificación UX e interfaz

**Estado:** especificación objetivo con seguimiento de implementación · **Versión documental:** 0.3 · **Actualizado:** 21 de octubre de 2026
**Producto:** RavenGit · **Identidad:** Obsidian / Azure / carmesí

Esta documentación conserva el alcance objetivo y las decisiones de producto. El [estado y roadmap](../../ROADMAP.md), con corte sobre el código `20c1856`, separa lo implementado de la aceptación pendiente; el [índice de validaciones](../validacion/README.md) enlaza la evidencia. «Confirmado» significa solicitado por el usuario; «propuesto» conserva una propuesta; «pendiente» es una decisión o comprobación abierta. La especificación no acredita por sí sola implementación, rendimiento ni validación con usuarios.


## 1. Objetivo y contrato de diseño
La interfaz debe responder tres preguntas: dónde estoy, qué cambió y qué ocurrirá si ejecuto esta acción. El grafo será el centro de la inspección del historial; los cambios locales tendrán una vista dedicada. Esta especificación describe el diseño objetivo. La interfaz actual y sus límites se detallan en [rediseño](04_Rediseno_interfaz.md), [historial](05_Historial_visual.md) y [espacio local](06_Espacio_local.md); las pantallas aún no implementadas conservan carácter de propuesta.

Se aplica al alcance RG-01–10 del documento 01 y a los límites de ejecución del documento 02. Las APIs de PR/MR se reservan para M4. Workspace significa colección de repositorios; worktree conserva el significado de Git.
## 1.1. Dirección visual aprobada · D-08
El usuario aprueba una experiencia visual tipo GitKraken. Se traduce en grafo protagonista, ramas y remotos a la izquierda, inspector contextual, diff coordinado con la selección y acceso visual a merge, rebase y cherry-pick. Se favorece una experiencia de escritorio densa y legible, con paneles redimensionables y continuidad del contexto.

Esta dirección queda aprobada; la distribución exacta, microinteracciones, iconografía y contraste se validarán mediante prototipos. RavenGit conserva su nombre y la identidad Obsidian/Azure/carmesí. La referencia no supone paridad funcional completa ni aprueba detalles de interfaz que aún no se han presentado.
## 2. Identidad RavenGit
Obsidian transmite profundidad y concentración; Azure identifica navegación y selección; carmesí señala riesgo, eliminación o error con texto e icono. Los tonos exactos son tokens propuestos, no una marca previamente aprobada.

| Token | Valor propuesto | Uso |
| --- | --- | --- |
| obsidian-950 | #0B0F17 | Fondo principal oscuro. |
| obsidian-900 | #141B27 | Paneles y superficies. |
| obsidian-700 | #334155 | Separadores y límites de controles. |
| azure-400 | #52B7FF | Foco, enlaces y selección indicada también por borde. |
| crimson-400 | #FF667D | Riesgo y líneas eliminadas con signo menos. |
| text-primary | #E6EDF5 | Texto principal sobre Obsidian. |
| text-secondary | #A9B7CA | Metadatos y etiquetas. |
| success-400 | #62D6A7 | Éxito y adiciones con signo más. |

Botón primario: fondo Azure con texto Obsidian; no texto blanco pequeño sobre Azure sin comprobar contraste. Tipografía propuesta: fuente de sistema para UI, monoespaciada de sistema para hashes y código; 14 px base y 20 px de interlineado. Escala espacial 4/8/12/16/24/32; radios 6–8 px. Verificar contraste WCAG AA, modo de alto contraste y escalado al implementar; no se afirma conformidad actual.

Tema oscuro inicial. Tema claro, logotipo definitivo y tipografías de distribución pendientes. Los documentos usan fondo claro para edición e impresión y conservan los acentos Obsidian/Azure/carmesí.
## 3. Estructura de la ventana
| Zona | Contenido | Comportamiento |
| --- | --- | --- |
| Barra superior | Workspace, repositorio, rama/HEAD, estado de red y acciones fetch/pull/push. | Siempre mostrar destino remoto y rama al publicar; no asumir origin. |
| Lateral izquierda | Repositorios, Cambios, Historial, ramas, tags, remotos y stash. | Secciones plegables; selección persistida por repositorio. |
| Área central | Grafo/lista o cambios/diff según contexto. | Paneles redimensionables; vista activa claramente titulada. |
| Inspector derecho | Commit seleccionado, refs, archivos o detalles de operación. | Plegable; selección estable al paginar. |
| Franja inferior | Operación activa, resultado y acceso al registro. | Progreso real o indeterminado; no porcentaje inventado. |

Boceto estructural, sin escala:
```text
RavenGit | Workspace / Repositorio | rama | Fetch  Pull  Push
Repositorios | Historial: filtros y búsqueda | Inspector
Cambios      | carriles · mensaje · autor   | commit
Ramas        | commits y selección         | archivos
Remotos      |                             | diff / detalle
Stash        |                             |
Estado: listo / operación en curso · Ver registro
```

A 1280×800 se propone disposición de tres paneles; por debajo, colapsar inspector y lateral con accesos visibles. No imponer ancho fijo al diff. En pantallas pequeñas, abrir detalle como vista completa con volver conservando selección. Dimensiones y mínimos se validarán en M0.
## 4. Navegación y comandos
Inicio muestra workspaces recientes y Abrir / Clonar / Inicializar. No hay muro de inicio de sesión. Un repositorio abierto conduce a Cambios si hay trabajo pendiente o a Historial si está limpio; la preferencia del usuario puede fijar el destino.

Ctrl/Cmd+P abre paleta de comandos; Ctrl/Cmd+O abre repositorio; Ctrl/Cmd+F busca dentro de la vista. Son atajos propuestos y configurables, sujetos a conflictos del sistema. Tab recorre regiones, flechas navegan listas y Enter inspecciona. Escape cierra capas sin descartar cambios silenciosamente.

Acciones equivalentes en menú y paleta; ningún flujo crítico depende de arrastrar o del menú contextual. Volver/adelante restaura repositorio, vista y selección sin ejecutar Git. Cambiar repositorio no cancela ni oculta una operación activa: su indicador sigue accesible.
## 5. Grafo e historial · RG-02
Cada fila representa un commit identificado por hash completo internamente: carriles, mensaje, autor, fecha, hash corto y etiquetas de refs. HEAD y rama activa se señalan con forma, etiqueta y color. Los carriles no representan necesariamente una rama permanente; un tooltip explica su función topológica.

Orden topológico propuesto con fechas secundarias. Una arista conecta padres reales; si el padre está fuera de la ventana se dibuja continuación y «Cargar más». Historial shallow presenta límite conocido. Merge con múltiples padres conserva conexiones y lista textual de padres. Detached HEAD muestra aviso persistente y acción Crear rama.

Un clic selecciona y actualiza inspector; doble clic abre detalle, sin checkout. Seleccionar dos commits ofrece «Comparar A → B» con dirección explícita. Buscar hash fuera de la carga solicita resolución a Git y muestra el contexto o «No encontrado»; no filtra silenciosamente sólo la ventana visible.

Filtros: rama/ref, autor, texto y fecha; indicar filtros activos y alcance local/remoto. «Limpiar filtros» vuelve a la vista anterior. Las refs remotas representan el último fetch, con hora; no se presentan como estado vivo del servidor.

Menú de commit: copiar hash, crear rama/tag, cherry-pick, revert y rebase desde aquí según precondiciones. Arrastrar commits puede explorarse después; el MVP usa un plan con botones y teclado. La lista textual equivalente expone commit, padres y refs al lector de pantalla.
## 6. Cambios, diff y commit · RG-03
Vista Cambios divide «Sin preparar» y «Preparados». Seleccionar archivo abre diff del working tree contra index o del index contra HEAD, indicado encima. Comparar commits usa etiquetas explícitas A/B y no ofrece staging.

Modos unificado y dividido con números de línea, signos +/−, contexto expandible, búsqueda, ajuste de línea e ignorar espacios como preferencia de visualización. Ignorar espacios no debe alterar silenciosamente el parche preparado. El staging por bloque se calcula sobre contenido real y se deshabilita si la representación no permite un parche inequívoco.

Por bloque: Preparar / Quitar de preparados. Por archivo: equivalente y descartar con confirmación. Si el archivo cambia desde su lectura, mostrar «El archivo cambió; actualiza el diff» y conservar selección cuando sea posible. Nombres Unicode, renombrados, cambios de permisos, enlaces simbólicos y archivos eliminados tienen etiquetas propias; los enlaces no se siguen automáticamente.

Binarios: tipo, tamaño y mensaje «Vista de texto no disponible»; abrir externamente con intención explícita. Archivos grandes: límite y carga bajo demanda. Renombrados presentan origen/destino; archivos sin seguimiento muestran contenido sin confundirlo con un commit.

Compositor: resumen, descripción y autor visible. Commit habilitado con staged válido y mensaje no vacío según política inicial. Amend es un modo explícito con texto «Reescribe el último commit»; advierte si parece publicado, sin afirmar certeza sobre todos los remotos. Un fallo de hook mantiene mensaje y selección. Éxito muestra hash creado y actualiza grafo.
## 7. Operaciones avanzadas y conflictos · RG-05,06,09
Todas las mutaciones muestran repositorio, rama y objetivo. Antes de reescribir historial, previsualizar commits afectados, precondiciones y límites de recuperación. No presentar una simulación del plan como resultado garantizado.

Rebase interactivo: escoger base, ver secuencia lineal y editar pick/reword/squash/fixup/drop; cambiar orden con botones y teclado. Validar que squash/fixup tengan predecesor y que el plan siga siendo aplicable. Reword solicita mensaje; squash solicita mensaje combinado. Merges o acciones no soportadas se explican y bloquean. «Aplicar rebase» revalida HEAD/index antes de ejecutar.

Merge: elegir rama, presentar destino actual y estrategia; si hay conflictos, conducir al resolver. Cherry-pick: mostrar secuencia ordenada y destino. Revert: explicar que crea otro commit; merges requieren selección explícita del padre principal o quedan bloqueados. Stash: indicar si incluye archivos sin seguimiento; listar, inspeccionar, aplicar y eliminar por separado. Un fallo de aplicación conserva el stash; pop no se usa como atajo implícito.

Estado de desarrollo D.1 (22/10/2026): botón **Stash** en la barra, con **Guardar cambios** y **Restaurar stash** en un diálogo. La revisión enumera archivos para guardar y ofrece diff al restaurar. Inclusión de nuevos y recuperación del index son opciones explícitas. Un registro pendiente sustituye esas opciones por la recuperación; los conflictos se resuelven y preparan externamente desde Git antes de actualizar y finalizar revisión. Finalizar conserva el árbol y el index, sin commit ni deshacer. Eliminar entradas y aborto automático siguen pendientes de diseño/aceptación, sin retirar el requisito de eliminación separada. [Alcance implementado y evidencia](../validacion/Stash_recuperable.md).

Resolver conflictos: lista de archivos, base, lado local y entrante, más resultado editable. «Local» y «entrante» se acompañan de ref/hash y explicación contextual: durante rebase no se presupone que equivalen intuitivamente a «mi rama» y «su rama». Conflictos binarios o rename/delete usan elección explícita o herramienta externa, sin prometer combinación textual.

Guardar resultado no continúa la operación automáticamente. Revisar, marcar resuelto y después Continuar; detectar marcadores restantes y pedir revisión sin afirmar que su ausencia prueba corrección. Abortar explica alcance, preserva o advierte sobre ediciones posteriores y usa la operación Git correspondiente. El manual de rebase documenta continuar y abortar; no existe un deshacer universal [S6 del documento 02].
## 8. Política de riesgo y estados
| Acción / estado | Respuesta UX |
| --- | --- |
| Fetch o lectura | Indicador no bloqueante; cancelar lectura si procede. |
| Push normal | Mostrar remoto, URL sanitizada, rama destino y commits; confirmación de destino la primera vez o al cambiarlo. |
| Pull divergente | Elegir merge o rebase; sin configuración silenciosa de estrategia global. |
| Descartar cambios / eliminar stash | Mostrar elementos afectados y confirmar con verbo concreto; advertir si Git no puede recuperarlos. |
| Rebase / amend | Resumen del historial afectado, advertencia de publicación y confirmación específica. |
| Escritura activa | Deshabilitar acciones incompatibles en el repositorio; mantener inspección disponible. |
| Operación interrumpida | Banner persistente con Resolver, Continuar o Abortar según estado real. |
| Credencial inválida | Mensaje por host/cuenta; Reautenticar o cambiar perfil sin perder contexto. |
| Error ambiguo de red | «Resultado pendiente de comprobar» y Actualizar; no repetir mutación automáticamente. |

No incluir force push ni reset destructivo en los menús MVP. Si Git deja un lock, explicar el bloqueo y ofrecer reintento tras verificar el proceso, sin botón de borrado automático.
## 9. Workspaces y repositorios · RG-07

Estado actual: biblioteca persistente de recientes/fijados, preferencias y varias colecciones con nombre/orden y pertenencia. Su implementación y migración tienen pruebas automatizadas; colecciones y relocalización conservan aceptación nativa específica pendiente. Véase [espacio local](06_Espacio_local.md). Lo siguiente define el objetivo completo.

Workspace es una colección local con nombre, orden y repositorios fijados; puede mezclar proveedores y rutas. Crear, renombrar, reordenar, quitar y relocalizar son operaciones de metadata. «Quitar del workspace» nunca borra archivos. Evitar duplicados por ruta canónica conservando diferencias de worktree.

Cada entrada muestra nombre, ruta abreviada con detalle completo, rama y estado resumido calculado bajo demanda. Un repositorio inaccesible se mantiene con «Ubicación no disponible» y Relocalizar/Quitar. No escanear todo el disco por defecto.

Los Git worktrees existentes se identifican como tales; crear/eliminar worktrees pertenece a M4. El estado de operación y la identidad de working tree no se confunden al abrir dos rutas del mismo repositorio.
## 10. Cuentas y proveedores · RG-08

Estado actual: transporte Git mediante configuración y credenciales externas del sistema; no existe aún la pantalla de perfiles por cuenta/host ni OAuth/API de proveedores. Los avatares implementados son iniciales locales. Lo siguiente es diseño objetivo, no capacidad disponible.

Ajustes → Cuentas contiene perfiles por host y usuario. Agregar perfil comienza por proveedor o remoto genérico; Gitea solicita URL base y puerto si aplica. Distinguir «Acceso Git» de «Integración API»: en MVP puede existir el primero sin el segundo.

SSH ofrece estado del agente y vínculo a ayuda/configuración; HTTPS usa helper o secreto del sistema según implementación ratificada. Nunca pedir clave privada dentro de una caja de texto genérica. Mostrar sólo referencias y últimos caracteres no sensibles cuando proceda; copiar/exportar no revela tokens.

En repositorio → Remotos, mostrar nombre, URL sanitizada, fetch/push y perfil asociado. Probar conexión es una acción de red explícita y no garantiza permisos de escritura. Si hay varias cuentas del mismo host, permitir asignación por remoto y probar sin fallback silencioso a otra cuenta.

Identidad de commit se configura por repositorio o heredada de Git; indicar origen local/global. Cambiar cuenta remota no modifica nombre/email de autor. Eliminar perfil borra la referencia y el secreto administrado por RavenGit si corresponde; no borra repositorios ni credenciales externas sin explicar su propiedad.

GitHub, GitLab, Gitea y Bitbucket comparten la vista de transporte. Las capacidades futuras de API se muestran sólo cuando existan; para genéricos no se inventan PR, avatar o enlaces web. Bitbucket Cloud/Data Center y GitLab autohospedado conservan decisiones D-03.
## 11. Estados vacíos, errores y recuperación
Sin repositorios: Abrir, Clonar e Inicializar con explicación breve. Sin commits: crear primer commit, sin grafo ficticio. Sin cambios: «Árbol de trabajo limpio» y rama actual. Sin coincidencias: filtros visibles y Limpiar. Sin Git: seleccionar instalación o consultar pasos, sin descarga oculta.

Error de red muestra host, operación y reintento de lectura; error Git muestra resumen comprensible y Detalles sanitizados. No usar sólo un toast para conflictos o fallos persistentes. Tras reinicio, reconstruir operación desde Git y restaurar contexto de UI; la metadata local no prueba que una operación terminó.
## 12. Accesibilidad, evaluación y trazabilidad
Foco Azure visible con borde; error carmesí con icono y texto; adición verde con +. Objetivo propuesto WCAG AA: contraste de texto normal ≥4.5:1 y elementos gráficos esenciales ≥3:1, a verificar. Respetar tamaño de fuente del sistema, movimiento reducido y alto contraste. No animar carriles como única explicación de cambio.

| Caso de evaluación futura | Requisito / aceptación |
| --- | --- |
| Comprender ramas y padres de un merge sin depender del color. | RG-02,10 / AC-02,11. |
| Preparar un bloque y comprobar qué entrará en commit. | RG-03 / AC-03. |
| Resolver y abortar rebase después de reiniciar. | RG-05,06 / AC-05. |
| Publicar al remoto correcto con dos cuentas en el mismo host. | RG-04,08 / AC-04,09. |
| Relocalizar repositorio de workspace. | RG-07 / AC-08. |
| Detectar plan invalidado por cambio externo. | RG-09 / AC-10. |

Evaluación propuesta: recorrer primero fixtures con el mantenedor y después observar usuarios voluntarios, registrando finalización, errores, necesidad de ayuda y comprensión del destino. No hay sesiones realizadas ni resultados de usabilidad. Los umbrales de rendimiento son los del documento 01.

Pendientes UX: validar tokens y contraste renderizado, densidad del grafo, ancho mínimo, atajos por sistema, lector de pantalla elegido, terminología de rebase y detalle de confianza de repositorios. Resolver con prototipos y evidencia antes de declarar el diseño definitivo.
