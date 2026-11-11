# RavenGit · incremento de ramas locales

> Registro histórico. Los pendientes de procesos y fixtures Windows descritos aquí recibieron evidencia posterior en [Windows_estabilizacion.md](Windows_estabilizacion.md). Las limitaciones de aquel incremento se conservan como historial; consulta el [roadmap actual](../../ROADMAP.md) para no confundirlas con tareas todavía abiertas.

Fecha: 21 de octubre de 2026. Base de código: 0.4.2 con la autorización persistente del incremento anterior. Esta entrega continúa RG-04; no cierra M0, M2 ni la aceptación del MVP.

## Entrega

- Vista Ramas accesible desde la barra «Rama» y la navegación lateral. Seleccionar una referencia en el lateral del historial sigue localizando su commit, sin cambiar de rama.
- Crear desde el hash de HEAD revisado, sin cambiar la rama activa ni configurar seguimiento automático.
- Cambiar a una rama local existente, sin resolución automática de nombres remotos, force, merge implícito, recursión de submódulos ni sobrescritura de archivos ignorados.
- Renombrar una rama local con `git branch -m`, sin reemplazar ramas existentes; se rechazan también colisiones ASCII de mayúsculas para evitar diferencias entre sistemas de archivos.
- Autorización persistente compartida con las otras vistas. No se solicita una autorización por acción.

## Integridad y estados bloqueados

Las tres mutaciones requieren árbol limpio, incluido contenido preparado y archivos sin seguimiento. Es una limitación conservadora de este incremento. Se bloquean conflictos, merge/rebase/cherry-pick/revert/bisect y otros estados detectados por Cambios; también worktrees enlazados, directorios Git externos indicados mediante `.git` como archivo, submódulos, sparse checkout, split index y marcas assume-unchanged/skip-worktree que pueden ocultar modificaciones. La rama de destino tampoco puede introducir submódulos.

En HEAD separado se puede crear una rama desde el commit actual. Cambiar de rama se bloquea si ese commit no está contenido en ningún historial de rama local; crear una rama permite conservarlo y cambiar después a ella.

La huella incluye el estado de Cambios, refs locales, worktrees y restricciones de la lectura. Se comprueba al recibir la acción y nuevamente antes del proceso de escritura. El endpoint revalida repositorio activo y confianza dentro del lock común de escrituras y descarta revisiones de push anteriores. No se aceptan flags Git arbitrarios ni se usa shell para componer operaciones.

Git conserva sus locks y hooks normales. Al terminar se verifica el hash del destino, la rama activa, HEAD y la desaparición del nombre anterior al renombrar. Si el estado esperado está confirmado y Git devuelve error por un hook posterior, se devuelve éxito con advertencia. Un timeout, fallo o resultado no confirmado exige revisar el estado; no se repite automáticamente. Un fallo al refrescar el historial después del éxito se anuncia por separado y no convierte la mutación en un reintento.

Las comprobaciones no son una transacción con otros procesos Git. Un proceso externo puede modificar refs o archivos después de la última comprobación. Los hooks/filtros autorizados pueden producir efectos propios que no se revierten. Se conserva el ejecutor compartido de 0.4.2; la contención completa de descendientes Windows mediante Job Objects sigue pendiente y este incremento no la certifica.

Actualización posterior: la contención Windows y los fixtures se abordan en [Windows_estabilizacion.md](Windows_estabilizacion.md). La evidencia de esta entrega de ramas se conserva como registro de su alcance original.

## Evidencia ejecutada en Windows

Entorno: Git 2.56.0.windows.2, Node v24.14.0, npm 11.9.0; Rust/Cargo instalados por el usuario y utilizados desde `C:/Users/erick/.cargo/bin`. El PATH de esta sesión de Codex no estaba actualizado; se añadió esa carpeta sólo al proceso de compilación, sin cambiar la configuración global.

| Verificación | Resultado y alcance |
| --- | --- |
| Vitest completo | 42 pruebas aprobadas en siete archivos; incluye seis pruebas nuevas del panel de ramas y navegación App/CommandBar. IPC simulado; no ejecuta Git. |
| Integración Rust de ramas | Ocho pruebas aprobadas sobre repositorios temporales reales. Creación/cambio/renombrado; conservación de archivos y hashes; confianza; estado obsoleto; archivos sin seguimiento; locks; operación activa; worktrees; archivos ignorados; índice preparado; HEAD separado; hook post-checkout fallido y cambios ocultos por marcas del índice. |
| Clippy de biblioteca | `cargo clippy --manifest-path src-tauri/Cargo.toml --offline --lib -- -D warnings` aprobado. No sustituye Clippy all-targets; hay un import de Instant exclusivo de pruebas Unix sin guard en la suite anterior de Cambios. |
| Frontend | TypeScript y Vite aprobados. |
| Aplicación nativa | `npm run tauri build -- --debug --no-bundle` aprobado; genera `src-tauri/target/debug/ravengit.exe`. No genera instalador ni acredita distribución firmada. |
| Revisión visual | Fixture de navegador `dev/branches.html`: distribución, textos y bloqueo con `?dirty`. Datos sintéticos e IPC simulado; operaciones reales deshabilitadas. |

El sandbox rechazó inicialmente la preparación de fixtures Git y el acceso del navegador al servidor de desarrollo aislado. La validación Git y el servidor visual se ejecutaron fuera del sandbox con aprobación. No se modificaron ramas ni archivos de repositorios personales para probar operaciones.

No se ejecutó la suite Rust completa en este incremento; el fixture de nombre Unix incompatible con Windows descrito en `Windows_viabilidad.md` continúa pendiente. Tampoco se volvió a ejecutar macOS, instalación limpia, benchmarks, lector de pantalla, proveedores HTTPS/SSH ni el flujo nativo completo con interacción de usuario. La compilación Windows y estas pruebas amplían la evidencia, pero no equivalen a soporte completo certificado.

## Siguiente entrega

### Ajuste de interacción posterior

La lista ahora ofrece «Cambiar» en cada fila: un clic activa directamente esa rama, sin seleccionarla primero ni buscar una acción en el inspector. El resaltado representa la rama activa real. «Renombrar» es una acción independiente que abre el editor del nombre y enfoca su campo; no cambia de rama. Se conservan las restricciones de confianza, cambios pendientes y concurrencia del backend.

Validación del ajuste: 43 pruebas Vitest aprobadas, build TypeScript/Vite aprobado y revisión visual del fixture en navegador. No se modificó Rust ni se regeneró el ejecutable nativo para este ajuste de interfaz; usar `npm run tauri dev` para probarlo o recompilar el bundle para distribuirlo.

### Continuidad del roadmap

Completar la base Windows de procesos y fixtures y validar manualmente la secuencia nativa crear → cambiar → commit → volver → renombrar. Después, continuar con operaciones de integración y recuperación de conflictos antes de componer Pull. Clone, stash, borrado de ramas y operaciones avanzadas mantienen sus decisiones y criterios independientes; no se anuncian como implementados.

Referencias primarias consultadas: [git-switch](https://git-scm.com/docs/git-switch) y [git-branch](https://git-scm.com/docs/git-branch). Las garantías concretas anteriores se sustentan en código y pruebas de RavenGit, no sólo en la documentación de Git.
