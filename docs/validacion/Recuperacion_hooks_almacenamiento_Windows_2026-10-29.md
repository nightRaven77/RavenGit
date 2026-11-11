# Recuperación: hooks y fallos de registro · Windows · 29/10/2026

Base `e0f1fc9`, conservando los cambios locales anteriores de interrupciones. Ejecución sobre fixtures temporales, sin red, repositorios personales, cambios de autenticación ni publicaciones. No se llenó el disco ni se alteraron permisos del sistema.

## Cambio acotado

El guardado del registro conserva serialización, temporal exclusivo, escritura completa, `sync_all` y publicación sin sobrescritura. Se extrajo únicamente la operación privada de escritura/sincronización para permitir que las pruebas devuelvan un error en puntos concretos, sin inyección global ni opciones de fallo expuestas por IPC. Producción sigue pasando la misma escritura y sincronización reales; respaldo y Git siguen iniciándose después del guardado satisfactorio.

Los dos tests de hook anteriormente exclusivos de Unix se habilitaron también para Windows con Git real. Sólo Unix aplica el bit ejecutable. El hook de timeout usa una ruta relativa al repositorio, espera diez segundos y se limita a dos segundos; comprueba su marca de entrada antes de validar recuperación.

## Casos añadidos o ampliados

- Escritura parcial y error después de escribir todos los bytes, en el punto de sincronización: se simulan con un escritor que devuelve error. En ambos casos se retira el temporal propio, no se publica un registro incompleto y un registro previo conserva exactamente sus bytes. Cuatro combinaciones (con/sin registro previo y escritura parcial/completa) en un test.
- Denegación real de acceso compartido de Windows: se mantiene abierto el registro con `share_mode(0)`. La lectura y el intento de guardar fallan, se conserva el registro y no quedan temporales propios.
- Registro ocupado con borrado denegado por un handle de Windows: Git puede completar el aborto, pero la retirada del registro falla. RavenGit debe informar «Operación completada» y «no repitas», conservar el registro y el respaldo, y quedar con HEAD/árbol originales y estado limpio. Se cierra únicamente el handle de la fixture; una revisión nueva permite retirar el registro huérfano sin repetir el rebase.
- Hook `pre-rebase` que rechaza: HEAD y respaldo conservados, registro no activo verificable, rechazo de retirar el registro con cambios locales y retirada explícita posterior cuando vuelve al estado esperado.
- Hook `pre-rebase` que excede el tiempo: entrada confirmada, error de resultado incierto, registro y respaldo recuperables. Se relee el estado antes de abortar o retirar el registro según corresponda; HEAD original y respaldo se comprueban al terminar.

## Validación

`cargo test --manifest-path src-tauri/Cargo.toml rebase::tests -- --nocapture`: **7 pruebas aprobadas**, incluidas las dos nuevas del registro. Clippy con `--tests -- -D warnings`, Rustfmt de los dos archivos modificados y `git diff --check` aprobados. Se corrigieron dos aserciones señaladas por Clippy sin desactivar advertencias.

`cargo test --manifest-path src-tauri/Cargo.toml forced_interruption -- --nocapture --test-threads=1`: **3 pruebas aprobadas**, 232,40 segundos. Repite corte durante hook, checkout y conflicto con continuación/aborto, usando el guardado ajustado. Las ejecuciones internas del auxiliar no se cuentan como pruebas adicionales. Las dos del protocolo del editor quedaron filtradas en este comando.

Primera regresión `cargo test --manifest-path src-tauri/Cargo.toml rebase -- --nocapture --test-threads=2`: **27 aprobadas, 1 fallida y 1 auxiliar ignorada**, 637,83 segundos. El único fallo fue una condición de prueba inválida: el atributo sólo lectura no impidió retirar el registro en este entorno. Se sustituyó por un handle que permite leer pero deniega borrar, sin cambiar producción ni ACL. Los hooks rechazado y con timeout pasaron con Git real de Windows, al igual que los casos lineales/interactivos, conflictos, respaldos y estado obsoleto. El comando se detuvo por el test fallido, por lo que no ejecutó entonces el protocolo del editor; éste y el caso corregido se validan por separado.

Validación final focalizada con el código corregido:

- Filtro `rebase_busy_record_reports_completed_abort_without_retry`: **1 aprobada**, 49,40 segundos. Denegación real del borrado, aborto Git ya completado, registro conservado y retirada posterior revisada comprobados.
- Filtro `rebase::tests`: **7 aprobadas** de nuevo, 0,04 segundos. Incluye errores simulados y denegación de lectura reales del sistema de archivos.
- `cargo test --manifest-path src-tauri/Cargo.toml --test rebase_editor -- --nocapture`: **2 aprobadas**, 0,66 segundos.
- Clippy estricto y Rustfmt focalizado volvieron a pasar después de corregir la condición de prueba; `git diff --check` aprobado.

Los recuentos son por comando y se solapan: no se suman las siete pruebas del registro a las 27 ya aprobadas. No se presenta la primera pasada amplia como verde ni se repitió íntegra después de sustituir sólo la condición de la prueba fallida. El caso sustituto y el código final del registro se verificaron de forma focalizada; los otros 27 casos habían pasado, y los tres cortes forzados se ejecutaron por separado.

## Límites

Son pruebas automatizadas del núcleo con Git y restricciones de archivo reales de Windows, además de errores de almacenamiento explícitamente simulados. No acreditan un disco físicamente lleno, fallos reales de `sync_all`, ACL NTFS completas, denegación de directorios, unidades de red, otros sistemas de archivos ni durabilidad ante corte eléctrico. Tampoco sustituyen la interfaz nativa de hooks/errores ni ejecución macOS. La aceptación anterior de cierre/reapertura Tauri conserva su alcance independiente. La fase D y v1 permanecen abiertas.
