# Stash recuperable · Windows · 29/10/2026

Base `e0f1fc9`, conservando los cambios locales de recuperación anteriores. Fixtures temporales sin remotos ni datos personales. No se crearon commits, ramas ni publicaciones en el proyecto.

## Guardado del registro

Stash escribía directamente `.git/ravengit-stash.json`; una interrupción durante esa escritura podía dejar el nombre activo con JSON parcial. Ahora serializa antes, escribe y sincroniza un temporal exclusivo en el mismo directorio Git y publica el nombre definitivo mediante enlace físico exclusivo. Se cierra el archivo antes de publicarlo o retirar el temporal propio. No sustituye registros previos y no hay fallback que los sobrescriba.

Se mantiene el orden del módulo: al restaurar, puede existir ya la referencia de respaldo del stash antes del guardado del registro; el comando `git stash push/apply` sólo se ejecuta después de publicar éste. La retirada del temporal propio es de mejor esfuerzo. Un corte puede dejar un `.tmp` huérfano que no se interpreta como registro activo. Un sistema de archivos sin enlaces físicos rechaza el inicio; no se certifica sincronización del directorio ni tolerancia a corte eléctrico.

## Validación automatizada

- Antes del ajuste: **7 pruebas Rust de Stash y 7 del diálogo aprobadas** en Windows.
- Después: `cargo test --manifest-path src-tauri/Cargo.toml stash::tests -- --nocapture`: **9 aprobadas**, 160,58 segundos. Las dos nuevas comprueban publicación completa/exclusiva y cuatro combinaciones de fallo simulado de escritura parcial/sincronización, con/sin registro previo. HEAD, estado de archivos y lista de stashes conservados; sin registro parcial activo ni temporal propio restante.
- La regresión cubre ambas capas de preparación, archivos nuevos optativos, ignorados conservados, configuración `stash.index`, conflictos con reapertura/finalización, revisiones obsoletas y locks/operaciones incompatibles.
- Clippy estricto, Rustfmt del módulo y `git diff --check` aprobados. TypeScript/Vite y build debug Windows sin bundle con perfil independiente aprobados. El ejecutable habitual se restauró con hash exacto antes de abrir la copia.

## Aceptación nativa

Instancia «RavenGit Stash Acceptance», perfil `dev.ravengit.stashui.ufe73a209`, fixture temporal «Stash Windows ü». SHA256 `860A576341C1062DD7DC95D6A0268DF99A772FBCEC96904FC0DA53B5C6646B0E`. HEAD inicial `38db042fad6b1913f5306e676864433c7b5b9d72`.

Recorrido nativo aprobado a 1100 × 760:

- Guardar desde UI con preparado `staged`, árbol `working` en `file.txt`, archivo nuevo `nuevo ü.txt` e inclusión de nuevos seleccionada. El plan enumeró los dos archivos y excluyó `ignored.txt`. Confirmación satisfactoria, HEAD original conservado y árbol limpio salvo el ignorado, cuyo contenido quedó intacto.
- Stash creado `2eeef2800907a6d8f22a21dac69fdbf259c4fb06`: los objetos de árbol, index y tercer padre contienen respectivamente la versión de trabajo, la preparada y el archivo nuevo exactos. Referencia `refs/ravengit/stash/<hash>` y entrada conservadas; sin registro activo después del éxito.
- El ignorado se trasladó a `evidence/ignored.txt` fuera del repositorio, conservándolo intacto, para cumplir el requisito de árbol completamente limpio de la restauración.
- Restaurar desde UI con recuperación de preparación seleccionada: index `staged`, archivo `working`, Unicode nuevo sin seguimiento. HEAD, entrada y respaldo sin cambios; estado esperado `MM file.txt` y archivo nuevo, sin registro pendiente.
- Preparación externa sólo en la fixture: un segundo stash conservó estos cambios (`ae73e693c6a04672a6c311291ed8d9ffe6378885`) y un commit divergente `5dbb0da83b1add4b31142e8a05b3e1a86b07d51f` permitió probar conflicto. No se ejecutó esa preparación sobre repositorios personales ni sobre el proyecto.
- Restaurar desde UI el segundo stash sin `--index` produjo conflicto en `file.txt`. Mensaje de Git no completado/no repetir, registro persistente, respaldo confirmado y Finalizar revisión deshabilitado. Se terminó por la fuerza exclusivamente el PID de la copia aislada, identificado por ruta exacta, después de que Stash ya se hubiera detenido. Hash del registro intacto tras el corte.
- Relanzamiento, apertura de la fixture y Stash: reapareció la recuperación pendiente con el conflicto; casilla y finalización siguieron deshabilitadas. No se repitió la restauración.
- Resolución y preparación externas desde Git sólo en la fixture, como exige el alcance actual de Stash. Tras Actualizar, se habilitó la confirmación. Finalizar revisión desde UI informó que conserva archivos/index/stashes y no repite la operación.
- Verificación independiente final: HEAD divergente conservado, hashes de index y archivo resuelto iguales antes/después de finalizar, contenido Unicode intacto, dos entradas de stash en el mismo orden y ambos respaldos presentes. Registro retirado. Estado final deliberadamente `M  file.txt` y archivo nuevo sin seguimiento; **no es un árbol limpio ni un commit automático**.

El ejecutable habitual mantuvo el hash del respaldo original. Se guardaron manifiesto y traza AX en `state/stash-native.local/`; registro de conflicto e ignorado quedan en `evidence/` bajo la raíz temporal. La fixture y los dos stashes se conservan para revisión. La copia se cerró normalmente al terminar.

Preparación/manifiesto en `state/stash-native.local/`, ignorados por Git. El corte nativo ocurrió detenido por conflicto; no certifica interrupción en mitad de `push/apply` ni todas las ventanas de publicación del registro. Siguen pendientes UI de todos los errores, 900 × 640, límites grandes/binarios, lector de pantalla, validación del nuevo guardado en macOS, otros sistemas de archivos e instalación. No se añaden pop, borrado o aborto automático.

Actualización del cierre beta: posteriormente pasaron cortes automatizados controlados durante los comandos reales `stash push/apply`, con fixtures y proceso hijo propios. La regresión completa también pasó. Esto amplía la evidencia del núcleo, sin convertir el recorrido nativo anterior en una prueba UI a mitad del comando. [Recuentos y límites del candidato](Beta_1_Windows_2026-10-29.md).
