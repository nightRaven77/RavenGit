# Teclado y foco en preparación múltiple · 27/10/2026

Incremento de frontend sobre `e715539` y los ajustes UX locales anteriores. Se aplica la guía de accesibilidad del proyecto con alcance focalizado; no es certificación WCAG ni aceptación con lector de pantalla.

- Al terminar Preparar todos/seleccionados, el aviso de éxito o error recibe foco si éste seguía en el control iniciador o se perdió al desaparecer/deshabilitarse. Si el usuario enfoca otro control durante la operación, se respeta ese destino. Tampoco se enfoca un panel inactivo.
- Los avisos tienen foco programático y contorno visible; se mantienen sus roles status/alert y el resultado no dispara reintentos.
- El contador de selección conserva aria-live polite y añade aria-atomic para anunciar la frase completa.
- Se añade foco visible a textarea y scroll-padding superior a los diálogos de conflictos/recuperación para reservar espacio bajo la cabecera fija.

Pruebas: 17 casos de ChangesPanel aprobados. Cubren Tab/Espacio entre casillas, estado parcial nativo indeterminate, una sola escritura revisada, foco del resultado tras éxito y error, conservación de selección obsoleta y ausencia de robo de foco con respuesta diferida. La suite amplia ejecutó 26 archivos: 25 pasaron y el nuevo caso falló por una consulta textual ambigua; después se precisó a role=status y los 17 casos del módulo pasaron. TypeScript/Vite, Prettier de los tres archivos modificados y git diff --check aprobados. No se repitió Rust por tratarse de frontend.

Actualización: la [comprobación nativa macOS posterior](MacOS_actual_2026-10-27.md) pasó selección, Tab/Return, estados AX y foco visible de éxito/error, incluida carga de 300 cambios. Siguen pendientes Windows, lector de pantalla real, escalado y foco con cabeceras a distintas alturas. Lighthouse/axe no se ejecutaron en esta revisión focalizada.

Build Windows debug sin bundle aprobado; ejecutable actualizado en `src-tauri/target/debug/ravengit.exe`. Es compilación de desarrollo, no instalador firmado.
