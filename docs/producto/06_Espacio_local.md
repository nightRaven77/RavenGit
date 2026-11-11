# RavenGit · Biblioteca y preferencias del espacio local

Actualizado: 22 de octubre de 2026. Incrementos de biblioteca y colecciones de RG-07; no representa su aceptación completa.

## Objetivo y diseño

Reabrir repositorios sin buscar repetidamente sus carpetas y recuperar la presentación del historial. La biblioteca reúne repositorios recientes y fijados sin copiar código ni modificar Git.

Se conservan Obsidian `#0b0f17`, superficie `#111925`, separador `#263141`, texto `#e6edf5`, Azure `#52b7ff` y carmesí `#ff667d`; tipografía del sistema. El grafo sigue siendo la superficie principal. Una entrada Repositorios en el lateral abre un diálogo de hasta 760 px con búsqueda, grupos Fijados/Recientes y acciones por entrada. La ubicación siempre acompaña al nombre para distinguir repositorios homónimos. Las acciones secundarias usan la misma jerarquía de botones existente; quitar requiere confirmación junto a la entrada.

```
Lateral: Repositorios ▾       Diálogo: Repositorios          Cerrar
                             Buscar nombre o ubicación
                             Fijados / Recientes
                               nombre · ubicación
                               Fijar | Localizar | Quitar
                             Abrir carpeta…
```

La biblioteca local incluye varias colecciones con nombre y orden, filtro y asignación exclusiva por repositorio; Todos los repositorios y Sin colección siguen disponibles. Gestionar colecciones permite crear/renombrar, subir/bajar y quitar con confirmación. Quitar una colección conserva sus repositorios y preferencias en Sin colección. Se admiten hasta 30 colecciones, nombres únicos de 1–80 caracteres e identidades estables. Transferir configuración entre equipos, exportar/importar, cuentas y sincronización quedan pendientes. [Detalle y evidencia](../validacion/Colecciones_locales.md).

## Comportamiento

- Cada apertura correcta recuerda la ruta canónica, nombre y fecha de apertura. Reabrir una ruta no la duplica ni borra sus preferencias. La confianza sigue siendo el permiso independiente por ubicación.
- Fijar mantiene la entrada en su grupo; las restantes se ordenan por apertura reciente dentro del filtro seleccionado. La biblioteca admite hasta 100 entradas. Si está llena, se retira la menos reciente sin fijar y sin colección; si todas están protegidas por fijación o pertenencia, se informa del límite sin eliminar ninguna.
- Quitar de la lista elimina sólo su entrada y preferencias, previa confirmación. No elimina archivos, commits, ramas ni la autorización guardada. Si se quita la entrada activa, deja de guardar preferencias hasta una nueva apertura.
- Localizar carpeta valida una carpeta elegida como repositorio Git local y actualiza la ubicación conservando sus preferencias y fijación. No mueve archivos ni demuestra por sí solo que ambas carpetas sean el mismo proyecto. La selección explícita corresponde al usuario. Si el destino ya tiene entrada, se rechaza la duplicación; el usuario puede abrir esa entrada.
- Una ubicación ausente o inaccesible conserva su entrada y ofrece Localizar carpeta. No se recorren ni contactan automáticamente todos los repositorios de la lista. Para verificarla se intenta abrir la entrada elegida.
- No se reabre un repositorio automáticamente al arrancar. Se elige desde la biblioteca.

## Preferencias por repositorio

Se guardan ancho de autor, proporción y visibilidad del inspector, fecha/hash visibles, referencia de historial, búsqueda (hasta 500 caracteres) y commit seleccionado. Se guardan tras 600 ms sin cambios y antes de abrir otro repositorio. El pie indica Guardando preferencias / Preferencias guardadas; si falla ofrece reintentar. Antes de cerrar la aplicación, esperar Preferencias guardadas evita perder un ajuste reciente todavía pendiente. No se promete guardado tras terminación forzada.

Al abrir, se consulta Git antes de restaurar el ámbito. Si la referencia desapareció o su lectura falla, se usa Todas las referencias con aviso. La selección sólo se restaura si está en los primeros 200 commits de ese ámbito; en caso contrario se informa y selecciona un commit disponible. No se descargan automáticamente páginas para recuperarla. Sin búsqueda textual, la selección restaurada se centra en el grafo al entrar al historial. No se guardan diffs ni contenido de archivos, planes de escritura ni borradores de commits en esta biblioteca.

## Persistencia y límites técnicos

Se usa `workspace/repositories-v2.json` dentro de `app_config_dir()` de Tauri. Si sólo existe v1 válido, se migra al leer y se conserva el archivo v1 intacto como copia previa, sin actualizarlo después. Un v2 existente es la única autoridad: si falla, no se vuelve silenciosamente a v1. Versión explícita, esquema tipado, límites de tamaño (512 KiB) y validación antes de escribir. Se escribe un temporal propio, se sincroniza, se cierra y se renombra sobre el archivo de configuración. Un mutex serializa las operaciones de biblioteca dentro de una instancia. No hay coordinación entre múltiples instancias simultáneas; esta aceptación corresponde a una instancia local.

Un archivo incompatible, inválido o de una versión futura se conserva sin sobrescribir. Se muestra el fallo, pero abrir repositorios manualmente sigue disponible. Errores de biblioteca no convierten una apertura Git correcta en un fallo. Las preferencias sólo se guardan para el repositorio seleccionado mediante su ID de sesión; las rutas nuevas de la biblioteca provienen de aperturas canónicas validadas por Rust.

El JSON es una elección acotada para este incremento, no una decisión definitiva sobre toda la persistencia del producto. SQLite permanece como propuesta para necesidades posteriores de cuentas y registro de operaciones; las colecciones actuales no lo requieren. Una migración futura deberá conservar los metadatos anteriores. La biblioteca no contiene credenciales, permisos Git nuevos ni tokens de proveedor; sus rutas y búsquedas son datos locales del usuario.

## Validación

Colecciones, Windows (22 de octubre): 125 pruebas de interfaz y 11 pruebas Rust del módulo de biblioteca aprobadas; revisión de fixture sintética a 900 × 640. Se conserva la aceptación nativa pendiente de esta nueva función. Las cifras y recorridos siguientes son evidencia histórica del primer incremento, no una repetición macOS de las colecciones.

- 106 pruebas de interfaz: reapertura sin selector, fijar, confirmación de quitar, relocalización tras fallo, restauración de preferencias/filtro/búsqueda, referencia desaparecida, reintento de guardado y apertura posible aunque falle la biblioteca.
- 93 pruebas Rust aprobadas: incluyen guardado/relectura, deduplicación, fijación, preferencias, ruta ausente y relocalizada, conservación de archivos, rechazo de destinos duplicados, preferencias inválidas, límite de 100 fijados y conservación de archivos dañados/futuros. Los temporales y fixtures usan contadores atómicos además del tiempo para evitar colisiones de nombres durante ejecución concurrente.
- Clippy con advertencias como errores aprobado. TypeScript/Vite y bundle macOS ARM64 generados.
- Revisión independiente macOS a 1440 × 920: biblioteca vacía → abrir fixture → Recientes → Fijados; hash visible, inspector oculto y commit Base seleccionado; esperar guardado, cerrar y relanzar; reabrir desde Fijados y comprobar restauración. El revisor restauró los valores originales del fixture. Sin mutaciones Git ni cambios en entradas ajenas.

| Heurística | Hallazgo localizado | Severidad | Mejora |
| --- | --- | --- | --- |
| Estado visible | Recientes/Fijados, Abierto y guardado reconocibles | Pasa | — |
| Correspondencia | Abrir carpeta y Fijar usan conceptos familiares | Pasa | — |
| Control | Cerrar y Desfijar disponibles; no autoabre al iniciar | Pasa | — |
| Consistencia | Biblioteca conserva el estilo del espacio local | Pasa | — |
| Prevención | Quitar de la lista distingue metadatos de archivos y pide confirmación | Pasa en recorrido final | Se quitó únicamente la entrada del fixture creado por la auditoría |
| Reconocimiento | Nombre y ubicación visibles | Pasa | — |
| Eficiencia | Selección y preferencias restauradas después de reiniciar | Pasa | — |
| Minimalismo | Biblioteca bajo demanda; diálogo inicialmente sin centrar | Corregida y verificada | Diálogo centrado en el bundle final |
| Recuperación | Localizar disponible | Pendiente visual | Ruta ausente y fallo de guardado cubiertos por pruebas automatizadas |
| Ayuda | Explica almacenamiento local sin copia/sincronización | Pasa | — |

No se declara aceptación Windows/Linux, multiinstancia, historial masivo ni ventana estrecha. Persistencia de filtro/búsqueda, errores reales de almacenamiento y relocalización están cubiertos por pruebas automatizadas; el recorrido visual de esos casos sigue pendiente. RG-07 y AC-08 no se consideran cerrados.

La comprobación del bundle final confirmó el centrado y la confirmación al quitar la entrada del fixture. Se limpió exclusivamente esa entrada creada durante la auditoría; la biblioteca volvió a cero entradas. No se eliminaron archivos ni commits.
