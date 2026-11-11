# Interrupciones forzadas de rebase · Windows · 28/10/2026

Base `b380c1c`, con cambios locales conservados. Pruebas del núcleo real en procesos separados y repositorios temporales, sin red, proveedores ni repositorios personales. No se termina ninguna instancia habitual de RavenGit.

## Método

Las pruebas Windows de `src-tauri/src/branches.rs` lanzan el ejecutable de pruebas como auxiliar. Este llama a revisión/inicio/recuperación reales de RavenGit. El proceso padre espera una marca del punto de interrupción, termina por la fuerza exclusivamente ese auxiliar mediante su handle y espera su salida. No se usa el timeout del núcleo ni su limpieza normal. La recuperación se realiza en otro proceso nuevo, con revisiones nuevas y sin estado en memoria del proceso terminado.

Comando reproducible:

```text
cargo test --manifest-path src-tauri/Cargo.toml forced_interruption -- --nocapture --test-threads=1
```

El auxiliar `forced_rebase_worker` está ignorado en la suite normal; las dos pruebas lo invocan explícitamente con ruta y modo de fixture. No necesita credenciales ni modificar configuración global.

## Escenarios

- Durante `pre-rebase`, después de publicar el registro y crear el respaldo: el hook marca su entrada y espera una señal. Se termina su proceso propietario, se comprueba JSON legible y HEAD intacto, y se libera la señal. La ausencia de la marca de escritura posterior durante un segundo comprueba de forma acotada la contención del hook en el Job de Windows. Otro proceso retira el registro no activo; árbol, estado limpio y respaldo original se verifican después.
- Rebase interactivo detenido por conflicto, antes de resolver: se termina el proceso propietario y otro proceso relee el registro. En una fixture resuelve/prepara/continúa, conserva el mensaje revisado y el contenido resuelto; en otra aborta y recupera exactamente HEAD y árbol originales. Ambas terminan en `main`, sin cambios pendientes ni registro activo, conservando la referencia de respaldo.

Primera ejecución: pasó el escenario del hook; el de continuación falló por un error de la prueba, que editaba el archivo y luego intentaba prepararlo usando la revisión anterior. RavenGit rechazó esa revisión obsoleta. Se corrigió la prueba para releer después de editar, conservando la protección de producción.

Resultado final tras la corrección: **2 pruebas aprobadas, 0 fallos**, en 142,71 segundos. Incluyen tres terminaciones forzadas (hook, conflicto/continuar y conflicto/abortar) y tres recuperaciones en procesos nuevos; las ejecuciones del auxiliar no se cuentan como pruebas adicionales. El comando también construyó el ejecutable requerido por el editor interactivo; sus dos pruebas de protocolo quedaron filtradas, no se repitieron. `git diff --check` pasó. No hubo cambios funcionales de producción en esta tanda, commits, publicaciones ni contactos de red.

## Ventana nativa: cierre forzado y continuación · 28/10/2026

Recorrido adicional aprobado en una compilación debug sin bundle, con identificador/perfil independiente `dev.ravengit.recovery.ue1d7d1f0`, ventana «RavenGit Recovery Acceptance» de 1100 × 760 y un repositorio temporal sin remotos. TypeScript/Vite y compilación Windows pasaron. El ejecutable habitual se respaldó y restauró con hash exacto antes de abrir la copia aislada; la biblioteca habitual no se abrió.

Desde la UI se abrió la fixture, se revisó el rebase de `main` sobre `feature`, se revisó y ejecutó el plan interactivo de un commit con `pick`, y se observó «Rebase detenido». El archivo Unicode quedó en conflicto. Registro JSON y referencia de respaldo se verificaron antes de terminar por la fuerza exclusivamente el PID de esa copia, localizado por ruta exacta del ejecutable. Registro e índice conservaron sus hashes tras el corte.

Se relanzó el mismo ejecutable y se seleccionó el repositorio desde la biblioteca. En Ramas reaparecieron rama original, base, respaldo y conflicto; Continuar seguía deshabilitado. Se guardó una resolución externa sólo en la fixture, se pulsó Actualizar rebase y Marcar resuelto desde la UI. Continuar se habilitó y finalizó desde la misma UI con «Rebase completado y rama confirmada» y aviso de respaldo conservado.

Verificación final independiente:

- Original y respaldo: `06748d6c198b12b102fe208e75efe66a9084c75c`.
- Base: `82d81fb3d0564f34ab7509a83a98d9a7352bb836`.
- HEAD final: `d1cb76ada97ec5a2174168c0a848186026c91426`, padre igual a la base; rama activa `main`, mensaje original conservado y contenido resuelto exacto.
- Estado limpio, sin `rebase-merge` ni registro activo; referencia de respaldo intacta. Ejecutable habitual igual al respaldo original.
- SHA256 de la copia de aceptación: `3C5148A019899558F3FD8FE6FFC7DA97A093591861B3F006392CAAD0D22828B0`.

Preparación, manifiesto y traza AX en `state/recovery-native.local/`, ignorados por Git. Se cerró normalmente la copia al finalizar, conservando la fixture y su respaldo para revisión. No hubo publicación ni modificación de credenciales. La biblioteca de prueba se sembró externamente y mostró dos variantes de la misma ruta con barras distintas tras guardar; no se certifica aquí deduplicación de rutas. El aviso superior redujo el espacio visible y dejó Continuar parcialmente fuera del panel: se cerró ese aviso para pulsar el botón completo. Se registra como deuda UX, sin cambios de código en esta tanda.

## Límites

Actualización 29/10: [corte durante checkout](Corte_checkout_Windows_2026-10-29.md) comprobado con proceso del núcleo y ventana Tauri, después de escribir un archivo y antes de publicar el índice. Se certifica rechazo seguro con bloqueo retenido; no recuperación completa del checkout parcial ni todas las ventanas de escritura.

Actualización 29/10: [aborto nativo tras corte forzado](Aborto_tras_corte_Windows_2026-10-29.md) aprobado en otra fixture, con HEAD/árbol/contenido originales y respaldo conservados. Amplía la aceptación de continuación del 28/10; no repite ni amplía los cortes durante escrituras.

Las dos pruebas automatizadas comprueban terminación forzada de procesos con el núcleo y la contención Windows reales. El recorrido nativo del 28/10 acredita cierre forzado/reapertura de Tauri y continuación por IPC cuando el rebase ya está detenido por conflicto; el aborto tiene la actualización separada del 29/10. No prueban corte de Tauri mientras Git escribe, empaquetado ni instalación. Tampoco cubren todas las ventanas entre escritura/sincronización/publicación del registro y creación del respaldo, Git terminado antes de retirar el registro, cortes eléctricos, falta de espacio, permisos, ubicaciones de red o macOS. La fase D y v1 permanecen abiertas.
