# Preparación múltiple de cambios

25/10/2026 · base **`4ab47fa` · Completa matriz de rebase interactivo en macOS** más cambios sin commit. Versión 0.4.2 en desarrollo; no es una publicación ni cierra la aceptación multiplataforma.

## Alcance implementado

La sección **Sin preparar** incorpora casillas por archivo, **Seleccionar todos**, contador, **Preparar seleccionados** y **Preparar todos**. La preparación individual por archivo o bloque permanece disponible.

Una preparación múltiple usa un único token de estado revisado y una sola transacción temporal del índice. Rust valida confianza, operación activa, conflictos, rutas literales, duplicados, tipos compatibles y vigencia de todo el estado antes de instalar el índice real una sola vez. Si una ruta o el repositorio cambian, no se instala una preparación parcial. Submódulos y repositorios anidados quedan excluidos de este alcance.

La operación sólo modifica el índice: no crea commits, no cambia HEAD y conserva el árbol de trabajo. El commit sigue siendo una acción separada. La selección se recorta al refrescar según los cambios elegibles que aún existan y se limpia al cambiar de repositorio.

## Pruebas automatizadas

- UI: **241/241** en 26 archivos. Las tres regresiones nuevas cubren selección por teclado, una sola llamada `change_files`, **Preparar todos** sin submódulos y conservación de la selección elegible ante estado obsoleto.
- Rust: **190/190** del núcleo y **2/2** del editor interno. Las dos regresiones nuevas comprueban altas, modificaciones y eliminaciones en una instalación atómica, además de selección vacía, duplicada, desconocida y obsoleta sin cambiar el índice real ni dejar `index.lock`.
- TypeScript/Vite, bundle debug ARM64 aislado, Rustfmt, Clippy all-targets con `-D warnings` y pruebas focales aprobados.

## Aceptación nativa macOS

Instancia aislada **RavenGit Multi Stage**, `dev.ravengit.multistage`, bundle debug ARM64 con SHA-256 `c54455e029a282d1880fb153bfc1682bb10b22c6a2e2b9aa39e7e6bfea94d6fd`. Ventana configurada a 900 × 640. El repositorio desechable `/tmp/ravengit-multi-stage.wYz1do` no tenía remotos y usó un autor de prueba.

El recorrido partió de cuatro cambios sin preparar: modificación de `README.md`, modificación de `app.ts`, eliminación de `eliminar.txt` y alta de `nuevo ü.txt`.

1. Se escribió primero el borrador `Prepara varios archivos` y se seleccionaron `app.ts` y `nuevo ü.txt`. **Preparar seleccionados** llevó exactamente ambos al índice; `README.md` y la eliminación siguieron sin preparar, HEAD no cambió, no quedó lock y el borrador se conservó.
2. **Preparar todos** llevó los dos cambios restantes al índice. La UI mostró cuatro preparados y cero sin preparar; HEAD y el borrador permanecieron iguales.
3. Se creó el commit desde RavenGit para verificar el resultado preparado. El nuevo commit `a4ee55ad87a6c547b7d2fa949812ddfd03f7fd57`, con padre `c4358ac93284ac7c6a1774594ce4c3ef01b41bb1`, incluyó exactamente las dos modificaciones, la eliminación y el archivo Unicode. El árbol y el índice quedaron limpios, sin remoto ni lock.

[Resultados estructurados](Preparacion_multiple_macOS_resultados.json): **34 comprobaciones de UI y Git** repartidas entre estado inicial, selección, preparación total y commit de cierre. El commit pertenece sólo a la fixture desechable; la funcionalidad de preparación no lo crea automáticamente.

Capturas: [controles iniciales](capturas/preparacion-multiple/01-sin-preparar-900x640.jpg), [selección y borrador](capturas/preparacion-multiple/02-seleccion-900x640.jpg), [selección preparada](capturas/preparacion-multiple/03-seleccion-preparada-900x640.jpg), [todos preparados](capturas/preparacion-multiple/04-todos-preparados-900x640.jpg) y [commit limpio](capturas/preparacion-multiple/05-commit-creado-900x640.jpg). Se guardaron a 1800 × 1280 por la escala Retina de una ventana lógica de 900 × 640.

La revisión visual del render confirmó controles compactos en una sola fila cuando hay ancho, separación clara entre casilla y selector de diff, estados habilitado/deshabilitado distinguibles y reflujo disponible por CSS. No fue una evaluación independiente ni una auditoría completa con lector de pantalla.

## Límites y limpieza

No se validaron Windows, lector de pantalla, escalado adicional, miles de archivos, filtros/hooks con fallo ni cambios concurrentes nativos durante la escritura. Los conflictos y operaciones Git activas siguen bloqueando las escrituras ordinarias de Cambios. No hay selección múltiple para quitar preparados en este incremento.

La fixture y su entrada de biblioteca aislada se conservaron; no se usó Papelera. La instancia aislada se cerró. RavenGit normal y los repositorios del usuario no se tocaron.
