# Windows · revisión del avance y validación actual

26/10/2026 · fuentes `e715539eaee560b296bbbb6b8c352eb2573639fd`, versión de desarrollo 0.4.2. Árbol limpio al comenzar; sin publicación nueva. Este expediente registra comprobaciones Windows y no modifica las aceptaciones históricas macOS.

## Avance revisado

Desde la última consolidación Windows se añadieron visor/editor/preparación de conflictos, recuperación de respaldos D.2d, rebase interactivo acotado D.3 y preparación múltiple C.2. Los registros Mac acreditan recorridos específicos; no equivalen a aceptación Windows.

## Entorno y método

- Windows NT 10.0.26300.0, x64; Intel64 Family 6 Model 142 Stepping 10; 8 procesadores lógicos disponibles.
- Git 2.56.0.windows.3; rustc 1.99.1 (2026-10-13), Cargo 1.99.1; Node 24.22.1; PowerShell 7.6.9.
- Suite Rust completa, no sólo `--lib`: construye el binario usado por el editor de rebase y sus pruebas de protocolo. Fixtures Git locales desechables; no operaciones sobre repositorios del usuario ni cambios de credenciales/configuración global.
- Interfaz con IPC simulado. Cachés y fixtures requieren ejecución fuera del sandbox restringido; no se cambian las políticas del sistema.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 191 del núcleo aprobadas, 0 fallidas y 1 auxiliar ignorada; 2429,72 s. Dos pruebas del protocolo del editor aprobadas; main/doctests sin casos |
| `npm test` | 241 aprobadas / 26 archivos, sin fallos |
| `npm run build` | TypeScript y Vite aprobados |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Aprobado |
| Prettier sobre `src`, `scripts`, configuración TS/Vite y package.json | Aprobado con `--end-of-line auto`; ver incidencia de checkout |
| Clippy all-targets `-D warnings` | Aprobado, después de la suite Rust |
| `npm run tauri build -- --debug --no-bundle` | Aprobado después de Rust/Clippy; `src-tauri/target/debug/ravengit.exe`, sin instalar/publicar |
| `npm run icons:verify` | Seis tamaños del icono RavenGit confirmados en el ejecutable: 16, 24, 32, 48, 64 y 256 px |
| `git diff --check` | Aprobado antes de añadir este expediente |

### Finales de línea del checkout

El check Prettier predeterminado informó diferencias en 34 archivos. `git ls-files --eol` confirmó índice LF y working tree CRLF en ejemplos afectados (`App.tsx`, `ChangesPanel.tsx`, `vite.config.ts`); otros archivos permanecen LF. El mismo check con `--end-of-line auto` aprobó. No se reformatearon archivos ni se cambió `core.autocrlf` para ocultar esta diferencia de plataforma. El check predeterminado no se presenta como aprobado.

### Alcance de la suite completa

Los 192 casos enumerados del núcleo incluyen `process::windows::tests::process_fixture`, auxiliar ignorado invocado como subproceso por otras pruebas. No es una función pendiente de validar. La diferencia con los 190 casos del registro Mac corresponde a compilación condicional por plataforma; los resultados históricos no se suman.

Suite Rust, Clippy y build nativo se ejecutaron en serie para no reemplazar artefactos mientras se usan en tests/doctests. La caché incremental Windows avisó de hard links no disponibles y copió archivos; los comandos terminaron con código 0. El ejecutable es de desarrollo, no un instalador, una publicación firmada ni una aceptación de WebView/UI.

SHA-256 del ejecutable comprobado: `5e59c751b46c58450e497622efd1badd2879da3c263831c8051ff60fb3836f70`.

Pasaron rebase interactivo con las seis acciones, conflictos/reapertura/continuación/aborto y múltiples pausas; recuperación de respaldos de conflictos; preparación múltiple; staging CRLF, transporte y tags en fixtures locales; Stash y contención de procesos Windows. Las dos pruebas de protocolo invocan el ejecutable sin lanzar Tauri: cubren protocolo incompleto y validación de registro/destino/mensajes literales. No sustituyen UI nativa ni proveedores reales. No hubo fallos funcionales que requirieran modificar producción.

## Aceptación nativa: bloqueo y pendientes

**Actualización posterior:** el controlador volvió a funcionar y se ejecutaron recorridos aislados. Consultar [aceptación nativa Windows](Windows_nativo_2026-10-26.md) para resultados y pendientes vigentes. El bloqueo y tabla siguientes describen el intento inicial, no el estado posterior.

Se intentó identificar las ventanas mediante el controlador Windows `@oai/sky`. `list_apps` agotó el tiempo: intento inicial, reintento tras espera y último intento después de reiniciar el kernel. No llegó a devolver una ventana seleccionable; se detuvo la automatización sin enviar clics/teclas, abrir instancias ni alterar perfiles del usuario. No se puede atribuir el bloqueo a RavenGit ni afirmar que el escritorio estuviera bloqueado.

Por ello no hay capturas, revisión visual ni aceptación nativa nueva. Un build o un test que invoque el editor de protocolo no sustituye esos recorridos.

| Prioridad nativa | Recorrido aún pendiente en Windows |
| --- | --- |
| C.2 | Fixture con modificación/alta Unicode/eliminación; selección parcial, Preparar todos, borrador conservado y commit posterior exacto; ventana mínima y teclado |
| D.2a–c | Merge textual: consulta de etapas, cierre/Escape, guardado con respaldo, rechazo ante edición externa y preparación exclusiva; otro preparado/HEAD conservados |
| D.2d | Comparación original/actual, restaurar con copia previa y volver al contenido posterior; 900 × 640, foco, líneas extremas, archivo/índice/operación obsoletos y reapertura |
| D.3 | Ordenar y seis acciones; conflicto, resolución, reapertura, continuación y aborto; varias pausas fixup, drop antes de conflicto y commit vacío abortable |
| Transversales | Interrupción forzada, hooks/permisos/antivirus, lector de pantalla/escalado, instalador limpio, proveedores SSH/HTTPS y rendimiento al límite |

Los recorridos deben usar fixtures y perfil separados, sin remotos personales. No se eliminan las puertas RG/AC por completar automatización. Consultar los registros de [preparación múltiple](Preparacion_multiple.md), [rebase interactivo](Rebase_interactivo.md) y [recuperación de respaldos](Recuperar_respaldos_conflictos.md) para alcance y exclusiones.
