# Rebase interactivo · conflicto y recuperación nativa macOS

24/10/2026 · base **c8101a7**, versión 0.4.2 en desarrollo. Misma aplicación/bundle de la aceptación de foco, comprobado por SHA-256. No hay cambios de producción, commit ni publicación en esta tanda.

## Preparación y aislamiento

Perfil **RavenGit Interactive Focus**, `dev.ravengit.interactive.focus`, biblioteca propia inicialmente vacía. Fixture nueva: rama `main` con dos commits locales (archivo `archivo ü.txt` y después `posterior.txt`), divergente de `base`, que modifica la misma línea. Mensajes con cuerpo literal `#` para comprobar conservación exacta.

El plan **dos picks** se abrió, revisó, consintió y ejecutó desde la UI. Git se detuvo en el conflicto del primer commit. Se copió entonces la fixture completa pausada a otra carpeta antes de resolver: una ruta para continuar y otra para abortar. **No se inició un segundo rebase desde UI para el caso de aborto**. La ruta nueva pidió autorización propia; no heredó silenciosamente la confianza.

No se abrieron repositorios del usuario ni RavenGit normal. Las operaciones de Git/escrituras externas fueron sólo sobre fixtures desechables. Las lecturas de verificación usan `GIT_OPTIONAL_LOCKS=0`.

## Continuar tras cerrar y reabrir

1. Inicio nativo confirmado como detenido, con respaldo al HEAD original y conflicto real en el índice.
2. Cerrar únicamente la instancia de prueba con Cmd+Q, reabrirla, elegir la fixture persistida y abrir Ramas. Reconoce el mismo plan, archivo, etapas, HEAD separado y respaldo. Continuar bloqueado; Abortar bloqueado con consentimiento desmarcado.
3. Guardar externamente en la fixture el texto «Resolución revisada macOS» (escritura de archivo por herramienta, no edición en el editor integrado).
4. **Actualizar rebase → Marcar resuelto: archivo ü.txt**. Sólo entonces **Continuar rebase** se habilita.
5. Continuar nativamente: aplica el commit posterior y confirma rama/resto de operación, sin reintento automático.

Comprobaciones: dos commits nuevos, padres `base → primero → segundo`, resolución exacta, archivo posterior conservado, base intacta y respaldo original. Se compararon **bytes completos de los mensajes extraídos con `cat-file commit`**, no sólo sus asuntos: ambos conservan el cuerpo `#`, sin comentarios añadidos por la plantilla de Git. Árbol limpio, HEAD simbólico en `main` y ausencia de registro/rebase activo al terminar.

## Abortar en copia independiente

La copia todavía contiene el mismo plan y las mismas etapas en conflicto. Se abre desde otra ruta y se autoriza. En ventana amplia, **Continuar** sigue bloqueado; **Abortar** está bloqueado hasta marcar su consentimiento sobre posibles pérdidas de resoluciones.

Después de confirmar y pulsar **Abortar rebase**, se verifican rama/HEAD originales, árbol original, índice lógico igual al commit original, archivos y mensajes originales, base intacta y respaldo conservado. No quedan rebase ni registro activos; estado limpio. Este caso no incluía nuevas ediciones posteriores a la pausa que hubiera que conservar.

## Evidencia independiente

[Resultados y snapshots](Rebase_interactivo_recuperacion_macOS_resultados.json): **51 comprobaciones durante los recorridos**, distribuidas por fase (6 pausa, 7 reapertura, 6 preparado, 14 continuación, 7 copia antes de aborto y 11 aborto). Son verificaciones de estados concretos; no se suman a suites ni a tandas anteriores. **10 comprobaciones adicionales de limpieza** confirman carpetas, HEAD, árbol, respaldo y estado limpio de ambas rutas.

Ambas entradas retiradas mediante UI con **Papelera desmarcada**. Biblioteca nueva vacía comprobada; carpetas y respaldos conservados. Sólo la instancia propia se cerró. No se revisaron los perfiles históricos de validación.

Capturas: [detenido](capturas/rebase-interactivo-recuperacion/stopped.jpg), [reapertura](capturas/rebase-interactivo-recuperacion/reopened.jpg), [preparación](capturas/rebase-interactivo-recuperacion/prepared.jpg), [continuación](capturas/rebase-interactivo-recuperacion/continued.jpg), [aborto aún bloqueado](capturas/rebase-interactivo-recuperacion/abort-pending.jpg), [aborto confirmado](capturas/rebase-interactivo-recuperacion/aborted.jpg), [biblioteca vacía](capturas/rebase-interactivo-recuperacion/library-empty.jpg).

## Revisión independiente de UX

Juez independiente de capturas reales y traza AX, sin construir cambios ni controlar UI. Sin bloqueantes detectados en regiones visibles. Los invariantes Git son evidencia separada del ejecutor.

| Heurística | Resultado observado |
| --- | --- |
| Estado | Pasa: detenido/en curso y resultados explícitos |
| Correspondencia | Pasa: rama, original, base y respaldo identificados |
| Control | Pasa funcional: consentimiento de aborto y continuación después de preparar |
| Consistencia | Pasa: reapertura conserva estado e instrucciones |
| Prevención | Pasa según AX: controles bloqueados antes de sus precondiciones |
| Reconocimiento | Pasa: archivo/acción específica visibles en amplia |
| Eficiencia | Pasa en traza: actualizar, marcar y continuar ejecutados |
| Minimalismo | Parcial: información ordenada en amplia; controles inferiores fuera del encuadre estrecho |
| Recuperación | Pasa visual: continuación y aborto confirmados, con respaldo |
| Ayuda | Pasa: instrucciones de resolución externa y actualización legibles |

El inicio y la continuación funcionales se ejecutaron con ventana **900 × 640**. El aborto y sus controles se inspeccionaron a **1920 × 1049**. Las capturas estrechas no encuadran íntegramente los controles inferiores; su bloqueo/habilitación constan en AX y ejecución, **no se certifica aquí su encuadre/accesibilidad visual completa**. No se repitió la reescritura sólo para capturar esa región.

## Alcance que permanece abierto

Actualiza el pendiente de conflicto textual/reapertura normal/continuación/aborto nativos para este plan de dos picks. No certifica Windows, lector de pantalla, todos los tipos de conflicto ni conflictos con squash/fixup/reword/drop, interrupción forzada o durante escritura, cambios concurrentes, hooks/permisos ni rendimiento con 50 commits. El editor D.2 y la recuperación D.2d no se habilitan para rebase por esta prueba.

No se repitieron suites, Clippy o builds: no hubo cambios de código y se utilizó exactamente el bundle de la aceptación anterior. RG-05/AC-05 y la fase D permanecen parciales en sus matrices completas.
