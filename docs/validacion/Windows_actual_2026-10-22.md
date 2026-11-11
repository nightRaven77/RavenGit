# Windows: consolidación automatizada del estado actual

Fecha: 2026-10-22. Fuentes: `653331231849108d87c5e2ab8a2ad140cfde55bc`,
versión de desarrollo 0.4.2; árbol limpio antes de ejecutar. Este registro y sus
enlaces son los únicos cambios posteriores a la ejecución. No declara una publicación.

## Entorno

- Windows NT 10.0.26300.0, x64; Intel64 Family 6 Model 142 Stepping 10.
- Git 2.56.0.windows.2, rustc 1.99.1 (2026-10-13), Node.js 24.14.0.
- Pruebas Rust con repositorios temporales reales; interfaz con IPC simulado.
- Sin modificar configuración global, credenciales ni repositorios del usuario.
  El transporte de las fixtures usa remotos locales, no proveedores reales.

## Ejecución y resultados

| Comprobación | Resultado |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml --offline` | 96 aprobadas, 0 fallidas, 1 ignorada; ejecución de tests: 964,96 s |
| `npm test -- --maxWorkers=1` | 106 aprobadas en 15 archivos; 135,67 s |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Aprobado |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings` | Aprobado; sin diagnósticos Clippy |
| `npm run build` | TypeScript y Vite aprobados |
| `npm run tauri build -- --debug --no-bundle` | Aprobado; `src-tauri/target/debug/ravengit.exe` |
| `git diff --check` | Aprobado antes del registro documental |

Cargo se ejecutó desde `C:/Users/erick/.cargo/bin/cargo.exe`; para Tauri se añadió
esa carpeta al PATH del proceso, sin persistir cambios del entorno. Las suites se
ejecutaron fuera del sandbox restringido para permitir fixtures Git y caché Vite.

La prueba ignorada, `process::windows::tests::process_fixture`, es el punto de
entrada auxiliar invocado como subproceso por las pruebas de contención, no una
aceptación funcional omitida. Los 97 casos enumerados incluyen ese auxiliar.
El recuento difiere del registrado en macOS por las pruebas específicas de plataforma.

Rust cubre ramas, merge, rebase, cherry-pick/revert, staging por bloques y CRLF,
historial/paginación, biblioteca, Pull/Push/Fetch locales, confianza, selección SSH
y contención de procesos Windows. Pasan los conflictos con relectura desde disco,
continuación y aborto en fixtures; no equivalen a reiniciar la aplicación nativa.

Durante Clippy y el build nativo Cargo avisó de que la caché incremental no podía
crear enlaces duros y copió los archivos. Los comandos terminaron con código 0;
se conserva esta advertencia del entorno sin atribuirla a un fallo de código.

## Límites y siguiente incremento

Esta ejecución actualiza la evidencia automatizada Windows del código reciente,
incluida su compilación nativa. No certifica interacción con el ejecutable,
instalación limpia, firma, cierre forzado, rendimiento, accesibilidad, ni transporte
SSH/HTTPS por proveedor. No se ejecutaron pruebas macOS desde Windows.

Sigue vigente el incremento **A: consolidar lo reciente** del roadmap: ventana
900 × 640/escalado y teclado, biblioteca con varias entradas, movimiento real y
relocalización tras reiniciar, persistencia de filtros/búsqueda, errores de guardado
y replay con conflicto/reinicio nativo. La matriz debe conservar resultados separados
por plataforma. No se cierran AC-05/07/08/11/12 sólo por estas suites.

Después corresponde **B: varias colecciones del espacio local**: crear, renombrar,
quitar y ordenar colecciones, gestionar pertenencia, migrar metadatos conservando
fijación/preferencias y no tocar archivos del repositorio al quitar una colección.
