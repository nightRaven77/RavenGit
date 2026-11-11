# RavenGit · Historial visual

Fecha: 21 de octubre de 2026.

## Dirección y alcance

Dos fases implementadas: (1) jerarquía visual, columnas e inspector con los avatares locales aprobados; (2) filtros y navegación del grafo. Conserva la paleta Obsidian/Azure/carmesí, tipografía del sistema y filas continuas para seguir la topología del grafo.

El mensaje tiene prioridad sobre los metadatos. La columna Autor combina iniciales y nombre visible; Fecha aparece inicialmente y el hash se puede activar desde Vista. El grafo adapta su ancho al número de carriles existente; sus líneas y relaciones no se alteran por preferencias de presentación.

## Controles

- Vista: fecha y hash opcionales; ancho del autor entre 120 y 240 píxeles; inspector entre 30 y 60 por ciento, respetando anchos mínimos de lectura.
- Ocultar detalle / Mostrar detalle: conserva el commit seleccionado y su diff. En ventanas estrechas el inspector conserva la composición inferior existente, por lo que el ajuste horizontal sólo se aplica en ventanas amplias.
- Más detalles: hash completo, fecha completa y enlaces a padres. El selector de padre para comparar un merge permanece visible junto al diff.
- En las dos fases originales los ajustes vivían durante la sesión. El incremento posterior del [espacio local](06_Espacio_local.md) añade persistencia por repositorio con los límites allí registrados.

La cabecera acompaña el desplazamiento horizontal para mantener la relación entre columnas y filas. El scroll horizontal sigue disponible cuando la información supera el espacio de la ventana.

## Avatares locales

Erick Mejia → EM; María del Carmen López → ML; Raven → RA; sin nombre → ?. Se toma la primera letra del primer y último componente del nombre; un único componente usa hasta dos caracteres. Se normalizan espacios y Unicode; el color se deriva del nombre normalizado. Los colores y las letras se generan en memoria, sin imágenes descargadas ni acceso a servicios externos.

No constituye identificación verificada de personas: autores con el mismo nombre pueden coincidir. El contrato actual del historial no incluye correo; se muestra el nombre disponible, sin inventar correos o relaciones con cuentas. La incorporación de correo y avatares de proveedores queda para la integración de identidades.

## Validación y siguiente fase

95 pruebas de interfaz aprobadas, incluidas iniciales, normalización y estabilidad del color, plegado/restauración del inspector y opciones de columnas. TypeScript, Vite y bundle macOS ARM64 aprobados. No se declara validación Windows/Linux.

La revisión independiente nativa a 1440 × 920 recorrió inicio, apertura de fixture, selección, Vista, hash opcional, anchos de autor/inspector, Más detalles, plegado/restauración y desplazamiento horizontal. No ejecutó mutaciones Git. No detectó bloqueos ni problemas mayores. Señaló como mejora menor los valores de los controles de ancho: se añadieron unidades px/% visibles.

| Heurística | Hallazgo localizado | Severidad | Mejora |
| --- | --- | --- | --- |
| Estado visible | Selección y estado del inspector reconocibles | Pasa | — |
| Correspondencia | Iniciales con nombre y fecha abreviada | Pasa | — |
| Control | Plegado/restauración conserva selección y metadatos abiertos | Pasa | — |
| Consistencia | Encabezados acompañan el scroll horizontal | Pasa | — |
| Prevención | Opciones de presentación no ejecutan Git | Pasa en recorrido | — |
| Reconocimiento | Padres y hash accesibles en Más detalles | Pasa | — |
| Eficiencia | Anchos ajustables y expansión del historial al plegar detalle | Pasa | — |
| Minimalismo | Metadatos secundarios plegados | Pasa | — |
| Recuperación | Ajustes reversibles desde Vista | Pasa | — |
| Ayuda | Valores de ancho inicialmente sólo accesibles mediante AX | Corregida y verificada | Valores px/% visibles añadidos |

La comprobación independiente del bundle final confirmó los valores visibles 160 px / 38 % y el plegado/restauración del inspector a 1440 × 920. El límite CSS introducido para preservar espacio del historial a 901 px permanece sin validación visual.

Límites de la revisión original: ventana de 900 × 640, historiales grandes, lectores de pantalla y autores variados no fueron comprobados visualmente. Los casos de nombres y Unicode sí tienen pruebas automatizadas. La persistencia entre reinicios se añadió posteriormente en el incremento del espacio local.

## Segunda fase · Filtro y navegación

Implementado un selector de Todas las referencias, Rama actual / HEAD y ramas locales/remotas concretas. El backend resuelve referencias exactas, lee su ascendencia completa por páginas de 200 commits y conserva todos los padres para construir el grafo. No filtra filas de una página ya cargada, no cambia la rama activa y no contacta remotos. Las ramas remotas representan las referencias almacenadas localmente.

El token de generación de las páginas vincula el estado de las referencias y el filtro. Cambiar de ámbito exige empezar por la primera página; una página de otro ámbito o de un estado anterior se rechaza. Los comandos IPC existentes de actualización y paginación aceptan un ámbito opcional; omitirlo conserva el historial de todas las referencias.

Actualizar conserva el ámbito elegido. Abrir otro repositorio restablece Todas las referencias. Cambiar el filtro reinicia la búsqueda y el scroll tras una lectura correcta; si falla, mantiene los datos y el filtro anterior y muestra el error. El grafo se vuelve a calcular con la nueva secuencia topológica. La búsqueda textual sigue limitada explícitamente a los commits cargados en ese ámbito.

Ir a HEAD localiza el commit si está cargado. Si no lo está, abre el historial de HEAD y lo selecciona. El inspector permite avanzar o retroceder en el orden de la lista y navegar a cada padre. Es orden topológico, no una garantía de orden por fecha. Un padre fuera de la ventana cargada muestra el aviso existente y requiere cargar más historial; no dispara descargas implícitas ni cambia el filtro silenciosamente.

Validación: 98 pruebas de interfaz y 89 de Rust aprobadas; Clippy con advertencias tratadas como errores aprobado. Casos cubiertos: ascendencia de ramas locales/remotas divergentes, HEAD, ámbito inválido, paginación de 205 commits, rechazo de páginas de otro filtro y cambios externos; conservación de HEAD, árbol limpio y ausencia de FETCH_HEAD. Las pruebas de interfaz cubren contrato de ámbito/generación, error de cambio de filtro, búsqueda reiniciada y navegación padre/HEAD. TypeScript, Vite y bundle macOS ARM64 generados correctamente.

Revisión independiente nativa a 1440 × 920, sin mutaciones Git: Todas las referencias (5 commits) → feature (2) → padre Base → anterior en lista → Ir a HEAD (4) → búsqueda sin resultados → limpiar. La rama activa se mantuvo en main. No se detectaron bloqueos ni problemas mayores.

| Heurística | Hallazgo localizado | Severidad | Mejora |
| --- | --- | --- | --- |
| Estado visible | Alcance, conteo y lectura visibles | Pasa | — |
| Correspondencia | Selector de referencias conserva rama activa | Pasa | — |
| Control | HEAD y limpiar búsqueda recuperan contexto | Pasa | — |
| Consistencia | Grafo y detalle sincronizados | Pasa | — |
| Prevención | Controles deshabilitados durante lectura y en extremos de lista | Pasa | — |
| Reconocimiento | Padre y HEAD explícitos | Pasa | — |
| Eficiencia | Accesos directos evitan buscar filas | Pasa | — |
| Minimalismo | Una fila de alcance sin desplazar la superficie principal | Pasa | — |
| Recuperación | Búsqueda vacía ofrece limpiar | Pasa en recorrido | Fallos reales Git cubiertos sólo mediante pruebas, no provocados en UI |
| Ayuda | Flechas inicialmente sin explicación visible | Corregida y verificada | Añadida ayuda nativa que indica anterior/siguiente en orden topológico |

El bundle definitivo se relanzó para comprobar ambas ayudas nativas y el render inicial a 1440 × 920; el hallazgo menor quedó resuelto.

Límites de la revisión visual: ventana estrecha, ramas remotas, múltiples padres, paginación extensa y fallos reales de referencia/proceso no fueron recorridos. No se confunden las pruebas automatizadas de esos casos con validación visual.
