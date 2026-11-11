# RavenGit · Validación macOS de los avances del 22 de octubre

Fecha: **22 de octubre de 2026**. Código base: **`374c594`**. Desarrollo **0.4.2**; no es una publicación firmada. El árbol estaba limpio al iniciar. Se revisaron los cambios desde `6533312` y se corrigió únicamente una regresión de prueba, sin cambiar lógica de producción.

## Avances revisados

- `fb4e614`: colecciones y migración v2, inicialización/clonado, destinos y protección de Papelera.
- `dc8efe8`: amend explícito, revisión, autor conservado y respaldo.
- `79ecf98`: identidad propia, búsqueda virtualizada y mejoras de UX/lecturas.
- `e47de37`: tags ligeros, publicación selectiva y diagnósticos sanitizados.
- `374c594`: **sólo planificación de C.2**, preparación múltiple. Preparar todos/seleccionados no están implementados ni se consideran probados.

La revisión se concentró en las fronteras de escritura, contratos IPC, invalidación de revisiones, tipos de referencias y protección de destinos. No constituye una auditoría exhaustiva de seguridad o de todos los cambios línea por línea.

## Entorno y comandos

macOS **27.0.1 (26A434), ARM64**, Git **2.56.0**, Rust/Cargo **1.99.1**, Node **26.11.1**, npm **11.20.0**. Dependencias Rust disponibles en caché; suite ejecutada con `--offline`.

```sh
npm test -- --reporter=dot
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
./node_modules/.bin/prettier --check src scripts index.html
npm run tauri build -- --debug --bundles app
```

| Comprobación | Resultado y alcance |
| --- | --- |
| Interfaz | **196 aprobadas en 21 archivos**, IPC simulado |
| Rust completo | Primera ejecución: 142 aprobadas y 1 fallida; tras corregir expectativa, **143 aprobadas, 0 fallidas**. Targets binario/doc-tests sin casos adicionales |
| Rustfmt / Clippy | Aprobados; Clippy all-targets con advertencias denegadas |
| Prettier | `src`, `scripts` e `index.html` aprobados |
| TypeScript/Vite | Aprobados |
| Bundle debug ARM64 | `src-tauri/target/debug/bundle/macos/RavenGit.app`, 37,71 MiB |
| Identidad empaquetada | ICNS del bundle idéntico al actual de fuentes; SVG presente en distribución. No acredita Dock/Finder, caché del sistema o notarización |

`npm run icons:verify` es una comprobación de recursos de un ejecutable **Windows**; no se ejecutó ni se presentó como validación del binario Mach-O. La verificación macOS compara el ICNS empaquetado y registra su hash.

## Hallazgo corregido

`remotes::tests::failed_local_access_and_existing_config_lock_are_reported` esperaba `REMOTE_CONNECTION` para una ruta local ausente. Los diagnósticos nuevos clasifican ese caso como `RepositoryAccess` y lo exponen como `REMOTE_REPOSITORY`, coherente con el cambio de hoy.

Se actualizó esa expectativa y se añadieron aserciones para que el mensaje no incluya la ruta temporal ni el nombre `missing.git`. Se conservaron las comprobaciones del lock de configuración y de las entradas. La prueba focalizada, la suite completa repetida y Clippy aprobaron. No se debilitó el clasificador ni se ignoró la prueba fallida.

## Pruebas nativas e inspección independiente

Bundle real controlado por accesibilidad macOS, sin mocks, a **1440 × 920**. Repositorios desechables bajo `/private/tmp/ravengit-macos-20261022-uh8wpq13`; único remoto un **bare local** dentro de esa carpeta. No se reescribió RavenGit ni se publicaron ramas/tags del usuario. Hooks y firma deshabilitados sólo en las fixtures. La revisión nativa la realizó un agente independiente de la implementación; hashes, árboles, índice y metadatos se verificaron después mediante lecturas separadas.

### Amend

Se preparó un repositorio con dos commits, `staged.txt` preparado y `unstaged.txt` modificado sin preparar. El autor original difiere del committer configurado. Su main original se publicó sólo al bare local para mostrar la advertencia de referencia remota conocida.

Recorrido: abrir → autorizar → Cambios → Reemplazar último commit → mensaje `Amend validado macOS` → revisar diff y advertencia → confirmar.

- HEAD original: `a0b743e53ec1cf898b98543b09cc1b6245dab8c7`.
- HEAD nuevo: `cdf3b22167aa4b6347b883c5dd989ff6135c94da`.
- Padre conservado: `d77901afc96c80aa19c9f6cecb912c7d0350dd6d`; ascendencia sigue teniendo **2 commits**.
- Autor y fecha del autor conservados; mensaje nuevo correcto; sólo lo preparado se incorporó.
- `unstaged.txt` conservó su contenido modificado en disco y su contenido anterior en el commit; índice coincide con el nuevo commit.
- Respaldo `refs/ravengit/amend/…` apunta al HEAD original. Main del bare local no se reescribió.

Es una aceptación de este flujo raíz/lineal con preparado; errores de firma, revisión obsoleta y otros bloqueos tienen pruebas automatizadas, no recorrido nativo en esta ejecución.

### Tag local y publicación selectiva

Recorrido: crear `macos-validation-20261022` sobre el HEAD nuevo → revisar nombre/hash → confirmar creación → Publicar esta etiqueta → origin del bare local → consultar y revisar estado Nueva → confirmar publicación → consultar otra vez.

Git confirmó que el tag ligero local y remoto apuntan a `cdf3b221…`. El bare sólo contiene main original y ese tag: no se enviaron otras etiquetas ni se cambió la rama. HEAD e índice del origen y el archivo sin preparar quedaron conservados. La reconsulta mostró **Coincide** y no permitió volver a publicar. No se creó una release ni se usó GitHub CLI.

No certifica autenticación, permisos, hooks o redes de GitHub/GitLab/Gitea/Bitbucket reales.

### Inicializar y clonar

Se eligió explícitamente la carpeta temporal `destinations`, sustituyendo el destino predeterminado de la interfaz.

- **native-init:** creación y apertura en main, sin commits, refs ni remotos, sin autor local inventado, sin hooks de plantilla. En su raíz sólo se creó `.git`.
- **native-clone:** clonado y apertura desde `server.git`; main/upstream `origin/main`, HEAD y árbol iguales a main del bare, archivos correctos y árbol limpio. Origin quedó como `file:///private/tmp/…/server.git`, sin alternates de objetos compartidos.
- El clon también recibió el tag publicado: Todas las referencias muestra **3 commits** y la ascendencia de HEAD **2**. La diferencia corresponde a los dos tips divergentes, no a duplicación de commits.

No se probó clonar un proveedor externo, un destino ya existente desde UI, un checkout incompleto ni un fallo nativo de apertura posterior. Los rechazos de destinos y errores están cubiertos por las suites correspondientes.

### Colecciones y persistencia

Crear colección de prueba, asignar/fijar el repositorio del amend, cerrar normalmente y relanzar; abrir Repositorios y verificar pertenencia y fijación. La lectura independiente de `repositories-v2.json` confirmó ID/nombre de colección, pertenencia y pin conservados, junto con entradas separadas para init/clone. Sólo se inspeccionaron los metadatos de estas fixtures.

No se alteraron registros de repositorios ajenos. Tras verificar persistencia se quitaron sólo las tres entradas y la colección de prueba, con confirmación. La biblioteca quedó sin esas entradas/colección; las carpetas Git permanecen en el directorio temporal y no se usó Papelera. Relocalización real, migración nativa desde un perfil de prueba v1, multiinstancia y errores de almacenamiento siguen fuera de este recorrido.

## Revisión de usabilidad

| Heurística | Hallazgo localizado | Severidad / siguiente ajuste |
| --- | --- | --- |
| Estado visible | Carga, resultado, hashes y coincidencia remota visibles | Pasa en recorrido |
| Correspondencia | Autor/committer, etiqueta local/publicada y crear/clonar diferenciados | Pasa |
| Control | Revisión y cierre disponibles antes de ejecutar | Pasa |
| Consistencia | Modales y biblioteca comparten patrón de confirmación | Pasa |
| Prevención | Hash/destino explícitos; Coincide evita republicar | Pasa |
| Reconocimiento | Diff, advertencia y respaldo disponibles en contexto | Pasa |
| Eficiencia | Crear tag enlaza a publicación explícita | Pasa |
| Minimalismo | Amend acumula editor, explicación y revisión; requiere bastante scroll | **Menor:** compactar el editor al mostrar revisión, sin ocultar advertencias |
| Recuperación | Respaldo visible y cambios sin preparar conservados | Pasa en éxito; fallos nativos pendientes |
| Ayuda | Límites cerca de la confirmación | Pasa |

Sin bloqueos ni problemas mayores observados en esos recorridos. La ventana mínima de **900 × 640 no se pudo observar** y no se declara validada. No se convierte una inspección heurística en prueba con usuarios o certificación de accesibilidad.

## Evidencia y pendientes

[Resultados estructurados](MacOS_actual_2026-10-22_resultados.json): entorno, procedencia, checksum del ejecutable/ICNS y **41 comprobaciones independientes** de Git/metadatos. Los hashes corresponden al bundle probado; la modificación local posterior al commit base afecta sólo la prueba de remotos descrita arriba.

Pendientes: Papelera real y restauración desde el sistema, ventana mínima/escalado, lectores de pantalla/teclado completo, errores nativos de almacenamiento/proceso/credenciales, invalidación externa en UI, interrupción forzada, benchmark de 100 000 commits, instalación limpia y firma/notarización. Las pruebas Rust de Papelera usan traslado simulado; que compile `trash` en macOS no acredita su interacción con Finder.

Se conserva la prioridad acordada: C.1 dispone ahora de evidencia nativa local en macOS; quedan proveedores reales y errores nativos por validar. El siguiente desarrollo previsto es **D · stash recuperable**. C.2 sigue planificado sin desplazar automáticamente esa prioridad; releases con `gh` continúa como ampliación posterior.
