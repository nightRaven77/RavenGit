# Aborto nativo tras corte forzado · Windows · 29/10/2026

Base `e0f1fc9`, árbol limpio al iniciar. Continuación de la [aceptación de interrupciones](Interrupciones_rebase_Windows_2026-10-28.md). Se reutilizó la copia aislada de RavenGit, SHA256 `3C5148A019899558F3FD8FE6FFC7DA97A093591861B3F006392CAAD0D22828B0`, verificada antes de abrirla. No se compiló ni cambió producción en esta tanda.

## Comprobado antes del aborto

- Nueva fixture «Aborto tras corte ü» bajo Temp, sin remotos ni ediciones personales. Se conservaron la fixture anterior y la biblioteca habitual; sólo se añadió la nueva entrada al perfil de aceptación.
- Inicio desde UI de un rebase interactivo de `main` sobre `feature`, con un commit y acción `pick`, revisión y confirmación explícitas.
- Conflicto esperado en `archivo ü.txt`; registro JSON legible y referencia de respaldo igual al original `b16fcd2a16d0938cfb6037cdd739bf723ed14c77`. Árbol original `93879d0d482be2795789651e3f77e49346d4b6e6`.
- Cierre forzado exclusivamente del PID de la copia verificada por ruta exacta; hash del registro conservado después del corte.
- Relanzamiento de la copia, apertura de la fixture desde la biblioteca y recuperación visible en Ramas: original, base, respaldo y archivo en conflicto. Continuar y Abortar deshabilitados, con casilla independiente para consentir el descarte del conflicto.

## Aborto autorizado y resultado

Tras la confirmación expresa del usuario, se marcó la casilla de descarte y se pulsó Abortar rebase desde la interfaz de la copia aislada. La UI informó «Rebase abortado; rama original restaurada» y «Respaldo conservado». Resultado aprobado, verificado además mediante consultas Git independientes:

- HEAD exacto: `b16fcd2a16d0938cfb6037cdd739bf723ed14c77`, igual al original.
- Árbol exacto: `93879d0d482be2795789651e3f77e49346d4b6e6`, igual al original; contenido del archivo igual a `local` seguido de salto de línea.
- Rama activa `main`, estado limpio y respaldo resolviendo al HEAD original.
- Ausencia de `.git/rebase-merge` y de `.git/ravengit-rebase.json`.
- Ejecutable habitual conservado con hash idéntico al registrado antes de la prueba.

Se cerró normalmente la instancia de aceptación después de completar la comprobación. La fixture y el respaldo se conservan para revisión. Esto acredita aborto nativo por IPC después de terminar por la fuerza Tauri cuando ya estaba detenido en conflicto. No certifica el descarte de resoluciones personales, un corte durante escrituras de Git, todas las ventanas críticas, instalación ni macOS. No se repitieron suites automatizadas ni compilaciones: sólo se completó la aceptación nativa y se actualizó documentación.

Preparación, manifiesto y traza AX previa: `state/recovery-native.local/prepare-abort.ps1`, `abort-manifest.json` y `abort-native-trace.json`, ignorados por Git. La ventana empezó en 1100 × 760 y se maximizó a 1366 × 768 para mostrar completamente la advertencia y el botón. Sin red, commits del proyecto, publicaciones, credenciales ni cambios a repositorios personales.
