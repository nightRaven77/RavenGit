# D.2d · extremos de contenido por teclado en macOS

23/10/2026 · `4305dd1` más cambios locales D.2d · 0.4.2 en desarrollo, sin commit ni publicación.

## Cambio

En la comparación de recuperación, con un panel enfocado, **Inicio/Fin** y **⌘↑/⌘↓** desplazan ese contenido a su principio/final, conservando foco y sin desplazar el diálogo. Se ignoran combinaciones con Mayús/Alt para no interceptar selección alternativa. Ayuda breve visible asociada a ambos paneles con `aria-describedby`. Tab y Mayús+Tab mantienen su navegación normal. No cambia texto, consentimiento ni operaciones Git.

Corrige el pendiente observado en [la aceptación de límites](D2d_limites_macOS.md): antes, ⌘↓ desplazaba el diálogo y no permitía alcanzar directamente el final del panel.

## Aceptación nativa

Aplicación aislada `dev.ravengit.d2d.acceptance`, nueva copia desechable de la fixture extensa. Actual y respaldo de 512 KiB con marcadores de inicio/final; respaldo sintético de la tanda anterior. Biblioteca inicialmente vacía. Ventanas reales **900 × 640 y 1920 × 1049**.

Desde revisión, sin ratón ni scroll manual: Tab enfoca actual; ⌘↓/⌘↑ y Fin/Inicio muestran sus marcadores finales/iniciales con foco en el mismo panel. Tab pasa al respaldo; ⌘↓/⌘↑ y Fin muestran sus marcadores sin alterar el actual. Tab sale al consentimiento **desmarcado**, restauración deshabilitada. Mayús+Tab regresa al respaldo. En amplia se repiten Inicio y ⌘↓ en respaldo, Mayús+Tab al actual y Fin; ambos marcadores finales visibles. Escape cierra.

No se ejecutó restauración ni se marcó consentimiento. **6 comprobaciones independientes** confirmaron archivo, índice completo, HEAD, MERGE_HEAD, otro preparado y respaldos iguales antes/después. [Snapshots y traza](D2d_teclado_macOS_resultados.json). No se suman estas cifras a las tandas anteriores.

Entrada de prueba retirada mediante UI con Papelera desmarcada, biblioteca vacía comprobada y aplicación propia cerrada; fixture y respaldos conservados.

## Revisión independiente

Juez independiente de capturas nativas y traza, sin construir el ajuste ni controlar la UI. Aprobada en ambas ventanas, sin hallazgos nuevos.

| Heurística | Resultado |
| --- | --- |
| Estado visible | Pasa: anillo de foco inequívoco |
| Correspondencia | Pasa: teclas alcanzan los extremos esperados |
| Control | Pasa: foco conservado; Tab/Mayús+Tab permiten salir |
| Consistencia | Pasa: ambas columnas responden igual |
| Prevención | Pasa: navegación no consiente ni habilita restauración |
| Reconocimiento | Pasa: ayuda contextual visible |
| Eficiencia | Pasa en traza: extremos alcanzables sin ratón |
| Minimalismo | Pasa: ayuda y paneles sin desbordamiento |
| Recuperación | Pasa: volver al inicio no altera la otra columna |
| Ayuda | Pasa visual; asociación programática revisada en fuente |

Capturas: [actual al final](capturas/d2d-teclado-mac/actual-final.jpg), [actual al inicio](capturas/d2d-teclado-mac/actual-inicio.jpg), [respaldo al final](capturas/d2d-teclado-mac/respaldo-final.jpg), [salida a consentimiento vacío](capturas/d2d-teclado-mac/salida-paneles.jpg), [finales en amplia](capturas/d2d-teclado-mac/amplia-finales.jpg), [biblioteca vacía](capturas/d2d-teclado-mac/biblioteca-vacia.jpg).

## Pruebas y límites

**7 pruebas existentes del diálogo**, Prettier, TypeScript/Vite y bundle debug ARM64 aprobados; `git diff --check` limpio. No se modificó Rust ni se repitieron suites completas, Clippy o restauración nativa en esta tanda.

No se ejecutó Lighthouse/axe sobre el WebView nativo ni se declara conformidad WCAG. No acredita lector de pantalla, Windows, lectura integral de 512 KiB o rendimiento medido. Escape cerró en amplia dejando foco en raíz HTML tras apertura por clic: **no certifica retorno al disparador en ese caso**. La navegación de extremos queda comprobada en macOS; accesibilidad completa y D.2d siguen parciales.

## Actualización · retorno al acceso después de apertura por clic

23/10/2026 · base **808c6ca**, commit del usuario, más ajuste en `App.tsx`. Se enfoca explícitamente el botón de acceso antes de abrir el diálogo para que su limpieza existente pueda devolverle el foco también en WebKit/macOS cuando se abre con clic.

Instancia aislada y fixture desechable anterior. Cuatro recorridos nativos aprobados: en la ventana inicial configurada a **900 × 640** (captura Retina 1800 × 1280), clic → Escape y reabrir con Return → activar Cerrar con Return; en la ventana ampliada (captura 3360 × 2038), clic → Escape y clic → clic en Cerrar. En todos, AX identifica el botón de acceso como foco después de cerrar y su anillo es visible. No se solicitó revisión ni restauración. Biblioteca aislada vacía al terminar, Papelera desmarcada; archivos y respaldos conservados, instancia propia cerrada.

**32 pruebas UI** en App/ConflictRestoreDialog, Prettier, TypeScript/Vite y bundle debug ARM64 aprobados; `git diff --check` limpio. Seis invariantes independientes iguales antes/después: archivo, índice completo, HEAD, MERGE_HEAD, otro preparado y respaldos. [Resultados y snapshots](D2d_foco_macOS_resultados.json).

Juez independiente de las capturas/traza aprobó el ajuste sin hallazgos nuevos:

| Heurística | Evidencia / resultado |
| --- | --- |
| Estado | Pasa: anillo visible en acceso al volver |
| Correspondencia | Pasa: cierre devuelve al control de apertura |
| Control | Pasa: Escape y Cerrar con teclado/clic |
| Consistencia | Pasa: mismo destino en ambos tamaños |
| Prevención | Pasa según traza: sin revisión/restauración |
| Reconocimiento | Pasa: posición de interacción visible |
| Eficiencia | Pasa según traza: Return reabre desde acceso |
| Minimalismo | Pasa: sin controles adicionales |
| Recuperación | Pasa: raíz HTML anterior sustituida por acceso |
| Ayuda | Pasa en alcance: no exige explicación nueva |

Capturas: [estrecha tras Escape](capturas/d2d-foco-mac/narrow-return.jpg), [estrecha tras Cerrar por teclado](capturas/d2d-foco-mac/narrow-keyboard-close.jpg), [amplia tras Escape](capturas/d2d-foco-mac/wide-return.jpg), [amplia tras Cerrar con clic](capturas/d2d-foco-mac/wide-click-close.jpg).

Actualiza el límite histórico de retorno al disparador de la sección anterior. No acredita lector de pantalla, Windows, cambio de repositorio mientras está abierto ni todas las variantes de cierre. No se repitieron suite Rust, Clippy o restauración nativa; no cambia lógica Git.
