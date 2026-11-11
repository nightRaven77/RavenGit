# Aceptación nativa Windows · 26/10/2026

Base `e715539`, desarrollo 0.4.2. Recorrido mediante `@oai/sky`, ventana de 900 × 640, repositorios desechables sin remotos y perfil independiente `dev.ravengit.winaccept.ua8fa0a4e`. No se modificó código de producción ni el perfil habitual. Complementa la [validación automatizada](Windows_actual_2026-10-26.md); no suma suites históricas.

## Resultados nativos comprobados

| Área | Resultado y contraste independiente |
| --- | --- |
| C.2 | Selección por teclado de modificación y alta Unicode: exactamente dos archivos preparados. Preparar todos dejó cuatro entradas M/M/D/A y cero sin preparar; borrador conservado durante staging, HEAD intacto y sin index.lock. Después de reabrir se creó desde UI el commit `d5e32e118d473ae6ea9bc1577f891647a30bdfe0`, con exactamente esas cuatro entradas y árbol limpio. El borrador no se conservó tras cerrar la app; se introdujo un resumen nuevo para el commit. |
| D.2a–c | Base/Local/Entrante visibles; Escape y reapertura. Guardado exacto de `resuelto Windows` sin salto final, respaldo persistente y tres etapas todavía sin resolver. Preparación mediante revisión separada eliminó las etapas; otro archivo preparado y HEAD se conservaron. El merge permaneció pendiente. |
| D.2d | Restauración del original con marcadores y copia previa de la resolución. SHA-256 del índice y HEAD idénticos antes/después. Una edición externa posterior a la revisión fue rechazada sin sobrescribirla ni crear copia adicional. Tras revisar de nuevo, se recuperó la resolución y la edición externa quedó respaldada. Tres respaldos, merge pendiente. |
| D.3 · seis acciones y orden | Plan configurado/revisado/ejecutado desde UI, con confirmación del usuario para drop. Resultado: `Grupo Windows` (pasos 1–3), `Paso 6`, `Cinco Windows`; tres commits, sólo paso4.txt ausente, árbol limpio y HEAD final `b9b8c1b4befdb72f37596f637fca9a7a7d6e66c9`. Referencia de respaldo conserva el HEAD original exacto. |
| D.3 · conflicto y reapertura | Rama feature-conflict de cuatro commits sobre main divergente: inició desde plan interactivo de cuatro picks y pausó con README.txt sin resolver. Cierre normal/reapertura de la app y apertura desde biblioteca conservaron rama original/base/respaldo y controles de recuperación. Resolución textual guardada externamente, Actualizar rebase y Marcar resuelto desde UI prepararon exactamente README.txt. Continuar desde UI terminó con rama feature-conflict, cuatro commits sobre main, árbol limpio, sin rebase-merge ni registro pendiente; HEAD `3a98c034` y respaldo original `aba3f051b35d358861d17e3d6c22786780163322` conservado. |
| D.3 · aborto | Segundo plan interactivo de cuatro picks sobre main, rama feature-abort. Pausó en README.txt. Tras confirmación explícita del usuario se marcó la advertencia y se pulsó Abortar desde UI: rama feature-abort y HEAD original `aba3f051b35d358861d17e3d6c22786780163322` exactos, README con `feature nueva`, árbol limpio, respaldo conservado y sin rebase-merge/registro pendiente. |

Fixtures en `%TEMP%/ravengit-win-ui-20261026-146a0794`; manifiesto y comprobación previa a restaurar en `state/windows-acceptance.local/` (artefactos ignorados). HEAD inicial C.2 `84314178588a645f2bf544d3530fb4bf09fabac7`, conflicto `a30d4c2e72418dd5df042d9951f8f28b4d5088b4`, rebase `5515fee60e1b831c80e9b6d908550062382f81f3`.

Ejecutable aislado SHA-256 `1e044e2e91c7e4c1ae50be12ba70e17156485bc5f327038ca139e9192848d21e`. El ejecutable normal fue restaurado y su hash volvió a ser `5e59c751b46c58450e497622efd1badd2879da3c263831c8051ff60fb3836f70`.

## Observaciones y alcance restante

- El editor de conflictos permite desplazar fuera de vista su cabecera/Cerrar; Escape funciona. Mantener Cerrar accesible es deuda de UX.
- Recuperación muestra `⌘↑/⌘↓` en Windows; conviene adaptar la indicación a la plataforma.
- Un aviso de éxito de la continuación anterior permaneció visible junto al segundo «Rebase en curso» hasta cambiar de repositorio. Conviene invalidar resultados anteriores al comenzar otra operación para evitar ambigüedad.
- En Cambios, el aviso de rebase pide terminar desde Git aunque Ramas ofrece recuperación dentro de RavenGit. Conviene enlazar a Ramas y ajustar el texto.
- A 900 × 640 los paneles requieren desplazamiento; Tab/Espacio y foco sobre formularios permitieron completar los recorridos descritos. No equivale a una auditoría de accesibilidad.
- D.3: queda la matriz de conflictos por acción, varias pausas y commit vacío en UI Windows. La reapertura probada fue cierre normal, no interrupción forzada. La resolución durante rebase fue externa; el editor integrado se probó durante merge.
- Siguen pendientes reapertura de recuperación D.2d, límites/respaldos corruptos nativos, interrupción forzada, hooks/permisos/antivirus, lector de pantalla/escalado, proveedores reales, instalación/firma y rendimiento al límite.

El bloqueo inicial del controlador consta en el registro automatizado. Después fue posible seleccionar la instancia aislada; hubo pausas por actividad del usuario y minimización, resueltas al restaurar manualmente la ventana. No se atribuyen al producto.

## Ajustes posteriores de interfaz

Actualización 27/10: [comprobación visual Windows aprobada de forma acotada](UX_Windows_2026-10-27.md). La comprobación macOS sigue pendiente. Los párrafos siguientes registran la implementación previa a esa aceptación.

Las cuatro observaciones de UX anteriores se atendieron después de este recorrido: cabecera fija también en el editor de conflictos; ayuda con Inicio/Fin (se conservan los atajos existentes); acceso «Ir a Ramas» durante merge/rebase desde Cambios; limpieza del aviso de resultado anterior al revisar otro merge/rebase o iniciar la revisión/ejecución interactiva. Se conservan las precondiciones y confirmaciones. La evidencia nativa anterior corresponde al código previo: falta repetir la comprobación visual del ajuste en Windows/macOS.

Validación del ajuste: 243 pruebas UI en 26 archivos aprobadas, TypeScript/Vite y build Windows debug sin bundle aprobados; Prettier de archivos modificados con `--end-of-line auto` y `git diff --check` aprobados. Dos regresiones cubren retirada del aviso anterior y navegación a Ramas conservando staging bloqueado. El intento inicial de Vitest quedó bloqueado por EPERM de caché temporal del sandbox; al ejecutar con acceso normal se pudieron correr las pruebas. No se repitió la suite Rust: el cambio es de frontend.
