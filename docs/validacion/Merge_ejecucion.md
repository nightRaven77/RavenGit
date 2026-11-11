# Merge local: ejecución y recuperación

Fecha: 2026-10-21. Continuación de la revisión local de RG-05. No cierra RG-05
completo ni AC-05, cuyo criterio exige rebase con recuperación.

## Flujo implementado

1. Ramas → Revisar merge: origen local, destino activo y hashes explícitos.
2. Confirmar merge: vuelve a revisar la huella y ambos hashes bajo el bloqueo
   global de escrituras. Invalida la revisión de push pendiente.
3. Fast-forward usa `--ff-only` y verifica HEAD; no crea un commit de merge.
4. Divergencia usa `ort`, `--no-ff`, `--no-commit`, sin squash/autostash/rerere
   automático ni `branch.<destino>.mergeOptions` heredadas. Se detiene para revisar
   incluso cuando no hay conflictos; no modifica la configuración guardada.
5. Ramas detecta MERGE_HEAD y ofrece recuperación tras cerrar/reabrir. Admite
   también un merge estándar iniciado desde Git, si supera las mismas restricciones.
6. Resolver: editar en un editor externo, guardar, actualizar el merge y marcar
   el archivo como resuelto. Sólo prepara la ruta elegida, incluida su eliminación.
   Rechaza marcadores de conflicto comunes, NUL, binarios, enlaces, directorios y
   archivos mayores de 2 MiB. Es una comprobación conservadora, no un validador
   semántico de la resolución. Los casos avanzados se preparan desde Git.
7. Continuar: exige cero conflictos, autor configurado, mensaje y ausencia de
   cambios sin preparar/archivos sin seguimiento. Crea un commit con el índice
   completo y verifica sus dos padres y la desaparición de MERGE_HEAD. Hooks y
   firma configurada siguen vigentes. Los diffs se inspeccionan desde Cambios.
8. Abortar: exige una confirmación explícita de posible pérdida de resoluciones,
   usa sólo `git merge --abort` y verifica HEAD y la salida de la operación.

## Integridad y límites

- Confianza persistente obligatoria; sin descargas implícitas ni conexiones nuevas.
- Inicio sólo con árbol e índice limpios, HEAD en rama local y ancestro común.
- Valida las rutas de ambos árboles antes de iniciar, incluidos sus antecesores
  existentes, para bloquear enlaces/junctions que redirijan escrituras fuera del repositorio.
- Rechaza repositorios shallow/parciales, submódulos del índice o del origen,
  worktrees enlazados, sparse/split index, replace/grafts, flags que ocultan cambios,
  locks, autostash y operaciones simultáneas conocidas.
- La recuperación vincula huella de archivos/índice/HEAD con MERGE_HEAD, ORIG_HEAD
  y MERGE_MSG. ORIG_HEAD debe coincidir con HEAD antes de continuar o abortar.
- Una edición externa invalida la huella: es necesario Actualizar merge antes de
  preparar. Un error descarta la revisión visual y no repite la mutación.
- Plazo de procesos de 60 segundos; se conserva la contención Windows existente.
  Un resultado incierto exige inspección, no reintento automático.
- No hay reset forzado, clean, stash implícito, force push ni eliminación de locks.
- Git no ofrece aislamiento completo frente a procesos externos o efectos de
  filtros/hooks confiados. Abortar no promete conservar ediciones realizadas durante
  la operación ni revertir efectos externos; guardar aparte lo necesario antes.
- No incluye editor visual de tres paneles, resolución binaria/enlaces desde la UI,
  rebase, cherry-pick, octopus, integración remota ni pull automático.

## Pruebas

Fixtures Git reales: fast-forward, conservación de ignorados, divergencia sin
conflictos detenida antes del commit, conflicto UTF-8 con resolución y dos padres,
recuperación con nueva identidad de repositorio, token obsoleto, eliminación,
hook de commit fallido conservando MERGE_HEAD, aborto con restauración de archivos,
ORIG_HEAD modificado y locks sin eliminar.
La comprobación Windows adicional construye una junction ignorada hacia otro
fixture y exige rechazar el merge sin crear ni alterar archivos en ese destino.

Interfaz: revisar sin escribir, confirmar exactamente una vez, éxito con fallo de
refresco sin repetir, error sin reintento, lectura de merge existente, preparación
de una sola ruta, continuación condicionada, consentimiento de aborto invalidado
al refrescar y restricciones que deshabilitan acciones.

La fixture visual `dev/branches.html?merge` usa datos sintéticos y rechaza todas
las mutaciones. No se ejecutan merges en el repositorio de trabajo para probar.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --offline -- --test-threads=8
npm test -- --maxWorkers=1
npm run build
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Referencias de comportamiento: [Git merge](https://git-scm.com/docs/git-merge) y
[Git add](https://git-scm.com/docs/git-add). La comprobación automática no sustituye
la validación manual en macOS ni el empaquetado/instalación de Windows.

La interfaz pasa 52 pruebas en ocho archivos. Una repetición paralela durante
compilación y pruebas Rust tuvo dos fallos de temporización en App; la repetición
completa con un worker pasó sin cambiar ni relajar los tests.

La suite Rust completa pasó 70 pruebas, con un entrypoint auxiliar Windows
ignorado intencionadamente, en 802,28 s. Después de las comprobaciones adicionales
de rutas y opciones heredadas, la reejecución final filtrada `merge` pasó sus
10 pruebas en 293,43 s, incluida la junction Windows y la configuración `-Xours`
heredada sin aplicarla silenciosamente. No se volvió a ejecutar la suite completa
tras esas últimas comprobaciones; se reejecutó el conjunto afectado.

Build TypeScript/Vite, formato Rust/Prettier, `git diff --check` y Clippy con
`-D warnings` aprobados. Compilación nativa Windows x64 debug sin bundle aprobada;
no se generó instalador ni se validó firma. Inspección visual de recuperación con
datos sintéticos a 1280×720, sin ejecutar operaciones Git desde el navegador.
