# Validación actual macOS · 27/10/2026

Base **`eb6621d` · Documenta aceptación SSH real en Windows**, versión 0.4.2 en desarrollo. macOS 27.2 arm64, Git 2.56.0, Node 26.12.1, npm 12.2.1 y Rust/Cargo 1.99.1. La ejecución comenzó con el árbol limpio.

Se usó un bundle debug aislado `RavenGit Mac Acceptance`, identificador `dev.ravengit.macaccept.20261027`, ventana 900 × 640 y configuración independiente. SHA-256 del binario: `dd4238db05dfc9f952e7126354ae7a87a926fcb8ea487260eac378d93010314f`. RavenGit normal y los repositorios del usuario no se abrieron. Las fixtures sin remotos se conservan bajo `/tmp/ravengit-mac-accept.HtC2jT`; no se enviaron a Papelera.

## Validación automatizada fresca

| Comprobación                                | Resultado                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm test`                                  | 259/259 en 28 archivos                                                                               |
| `cargo test`                                | 193 aprobadas y 1 prueba manual de agente/proveedor ignorada; 2/2 del protocolo del editor aprobadas |
| `cargo clippy --all-targets -- -D warnings` | Aprobado                                                                                             |
| `cargo fmt --check`                         | Aprobado                                                                                             |
| `npm run build`                             | TypeScript/Vite aprobado, 54 módulos                                                                 |
| Bundle debug aislado                        | Aprobado                                                                                             |

La prueba ignorada requiere un agente y destino real elegidos explícitamente; no se activó ni se extrapola la evidencia Windows a macOS.

## C.2 · aceptación nativa de teclado, errores y carga

| Caso                  | Resultado observado                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selección y teclado   | Cuatro cambios de tipos distintos; las casillas expusieron nombres AX. Seleccionar todos → Tab → Return enfocó el aviso visible y preparó exactamente los cuatro archivos. HEAD quedó en `aa7d3af6f10c6ef8cd2b9ae8f988c9234ff455ee`; no quedó `index.lock`.                                                                     |
| Revisión obsoleta     | Con dos archivos seleccionados se añadió externamente un tercer cambio antes de Return. RavenGit rechazó la escritura, enfocó el `alert`, refrescó a tres cambios y conservó seleccionados los dos originales. El índice quedó byte a byte igual, HEAD siguió en `80d2eb0f765290b8f4acfbb83d4057d67af2c427` y no apareció lock. |
| Lock ajeno            | Se creó un `index.lock` en la fixture después de seleccionar dos archivos. RavenGit rechazó la operación, enfocó el `alert`, conservó selección, índice y HEAD `1c2187b3a59a5371adad3bfafbe4ab3fb5bde101`, y no retiró el lock ajeno.                                                                                           |
| Carga de 300 archivos | La vista mostró 300 cambios y permitió seleccionar todos. Tab dejó foco visible en **Preparar seleccionados** y Return completó una sola acción: 300 rutas en el índice, cero cambios sin preparar, HEAD `ca7cd355d606a4099be0df61622a7dbe1cd157b6` y ningún lock residual. El aviso de éxito recibió foco.                     |

Capturas: [carga inicial](capturas/mac-actual-2026-10-27/c2-carga-300-inicial.png) y [300 preparados](capturas/mac-actual-2026-10-27/c2-carga-300-preparados.png).

Esto amplía la aceptación nativa de C.2 para teclado, foco, estado obsoleto, lock existente y 300 cambios. No es un benchmark, no cubre miles de archivos, filtros/hooks con fallo, quitar preparados en grupo, escalado ni lector de pantalla real. Se inspeccionó el árbol de accesibilidad nativo, pero no se activó VoiceOver ni se cambió una preferencia del sistema.

## Ajustes UX pendientes en macOS

| Ajuste                    | Resultado observado                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cerrar fijo en conflictos | En Consultar conflicto → Editar resultado se desplazó hasta el final. La cabecera y Cerrar permanecieron visibles y el botón funcionó. Para habilitar la prueba siguiente se guardó explícitamente la variante local con respaldo; el índice conservó sus tres etapas y el merge siguió pendiente. [Captura](capturas/mac-actual-2026-10-27/ux-cabecera-conflicto-fija.png).          |
| Ayuda de recuperación     | La revisión del respaldo mostró «Inicio y Fin llevan al principio y al final del contenido», sin símbolos exclusivos de Mac. Se cerró sin restaurar; HEAD e índice no cambiaron. [Captura](capturas/mac-actual-2026-10-27/ux-recuperacion-inicio-fin.png).                                                                                                                            |
| Ir a Ramas                | Durante `MERGE_HEAD`, Cambios mantuvo preparación y commit bloqueados; **Ir a Ramas** abrió **Ramas → Merge en curso**. [Captura](capturas/mac-actual-2026-10-27/ux-ir-a-ramas.png).                                                                                                                                                                                                  |
| Aviso anterior            | Se creó desde UI la rama de fixture `ux-aviso-mac-20261027` sin cambiar la rama activa. Su aviso desapareció al revisar el rebase de `feature` sobre `main` y siguió ausente en la revisión. No se confirmó ni ejecutó el rebase; HEAD quedó en `23d29a324588f281d4b0f65c251d09acbc1dfa1e` y el árbol limpio. [Captura](capturas/mac-actual-2026-10-27/ux-rebase-aviso-limpiado.png). |

La segunda inspección de las capturas confirmó legibilidad, controles utilizables y ausencia de solapes bloqueantes a 900 × 640. Se observó una deuda menor: al desplazar ambos diálogos hasta el final puede quedar una línea de contenido visible por encima de la cabecera fija; Cerrar permanece visible y accionable. No se repitieron 1440 × 920, escalado del sistema ni VoiceOver.

## Límites

La evidencia separa suites, aceptación nativa y publicación: no hay release, instalador firmado, notarización ni proveedores reales nuevos. Tampoco cierra interrupción forzada, hooks/permisos, rendimiento de 100 000 commits, accesibilidad completa, transporte real SSH en Mac ni la matriz multiplataforma. Los resultados estructurados están en [MacOS_actual_2026-10-27_resultados.json](MacOS_actual_2026-10-27_resultados.json).
