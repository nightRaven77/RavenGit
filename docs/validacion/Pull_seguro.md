# Pull seguro — Fetch y merge explícitos

Fecha: 2026-10-21. Incremento de RG-04 sobre el merge local de RG-05.
No incluye rebase ni da por cerrados RG-05, AC-05 o el MVP completo.

## Flujo

1. Abrir Pull desde la barra o el lateral: sólo lecturas locales. Muestra rama
   activa, remoto, rama upstream y URL efectiva. Comparte la confianza persistente.
2. Requiere una única pareja `branch.<rama>.remote` / `branch.<rama>.merge`, con
   remoto real configurado y `refs/heads/...`. Sin fallback a origin, selección de
   primer remoto, upstream local `.` ni escritura de configuración de seguimiento.
3. Confirmar Fetch: descarga sólo la rama vinculada con un refspec completo hacia
   su referencia `refs/remotes/...`, no la colección de ramas del remoto. Desactiva
   all/tags/prune/prune-tags/submódulos/mantenimiento y escritura de FETCH_HEAD.
4. Revisa hashes congelados, cantidades direccionales y hasta 100 commits
   entrantes. Fecha del Fetch explícita: no se promete que el servidor siga igual.
5. Confirmar integración: consume una revisión del backend asociada al repositorio
   y comprueba la huella de configuración/refs/árbol/índice/HEAD y el hash seguido.
   Integra el hash revisado sin otro contacto al servidor.
6. Reutiliza el motor de merge local: fast-forward directo o `ort` divergente
   detenido antes del commit. Resolver/continuar/abortar desde Ramas, incluso tras
   reiniciar. No ejecuta `git pull`, no hereda `pull.rebase` ni opciones de merge
   que favorezcan silenciosamente una versión.

## Integridad

- Autorización, repositorio activo y bloqueo global de escrituras comprobados
  dentro de cada worker que realiza Fetch/integración. Los planes de push se
  invalidan al revisar Pull o integrarlo.
- Cada nueva revisión descarta la anterior, incluso si Fetch falla. El plan de
  integración se consume al intentar usarlo; fallo/token incorrecto exige revisar.
- Abrir otro repositorio o cambiar la autorización descarta el plan guardado.
  Cambios posteriores de configuración, referencias o archivos invalidan su huella.
- Compara configuración y estado local antes/después del Fetch: si cambiaron,
  puede haber referencias actualizadas, pero no se crea una revisión integrable.
- Una rama eliminada o un error de conexión no permite integrar tracking antiguo.
- Rechaza referencias de seguimiento simbólicas antes de contactar al servidor
  para impedir redirigir la actualización hacia una rama local.
- Rutas literales, argumentos separados, protocolos/autenticación no interactiva,
  límites de salida, plazos y contención Windows reutilizados de Remotos.
- Sin stash implícito, descarte, force push, reset forzado ni limpieza de locks.
  La actualización forzada `+` se limita al tracking remoto durante Fetch; no
  reescribe la rama local. Un retroceso remoto se revisa, no fuerza un reset local.
- Hereda los bloqueos de merge para shallow/parciales, worktrees enlazados,
  submódulos, sparse/split index, replace/grafts, autostash, flags ocultos y otras
  operaciones. Los remotos avanzados/heredados/restringidos se conservan sin usar.
- No existe aislamiento completo frente a otros procesos ni rollback de efectos
  de filtros/hooks confiados. Un Fetch interrumpido puede haber actualizado refs:
  inspeccionar el estado antes de repetir. No hay reintentos automáticos.

## Validación

Fixtures con servidor bare local y remoto llamado `equipo`, nunca un servidor
del usuario: Fetch conserva HEAD, índice, archivos, FETCH_HEAD, otra rama remota
y tags locales. Integra el hash revisado aunque el servidor cambie después.
Verifica upstream ausente, tracking simbólico, edición local o cambio de upstream
que invalidan revisión y rama eliminada que bloquea integrar datos antiguos.
Comprueba divergencia con `pull.rebase=true` y `mergeOptions=-Xours` sin aplicar esas
estrategias, conflicto recuperable, aborto y compatibilidad del merge local.

La variante interna que integra hashes revisados no puede deserializarse desde
IPC público: sólo el plan consumido de Pull la construye. Sin autorización, las
opciones no inspeccionan el repositorio y la revisión se rechaza sin ejecutar Git.

Interfaz: apertura sin red, vista inactiva sin consultas, autorización sin Fetch,
dos confirmaciones independientes, upstream ausente, error de Fetch sin revisión
antigua, éxito con fallo de refresco sin repetir la mutación, consumo visual del
plan y navegación accesible hasta Ramas. Fixture visual `dev/pull.html` sintética,
sin Git ni red; inspección inicial a 1280×720. `?missing` simula upstream ausente.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib -- --test-threads=8 --skip changes:: --skip push:: --skip remotes:: --skip process:: --skip trust:: --skip git::
npm test -- --maxWorkers=1
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run tauri build -- --debug --no-bundle
```

Se verifica el conjunto afectado de ramas/merge/Pull, no se repite toda la suite
Rust en este incremento. HTTPS/SSH reales, macOS e instalador firmado Windows
siguen necesitando validación manual; no se presentan como probados por estas fixtures.

Resultado local Windows: 21 pruebas Rust de regresión aprobadas en 465,18 s,
incluida la referencia de tracking simbólica; 62 pruebas de interfaz en nueve
archivos aprobadas. TypeScript/Vite, Clippy con `-D warnings`, formato Rust/Prettier
y `git diff --check` aprobados. Los avisos de hardlinks del caché incremental usan
copia de archivos como alternativa; no son errores de lint del código.

Compilación nativa Windows x64 debug sin bundle aprobada. Los primeros intentos
no pudieron reemplazar `ravengit.exe` porque RavenGit seguía abierto; después de
que el usuario cerró la aplicación y el proceso de desarrollo, la compilación
terminó correctamente. No se cerraron procesos del usuario de forma automática.

Referencia de semántica: [Git fetch](https://git-scm.com/docs/git-fetch) y
[Git for-each-ref](https://git-scm.com/docs/git-for-each-ref).

## Prueba manual sugerida

- Sin upstream: abrir Pull, comprobar bloqueo y que no contacta con ningún remoto.
- Con upstream elegido desde Git: comprobar URL/rama, confirmar Fetch y verificar
  que archivos y rama activa no cambian; inspeccionar los commits y confirmar merge.
- Generar divergencia/conflicto en un repositorio de prueba: gestionar desde Ramas,
  cerrar/reabrir, resolver y continuar o abortar. No usar el repositorio principal.
- Editar un archivo o cambiar el upstream después de revisar: la integración debe
  rechazarse y exigir revisar de nuevo, conservando el contenido local.
