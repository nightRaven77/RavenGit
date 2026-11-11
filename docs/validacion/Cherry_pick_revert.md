# Cherry-pick y revert de un commit

Fecha: 2026-10-21. Incremento de RG-05/AC-07; no declara cerrado el MVP avanzado.

## Uso

Seleccionar un commit del historial y pulsar Cherry-pick o Revertir commit. El
diálogo muestra la rama activa de destino; Revisar obtiene hash, asunto, HEAD y
diff (inverso en revert). Confirmar requiere aceptación separada. Cambiar hash,
operación o actualizar descarta la revisión visual. La revisión no simula el
resultado ni predice conflictos. La aplicación sólo acepta hashes completos,
sin opciones, rangos ni secuencias arbitrarias.

Cherry-pick reproduce el cambio con Git; revert crea un commit inverso. Ambos
conservan el historial previo. No se usa reset ni force push. Se admiten commits
de cero/un padre; los merges están bloqueados hasta elegir padre principal en
un flujo futuro. La disponibilidad de la operación no acredita permisos de un
proveedor ni decide si el commit está publicado. No hay contacto de red.

## Precondiciones y ejecución

- Confianza del repositorio antes de inspeccionar archivos/filtros o escribir.
- Rama local activa, HEAD con commit, `user.name` y `user.email` configurados,
  árbol limpio incluidos archivos nuevos. No se inventa el autor.
- Repositorio completo/simple: conserva los bloqueos de merge para clones
  shallow/parciales, worktrees enlazados, submódulos, sparse/split index,
  replace/grafts, flags ocultos, locks y operaciones Git activas.
- Archivos ignorados apartados al iniciar, por la misma restricción conservadora
  de rebase; no se instruye a borrarlos. Respaldar datos aparte cuando corresponda.
- Worker asíncrono bajo bloqueo de escrituras. Verifica repositorio activo y
  confianza, consume plan de un solo uso y recalcula huella/configuración/hash.
  Cambiar repositorio o confianza descarta la revisión. No hay reintentos automáticos.
- Invalida revisiones de Push/Pull/Rebase al revisar/ejecutar. No transmite un
  parche de la interfaz a Git. Usa argumentos separados, ort explícito,
  rerere deshabilitado y sin editor interactivo.
- Antes de ejecutar, guarda `.git/ravengit-replay.json` y confirma una referencia
  `refs/ravengit/replay/…` al HEAD original. La referencia se conserva después.
  El registro pendiente bloquea otras mutaciones ordinarias de ramas/Cambios.

## Recuperación

Cerrar el diálogo conserva el estado en Git. Tras reabrir la aplicación, entrar
en Operaciones de commit. Sólo adopta operaciones iniciadas con registro de
RavenGit; valida marcador CHERRY_PICK_HEAD/REVERT_HEAD, commit, rama original y
respaldo. No admite sequencers multicommit ni operaciones ajenas.

Resolver fuera de RavenGit, guardar, actualizar y marcar por archivo. Texto
UTF-8 hasta 2 MiB sin marcadores y eliminaciones; binarios, enlaces y casos
avanzados se preparan desde Git. Continuar exige conflictos resueltos, autor
configurado y ausencia de archivos nuevos/cambios sin preparar. Se revisan los
diffs en Cambios al cerrar el diálogo. No hay elección automática de versiones.

Un cambio ya aplicado o resultado vacío puede detener Git: no se omite ni se
crea un commit vacío silenciosamente. Revisar desde Git o abortar. Abortar exige
consentimiento por las ediciones que puede descartar. Se comprueba HEAD original
antes de informar aborto confirmado; no se fuerza reset ni se borran locks ajenos.

Si no queda marcador Git pero existe el registro, distingue HEAD original de
un commit nuevo con padre original. Permite retirar sólo el registro tras
confirmación y con árbol limpio, conservando archivos/refs/respaldo. Un registro
inválido, falta de respaldo o historial distinto se deja para inspección desde Git.

Hooks, filtros, controladores de merge y firma configurados siguen siendo
herramientas externas confiadas. No se revierten sus efectos ni hay aislamiento
completo frente a otros procesos. El ejecutor limita salida y plazo a 60 s;
un timeout o resultado incierto exige comprobar Git antes de repetir. El respaldo
conserva commits, no cambios sin commit ni efectos de scripts.

## Verificación

Fixtures Git reales y aisladas: cherry-pick con padre nuevo correcto, origen sin
modificar, revert que restaura el árbol original mediante otro commit, backups,
conflictos y relectura desde disco, resolver/continuar/abortar en ambos tipos,
marcadores no eliminados, confianza, revisiones obsoletas, archivos ignorados,
cambios locales, rechazo de merges y resultado vacío abortable.

UI con IPC simulado: apertura sólo local, revisión y confirmación separadas,
invalidación al editar, consumo tras éxito/error, fallo de refresco sin repetir,
conflicto con continuar bloqueado, consentimiento de aborto y confianza previa.

Resultados macOS ARM64: **88 pruebas Rust y 90 pruebas de interfaz aprobadas**.
Tras normalizar hashes a minúsculas se repitió el conjunto afectado (4 pruebas
Rust con múltiples casos por operación). Clippy con `-D warnings`, Prettier,
formato Rust, `git diff --check`, TypeScript/Vite y bundle debug aprobados.

Prueba nativa con una fixture sin remotos y sin mocks: elegir el commit de feature
desde el historial, autorizar, revisar y confirmar Cherry-pick; elegir el nuevo
commit de main, revisar su diff inverso y confirmar Revert. Se verificaron avisos
y controles en el diálogo. Git confirmó padre original del cherry-pick, padre
cherry-pick del revert, árbol final idéntico al original, rama de origen intacta,
árbol de trabajo limpio y dos respaldos conservados.

Evidencia con hashes y checksum del bundle:
[Cherry_pick_revert_macOS_resultados.json](Cherry_pick_revert_macOS_resultados.json).
Git utilizado: 2.56.0. No se certifican otras versiones de Git por esta evidencia.
Los conflictos, continuación/aborto y relectura del registro se probaron con
fixtures Rust, no mediante reinicio de la aplicación en esta entrega. No se
presentan Windows, firma ni cierre forzado durante escrituras como validados.

```sh
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo test --manifest-path src-tauri/Cargo.toml --offline replay
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
npm test
npm run tauri build -- --debug --bundles app
git diff --check
```

Fuentes: [Git cherry-pick](https://git-scm.com/docs/git-cherry-pick) y
[Git revert](https://git-scm.com/docs/git-revert).
