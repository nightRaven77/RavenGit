# D.2d · aceptación adicional macOS

23/10/2026 · `4305dd1` más cambios locales D.2d y fechas · 0.4.2 en desarrollo. Sin commit ni publicación.

## Aislamiento y construcción

Bundle debug ARM64 generado con superposición CLI, sin modificar configuración de producción: **RavenGit D2d Acceptance**, `dev.ravengit.d2d.acceptance`. TypeScript/Vite y construcción del bundle aprobados. Ventana nativa inicial **900 × 640**, ampliada mediante zoom nativo a **1920 × 1049**, dimensiones comprobadas en las capturas. No se afirma repetición a 1440 × 920 en esta sesión.

Repositorio desechable nuevo, copiado de la fixture de aceptación anterior, con merge pendiente, `file.txt` preparado y trabajo posterior sin preparar, `other.txt` preparado y respaldos persistentes. La ubicación y hashes están en [resultados estructurados](D2d_aceptacion_macOS_resultados.json). No se abrieron repositorios del usuario ni RavenGit normal.

## Recorrido nativo

1. Perfil nuevo: consultar recuperación pide autorización antes de listar. Fechas, segundos, zona local e identificador de la selección visibles.
2. Revisar original y cambiar externamente `file.txt` en la fixture antes de confirmar: rechazo de revisión obsoleta, sin reemplazo ni reintento.
3. Crear `index.lock` de fixture: revisión rechazada con explicación; lock conservado exactamente. Tras comprobarlo se renombró ese lock de prueba, sin eliminarlo.
4. Corromper metadatos conservando el original aparte: registro visible, mensaje específico y revisión bloqueada. Metadatos originales repuestos al finalizar; muestras corruptas preservadas en la fixture.
5. Escape cierra y devuelve foco al acceso de recuperación. Return reabre; Tab/flechas/Return seleccionan copias y actualizan fecha/ID. Revisión, recorrido entre contenidos, consentimiento con Espacio y restauración con Tab/Return completados.
6. Restaurar original: bytes exactos con marcadores; índice, HEAD, MERGE_HEAD y otro preparado conservados. Copia nueva contiene exactamente el trabajo externo posterior.
7. Cerrar sólo esta aplicación con Cmd+Q y reabrirla. La biblioteca conserva la entrada; al abrirla, la copia nueva aparece con fecha y exige revisión/consentimiento nuevos. Restaurarla recupera exactamente el trabajo posterior, conservando Git y respaldos previos.
8. Retirar únicamente la entrada de este perfil mediante **Quitar de la lista**, con **Papelera desmarcada**. Biblioteca vacía comprobada. Fixture y respaldos conservados; aplicación propia cerrada. La limpieza de perfiles históricos continúa sin confirmarse.

**37 comprobaciones independientes aprobadas**, calculadas con hashes del archivo, índice completo, HEAD, MERGE_HEAD, otro preparado y originales de respaldos. Las lecturas Git usan `GIT_OPTIONAL_LOCKS=0`. Las diferencias esperadas del archivo/restauración y adición de respaldos se comprueban por su contenido, no como igualdad total. No se suman estas cifras a las 23 del recorrido anterior.

## Revisión independiente y corrección

Juez independiente sobre capturas reales y traza del ejecutor, sin controlar la UI ni construir el ajuste. Detectó un menor: un registro corrupto se etiquetaba «Guardado de resolución». Se corrigió a **Registro no válido**, reconstruyó el bundle y repitió el render corrupto en ambas ventanas. Reinspección aprobada, sin bloqueantes ni mayores.

| Heurística | Evidencia observada | Resultado |
| --- | --- | --- |
| Estado | Éxito y ubicación de copia explícitos | Pasa |
| Correspondencia | Actual/restaurar y fecha local | Pasa |
| Control | Cerrar fijo, Escape/foco y recuperación tras reapertura | Pasa en traza/capturas |
| Consistencia | Registro corrupto ya no se clasifica como guardado válido | Pasa tras corrección |
| Prevención | Revisión obsoleta/lock rechazados; consentimiento nuevo | Pasa |
| Reconocimiento | Propósito, fecha, zona e ID | Pasa |
| Eficiencia | Recorrido por teclado | Pasa según traza |
| Minimalismo | Dos columnas a 900 × 640, cabecera visible al desplazar | Pasa en fixture |
| Errores | Mensajes específicos y revisión corrupta bloqueada | Pasa |
| Ayuda | Efectos sobre archivo, índice, commit y merge junto a confirmación | Pasa |

Capturas conservadas: [estado obsoleto](capturas/d2d-aceptacion-mac/estado-obsoleto.jpg), [reapertura y scroll](capturas/d2d-aceptacion-mac/reapertura.jpg), [registro inválido corregido](capturas/d2d-aceptacion-mac/registro-invalido.jpg), [revisión amplia](capturas/d2d-aceptacion-mac/revision-amplia.jpg), [biblioteca vacía](capturas/d2d-aceptacion-mac/biblioteca-vacia.jpg).

Tras la corrección menor: **7 pruebas existentes del diálogo** y Prettier aprobados; TypeScript/Vite y bundle debug aprobados. No se modificó Rust ni se repitieron suite Rust, Clippy o suites completas UI. Las pruebas anteriores conservan sus fechas/alcance.

## Límites abiertos

No acredita Windows, lector de pantalla, contraste medido, archivos extensos, escalado del sistema, errores de permisos/antivirus, interrupción real durante escritura ni otras operaciones distintas de merge. La revisión independiente visual no prueba por sí sola los invariantes Git: éstos se registran aparte. La copia usada procede de una fixture anterior; no se repitió creación del respaldo mediante el editor en esta sesión. Respaldos antiguos sin HEAD histórico explícito mantienen su limitación.

Se amplía aceptación de macOS; **D.2d y RG-06 siguen parciales**. No hay publicación ni certificación multiplataforma.
