# D.2d · límites de texto y revisiones obsoletas en macOS

23/10/2026 · `4305dd1` más cambios locales D.2d y ajuste de lectura. Versión 0.4.2 en desarrollo, sin commit ni publicación.

## Alcance y aislamiento

Instancia **RavenGit D2d Acceptance**, `dev.ravengit.d2d.acceptance`, biblioteca inicialmente vacía. Nueva copia desechable de la fixture de merge anterior. Se prepararon sintéticamente un respaldo y archivo actual de **524 288 bytes cada uno**, actualizando sus hashes de metadatos para esta fixture. No se ejerció creación del respaldo mediante el editor en esta sesión. El resto del índice, HEAD y merge procede de la copia de prueba; no se operaron repositorios del usuario.

[Resultados estructurados](D2d_limites_macOS_resultados.json) incluyen ruta de fixture, snapshots, hashes y las **45 comprobaciones independientes aprobadas** de esta tanda. No se suman a las 37 ni a las 23 de registros anteriores. Las lecturas Git usan `GIT_OPTIONAL_LOCKS=0`.

## Casos nativos

| Caso | Acción y resultado |
| --- | --- |
| Índice obsoleto | Tras revisar, modificar y preparar `other.txt` externamente en la fixture. Confirmar restaura nada: exige nueva revisión y conserva archivo, índice externo, HEAD, merge, otro archivo y respaldos. |
| Operación obsoleta | Tras nueva revisión, modificar `MERGE_MSG`. Confirmar rechaza por operación cambiada y orienta conservar/revisar externamente. También conserva exactamente el mensaje externo. |
| Límite exacto | Original y actual de 512 KiB: revisión y restauración completas. Bytes instalados y copia previa exactos; índice, HEAD, merge, otro preparado y respaldos anteriores conservados. |
| Actual excedido | Archivo actual de 524 289 bytes: revisión rechazada sin escritura. |
| Respaldo excedido | Original de respaldo de 524 289 bytes: registro visible como inválido y revisión bloqueada. Sin escritura. |
| Tras ajuste visual | Repetir restauración de 512 KiB con marcadores distintivos de fin de línea: instalación y copia exactas y Git conservado. |
| Limpieza | Quitar sólo entrada nueva con Papelera desmarcada; biblioteca vacía, archivos y respaldos conservados; instancia propia cerrada. |

Las modificaciones externas se hicieron sólo en esta fixture; índice y `MERGE_MSG` se repusieron desde copias antes de pasar al caso siguiente. Las pruebas de rechazo comparan el estado posterior a la modificación externa con el estado posterior al rechazo, no contra el estado anterior a provocar el error.

## Problema visual encontrado y corregido

Una línea de casi 512 KiB, con `white-space: pre`, producía una anchura extrema; al arrastrar el desplazamiento horizontal hasta el extremo, el panel actual quedaba vacío en el render de WebKit observado. No se afirmó lectura integral a partir de ese render.

Se limita el ajuste a **la comparación de recuperación**: `white-space: pre-wrap` y `overflow-wrap: anywhere`. Envuelve líneas largas sin modificar texto, respaldo, bytes restaurados ni lógica Rust. Cada panel conserva su propio desplazamiento vertical.

Juez independiente revisó el render antes y después. Con el ajuste, ambos contenidos están contenidos en **900 × 640 y 1920 × 1049**. En estrecha se desplazó cada panel hasta mostrar juntos **FIN_LINEA_ACTUAL** y **FIN_LINEA_RESPALDO**, además de sus marcadores de fin de archivo. Cerrar, consentimiento y botón permanecen accesibles al desplazar el diálogo. Cmd+Down desplazó el diálogo, no el panel: el acceso al final sólo mediante teclado queda pendiente.

| Heurística | Resultado del revisor |
| --- | --- |
| Estado | Pasa: inicios de contenido y barras propias visibles |
| Correspondencia | Pasa: actual y respaldo separados |
| Control | Pasa: Cerrar fijo y confirmación accesible |
| Consistencia | Pasa: ajuste aplicado a ambas columnas |
| Prevención | Pasa: consentimiento desmarcado antes de restaurar |
| Reconocimiento | Pasa: marcadores finales visibles en ambas columnas estrechas |
| Eficiencia | Parcial: llegar al final exclusivamente por teclado sin confirmar |
| Minimalismo | Pasa: sin desbordamiento global en ambas ventanas |
| Errores | Pasa: operación cambiada rechazada con orientación |
| Ayuda | Pasa: efectos sobre índice/merge visibles |

La captura original del rechazo de índice fue reducida a 290 × 206 y no se usa como evidencia de legibilidad del mensaje; su resultado procede de la traza nativa del ejecutor y de snapshots independientes. Las capturas no prueban por sí mismas invariantes Git.

Capturas conservadas: [revisión envuelta](capturas/d2d-limites-mac/revision-envuelta.jpg), [ambos marcadores finales](capturas/d2d-limites-mac/marcadores-finales.jpg), [amplia](capturas/d2d-limites-mac/revision-amplia.jpg), [operación cambiada](capturas/d2d-limites-mac/operacion-cambiada.jpg), [actual excedido](capturas/d2d-limites-mac/actual-excedido.jpg), [respaldo excedido](capturas/d2d-limites-mac/respaldo-excedido.jpg), [biblioteca vacía](capturas/d2d-limites-mac/biblioteca-vacia.jpg).

## Validación y límites

Después del CSS: **7 pruebas existentes del diálogo**, Prettier, TypeScript/Vite y bundle debug ARM64 aprobados; `git diff --check` limpio. Restauración exacta y reinspección visual repetidas sobre ese bundle. No se modificó Rust ni se repitieron suites completas o Clippy.

No acredita lectura integral de los 512 KiB, benchmark de rendimiento, lector de pantalla, contraste medido, navegación hasta fin exclusivamente por teclado, permisos/antivirus, interrupción real durante escritura, Windows ni otras operaciones distintas de merge. Los dos errores obsoletos y el exceso de tamaño se ejecutaron antes del ajuste exclusivamente CSS; la restauración y el render se repitieron después. Respaldos antiguos sin HEAD histórico mantienen su limitación. D.2d y RG-06 siguen parciales.

## Actualización posterior

[Extremos por teclado en macOS](D2d_teclado_macOS.md): ajuste explícito de Inicio/Fin y ⌘↑/⌘↓, aceptación de ambas columnas con foco conservado y salida por Tab. Actualiza ese pendiente puntual; no acredita accesibilidad completa ni Windows.
