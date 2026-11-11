# Corte durante checkout · Windows · 29/10/2026

Base `e0f1fc9`, con los cambios documentales de aceptación de aborto conservados. Se añadió una regresión Windows al auxiliar de interrupciones, sin instrumentación ni cambios funcionales de producción. No hubo red, repositorios personales, commits del proyecto ni publicaciones.

## Prueba automatizada

```text
cargo test --manifest-path src-tauri/Cargo.toml forced_interruption_during_checkout -- --nocapture --test-threads=1
```

**1 prueba aprobada, 0 fallos**, 34,49 segundos. El proceso auxiliar usa revisión/inicio de rebase reales. Un filtro smudge local a la fixture pausa el checkout; su parte clean conserva los bytes mediante `cat`. El filtro sólo sirve como barrera de prueba, sin modificar Git global ni producción.

Se exige que un archivo anterior por orden de checkout ya se haya escrito y que exista `index.lock` antes de considerar válido el corte. Se termina por la fuerza el proceso auxiliar propietario del Job de Git, se libera la barrera y se comprueba que el filtro hijo no escribe su marca posterior. El índice publicado conserva sus entradas originales; registro JSON y referencia de respaldo permanecen legibles. Con el checkout parcial y el bloqueo retenido, leer recuperación falla y los intentos de continuar, abortar o retirar el registro son rechazados. Registro, índice, bloqueo, HEAD, rama original y respaldo se comparan después y permanecen intactos. La fixture automatizada se retira por su limpieza normal de pruebas.

Preparación inicial: se corrigieron un acceso privado de la prueba durante compilación y la ausencia del filtro clean requerido antes de alcanzar la barrera. Ninguno de esos intentos acredita un corte. El resultado aprobado corresponde a la ejecución posterior corregida; las dos pruebas del protocolo del editor quedaron filtradas, no se repitieron.

Clippy con `--tests -- -D warnings` y `git diff --check` aprobados. No se repitió la suite completa; los cambios de esta tanda en Rust se limitan a la nueva prueba y el modo adicional de su auxiliar.

## Corte de la ventana nativa

Se reutilizó la copia aislada ya validada, SHA256 `3C5148A019899558F3FD8FE6FFC7DA97A093591861B3F006392CAAD0D22828B0`, con perfil independiente y nueva fixture «Corte durante checkout ü». Se inició un rebase lineal desde Ramas con revisión y confirmación por UI. El observador esperó la misma barrera y comprobó el archivo escrito y el bloqueo antes de terminar exclusivamente el PID de esa copia, identificado por ruta exacta.

Durante la pausa, Windows impidió leer `index.lock` por estar abierto de forma exclusiva por Git; su hash se tomó **después de salir el proceso**, no antes. Registro, índice publicado y HEAD se compararon antes/después del corte; bloqueo retenido, referencia original y respaldo se verificaron tras la salida. El filtro hijo no alcanzó su marca posterior al liberar la barrera.

Al relanzar la copia y abrir la fixture en Ramas, RavenGit mostró: «Hay locks, autostash u otra operación Git. Revísalos desde Git; RavenGit no los elimina». No mostró controles de continuar/abortar/retirar registro y mantuvo deshabilitadas las operaciones de ramas. Tras esa lectura nativa, hashes de registro, índice, bloqueo y HEAD y las dos referencias permanecieron iguales.

- Rama original y respaldo: `a8e8b70b0f5ed6a05c26a0a0f284d507b9197ea2`.
- En esta primera etapa se conservó deliberadamente el checkout parcial; **todavía no era una recuperación terminada ni un estado limpio**.
- Durante el rechazo seguro RavenGit no borró `index.lock`, no forzó Git ni intentó restaurar automáticamente.
- Preparación/manifiesto/traza AX en `state/recovery-native.local/prepare-checkout.ps1`, `checkout-manifest.json` y `checkout-native-trace.json`, ignorados por Git. La verificación del cierre final se interrumpió por Escape; en la continuación siguiente se confirmó que la copia ya estaba cerrada.

## Cierre de la prueba y recuperación manual · 29/10/2026

El usuario solicitó culminar la prueba. Se verificaron ruta exacta de la fixture, ausencia de la copia de aceptación en ejecución, ausencia de enlaces/reparse points y hashes de registro/HEAD/índice/bloqueo frente al manifiesto. Original y respaldo seguían coincidiendo. El estado completo anterior a la intervención se archivó en `recovery-evidence/before-manual-recovery.zip`, fuera del repositorio y dentro de su raíz temporal. Se comprobó que el ZIP incluye el bloqueo, el registro y el archivo escrito durante el checkout.

Sólo para esta fixture conocida, se abrió el bloqueo en exclusiva para comprobar que ya no tenía propietario y que estaba vacío. Después se retiró explícitamente ese bloqueo obsoleto y se ejecutó `git -c filter.forced.smudge=cat rebase --abort`, evitando volver a pausar el filtro de prueba sin modificar la configuración global. El archivo auxiliar `000-incoming.txt` se trasladó a `recovery-evidence/` conservando su contenido. Tras verificar la restauración se archivó allí también el registro huérfano de RavenGit; no se eliminó la evidencia.

Resultado aprobado:

- HEAD y referencia de respaldo iguales a `a8e8b70b0f5ed6a05c26a0a0f284d507b9197ea2`.
- Árbol original `93879d0d482be2795789651e3f77e49346d4b6e6`, contenido `local` y salto de línea restaurados; rama `main` limpia.
- Sin rebase activo, bloqueo ni registro huérfano dentro de Git.
- Nueva apertura nativa: Ramas muestra `main`, permite Revisar rebase y Cambiar a feature, y no muestra recuperación pendiente. No se ejecutaron esas acciones de rama; sólo se verificaron habilitadas.

Guion y traza final en `state/recovery-native.local/recover-checkout.ps1` y `checkout-recovered-trace.json`; el manifiesto conserva ruta/hash del ZIP y verificación de recuperación manual. La fixture, el respaldo y el ZIP se mantienen para revisión. No se cambiaron credenciales ni repositorios personales. Se cerró normalmente la copia aislada al finalizar. No se repitieron pruebas o compilaciones porque esta continuación sólo recuperó la fixture y documentó el resultado.

## Alcance y pendientes

Esto acredita contención de procesos, rechazo seguro y recuperación manual comprobada de esta fixture Windows durante un checkout real con archivos ya actualizados e índice todavía sin publicar. No inyecta un corte a mitad de una escritura de bytes del índice: Git estaba pausado en el filtro y mantenía su transacción abierta. La retirada manual y verificada del bloqueo de esta fixture no autoriza a RavenGit a borrar bloqueos automáticamente ni certifica una recuperación automática general. Siguen pendientes otras ventanas de publicación del índice/refs/registro, cortes eléctricos, falta de espacio, permisos, otros volúmenes y macOS. La fase D y v1 permanecen abiertas.
