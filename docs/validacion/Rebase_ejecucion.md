# Rebase lineal: ejecución y recuperación

Fecha: 2026-10-21. Continuación de RG-05; no cierra AC-05 ni aceptación multiplataforma.

La validación nativa posterior en Mac y la mejora de recuperación de un inicio
rechazado están en [Rebase_macOS.md](Rebase_macOS.md). Los resultados de abajo
conservan el alcance de la primera implementación.

## Uso

En Ramas, revisar la rama activa sobre una base local distinta. Aceptar que los
hashes pueden cambiar y comprobar por cuenta propia si los commits se comparten.
Confirmar consume la revisión en Rust; la aplicación no deduce que una rama sea
privada por no tener upstream ni consulta proveedores para averiguarlo.

El inicio requiere árbol limpio, repositorio completo/simple y rango sin merges.
También bloquea **todos los archivos ignorados**, incluidos directorios de
dependencias: deben apartarse antes. Es una restricción conservadora para no
sobrescribirlos durante el cambio de base, no una instrucción para borrarlos.

Se crea `refs/ravengit/rebase/<hash>-<identificador>` antes de reubicar y un registro
duradero `.git/ravengit-rebase.json`. Ambos identifican rama, commit original y
base. La referencia se conserva tras éxito/aborto; su limpieza visual queda pendiente.
Es un respaldo de commits, no una copia de cambios sin commit o efectos de hooks.

Si se detiene: editar y guardar fuera de RavenGit, actualizar el rebase y marcar
cada resolución. Se admiten texto UTF-8 sin marcadores de hasta 2 MiB y eliminaciones;
binarios/enlaces/casos avanzados se resuelven desde Git. Revisar diffs en Cambios.
Continuar requiere ausencia de conflictos, cambios sin preparar y archivos sin
seguimiento, además de autor configurado. Puede detenerse en otro commit.
Abortar exige aceptar que las ediciones y resoluciones pueden perderse.

## Políticas y controles

- Worker bajo bloqueo de escrituras: comprueba repositorio activo y confianza,
  consume plan de un solo uso y descarta revisiones de Pull/Push.
- Recalcula huella, hashes de rama/base y configuración antes del inicio.
  Abrir otro repositorio o cambiar confianza descarta el plan.
- Rebase con backend merge, estrategia ort, sin autostash, update-refs,
  rebase-merges ni fork-point. No se ejecutan tareas `exec` de una secuencia.
- Reaplica parches equivalentes; conserva commits inicialmente vacíos y se detiene
  cuando un parche queda vacío. Decidir omitirlo/crear un commit vacío requiere Git
  o abortar: no hay botón Skip en esta entrega.
- Recuperación limitada a operaciones iniciadas por RavenGit: valida registro,
  respaldo, rama original, base y metadatos de Git. Sólo admite instrucciones pick
  de commits del rango original; cambios externos de secuencia o refs pueden
  bloquear la recuperación visual. No adopta rebases arbitrarios de otras herramientas.
- Huella de recuperación incluye cambios/índice/HEAD, mensaje, autor y secuencia;
  editar una resolución exige actualizar antes de prepararla.
- Sin editor interactivo durante la continuación. Los mensajes originales se
  conservan. Hooks y firma configurados siguen siendo herramientas confiadas del
  usuario, con posibles efectos propios. No hay rollback de esos efectos.
- Sin contactos de red, force push ni reinicios automáticos. El ejecutor compartido
  limita salida y tiempo a 60 segundos y contiene procesos conforme a cada plataforma.

Un fallo/timeout puede dejar resultado incierto. Actualizar y comprobar desde Git;
no repetir para refrescar. Si Git ya terminó o rechazó el inicio pero queda el
registro, la aplicación lo conserva y bloquea otro inicio. Antes de retirar ese
registro manualmente, comprobar `git status`, rama/HEAD y la referencia de respaldo;
conservar aparte las ediciones necesarias. RavenGit no borra locks ajenos ni
realiza reset forzado para reparar un estado desconocido. No ofrece aislamiento
completo frente a procesos Git externos ni una sandbox para hooks/filtros.

Actualización: cuando el inicio rechazado queda verificado con árbol limpio,
rama original intacta y respaldo correcto, Ramas ofrece retirar sólo el registro
tras confirmación. No se habilita esa retirada para un rebase activo ni para un
resultado distinto del original. La inspección manual sigue siendo necesaria
en los demás estados inciertos.

## Validación

Fixtures Git locales: rebase lineal con nuevo hash y padre esperado, referencia
original conservada, conflicto recuperable tras releer desde disco, resolución con
rechazo de marcadores, continuación/aborto, confianza, revisión obsoleta, archivos
ignorados preservados, secuencia inyectada bloqueada, parche equivalente detenido
y hook pre-rebase rechazado (caso del hook sólo en Unix).

UI con IPC simulado: confirmación obligatoria, consumo tras éxito/error, resultado
confirmado conservado si falla refresco, recuperación, bloqueo de continuar,
preparación de resolución y consentimiento de aborto. No reemplaza interacción nativa.

Resultado local macOS ARM64: suite completa **84 pruebas Rust aprobadas** y
**69 pruebas de interfaz aprobadas**. Después de fijar explícitamente el formato
de instrucciones, comandos completos y autosquash deshabilitado, se repite el
conjunto afectado de rebase (9 pruebas), incluida configuración de instrucciones
personalizada que el flujo no debe heredar. Build TypeScript/Vite, Clippy con
`-D warnings`, formato Rust/Prettier y `git diff --check` aprobados.

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo test --manifest-path src-tauri/Cargo.toml --offline rebase
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

No se hizo inspección visual ni interacción nativa de esta entrega y no se
repitió Windows. La reapertura se comprueba releyendo el estado de disco desde
la API sin planes en memoria; no mediante un cierre forzado de la aplicación.
Git utilizado localmente: 2.56.0. Compatibilidad con versiones anteriores no validada;
un Git que no admita las opciones puede rechazar el inicio y exigir inspección del registro.

Pendientes: aceptación nativa macOS/Windows, instaladores, recuperación tras cierre
forzado durante cada paso, firma fallida, validación de timeout específica de rebase,
editor de conflictos integrado, limpieza de respaldos y rebase interactivo/con merges.

Referencia: [Git rebase](https://git-scm.com/docs/git-rebase).
