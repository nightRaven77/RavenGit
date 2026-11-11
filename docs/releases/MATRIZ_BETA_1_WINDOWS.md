# Matriz funcional instalada · 1.0.0-beta.1 · Windows x64

Guía de ejecución en una **instalación limpia Windows x64**, preparada el 30/10/2026 y actualizada para el candidato recompilado el 02/11/2026. **Pendiente de ejecutar**: no hereda aprobaciones de otros equipos ni de macOS. Complementa el [plan de beta](PLAN_BETA_1.md); no cierra requisitos de v1 por sí sola.

## Entrega y alcance

Copiar por un medio privado autorizado el instalador, estas instrucciones, la [plantilla de resultados](../validacion/PLANTILLA_MATRIZ_BETA_1_WINDOWS.md) y las [notas del candidato](1.0.0-beta.1.md). No hace falta copiar el checkout, `.git`, perfiles, credenciales, `node_modules` ni `target`. No publicar el paquete para realizar esta prueba.

El instalador de origen está en `src-tauri/target/release/bundle/nsis/RavenGit Beta_1.0.0-beta.1_x64-setup.exe`; copiar ese archivo concreto, no toda la carpeta. Conservar la estructura `docs/releases/` y `docs/validacion/` para los documentos entregados. Los enlaces a alcances avanzados requieren acceso a esos documentos: si se entregan sin checkout, incluir sólo las referencias necesarias revisadas/sanitizadas, manteniendo sus rutas. Si falta una referencia necesaria para preparar un caso avanzado, registrarlo bloqueado; no sustituirla por una aprobación histórica.

El candidato local actual, compilado el 02/11 desde `2858663`, tiene estos identificadores:

| Dato | Valor esperado |
| --- | --- |
| Instalador | `RavenGit Beta_1.0.0-beta.1_x64-setup.exe` |
| SHA256 del instalador | `BECC17A70E93AF6E36BF93C6B5A60E606996C4E487E2D94F185BF6CBDBC358D9` |
| Producto / versión | `RavenGit Beta` / `1.0.0-beta.1` |
| Perfil | `dev.ravengit.beta`, separado de `dev.ravengit.desktop` |
| Firma de este candidato | Sin firma digital (`NotSigned`) |
| Base de fuente | `2858663`; identificación del artefacto por hash, sin tag publicado |
| Evidencia de origen | [Regresión y build del 02/11](../validacion/Compilacion_previa_v1_Windows_2026-11-02.md) |

El candidato del 30/10 con SHA256 `E55800A24F1F7D52BC33E53EA3CC1E0BB983D81BF17752B75AA0998B38C61D31` es histórico y no debe sustituir al actual. La firma, un nuevo empaquetado o una recompilación cambian el hash. Si difiere, detenerse: identificar y documentar el nuevo candidato antes de probarlo. El hash de origen es una referencia de integridad, no una firma de confianza.

## Precondiciones y orden

1. Registrar Windows/compilación, x64, RAM, espacio libre, escala de pantalla, resolución, versiones de Git y WebView2, y si es PC o VM. Usar un usuario de prueba sin datos reales, fuera de la redirección de Codex y con carpeta local fuera de OneDrive/red. No declarar una versión mínima de Windows/Git basándose en una sola máquina.
2. Guardar un snapshot de VM o respaldo del entorno. Usar sólo carpetas nuevas; no sobrescribir ni limpiar perfiles existentes. Si ya hay beta/perfil, clasificar como **actualización**, no instalación limpia, o usar otro usuario/VM.
3. Para ejecutar la aplicación instalada bastan Git en PATH y WebView2. Node/npm, Rust, Cargo y Visual Studio son herramientas de compilación y **no son requisitos del usuario final**. No repetir el build para validar este instalador.
4. Comprobar el SHA256 antes de abrir el instalador (`Get-FileHash -Algorithm SHA256 -LiteralPath 'RUTA_DEL_INSTALADOR'`) y registrar firma (`Get-AuthenticodeSignature -LiteralPath 'RUTA_DEL_INSTALADOR'`). Los comandos de esta guía se ejecutan en PowerShell, no dentro de formularios de la app.
5. Ejecutar I-01–I-04 antes de las funciones. No saltar un fallo de versión, hash, aislamiento, Git ausente o arranque. Si una dependencia falta, registrar el bloqueo y su instalación/reanudación por separado.
6. Ejecutar las filas locales con fixtures independientes. Continuar tras un fallo sólo en otra fixture intacta; ante pérdida de datos, estado incierto, lock o recuperación pendiente, detener esa fixture, conservarla y registrar el defecto. No borrar locks/registros, hacer `reset --hard` ni repetir una mutación de resultado desconocido.
7. Completar los bloques de recuperación, accesibilidad/rendimiento, transporte y distribución, o marcarlos explícitamente pendientes/bloqueados. No confundir **no ejecutado** con aprobado.

Git/OpenSSH/sistema gestionan autenticación. No cambiar TLS, claves conocidas, agentes ni configuración global para hacer pasar un caso. El operador autoriza operaciones de cada fixture desde la puerta de confianza de RavenGit; no se elude la confianza por ruta ni las revisiones de un solo uso.

## Fixtures locales reproducibles

El bloque siguiente es **preparación futura**, no evidencia de ejecución. Crea commits y ramas únicamente dentro de carpetas nuevas de prueba cuando el operador lo ejecute. No ejecutarlo en repositorios del usuario. Usar PowerShell con Git disponible y una cuenta de prueba cuya configuración Git no contenga filtros, reescrituras de URL ni credenciales heredadas. No exportar esa configuración al informe.

Cambiar sólo la carpeta raíz por una ubicación local nueva si es necesario. No reutilizar la raíz de una ejecución anterior. El bloque rechaza destinos existentes y comprueba cada salida Git. Los hooks y la firma se desactivan **sólo en las fixtures** para que el recorrido básico no dependa de herramientas personales; los casos de hooks se ejecutan aparte.

```powershell
$ErrorActionPreference = 'Stop'
Get-Command git -ErrorAction Stop | Out-Null
$qaRoot = Join-Path $env:LOCALAPPDATA ('RavenGit-QA-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $qaRoot) { throw 'La raíz de pruebas ya existe.' }
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$qaTemplate = Join-Path $qaRoot 'empty-template'
New-Item -ItemType Directory -Path $qaTemplate | Out-Null

function Invoke-QaGit {
    param([string]$Repo, [string[]]$GitArgs)
    & git -C $Repo @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Git falló; código $LASTEXITCODE. Detener esta fixture." }
}

function New-QaFixture {
    param([string]$Name)
    if ($Name -notmatch '^[a-zA-Z0-9-]+$') { throw 'Nombre de fixture inválido.' }
    $repo = Join-Path $qaRoot $Name
    if (Test-Path -LiteralPath $repo) { throw 'La fixture ya existe; no se sobrescribe.' }
    New-Item -ItemType Directory -Path $repo | Out-Null
    Invoke-QaGit $repo @('init', '--quiet', '--initial-branch=main', "--template=$qaTemplate")
    Invoke-QaGit $repo @('config', '--local', 'user.name', 'RavenGit QA')
    Invoke-QaGit $repo @('config', '--local', 'user.email', 'qa@example.invalid')
    Invoke-QaGit $repo @('config', '--local', 'commit.gpgsign', 'false')
    Invoke-QaGit $repo @('config', '--local', 'tag.gpgsign', 'false')
    Invoke-QaGit $repo @('config', '--local', 'core.hooksPath', '.git/qa-empty-hooks')
    Invoke-QaGit $repo @('config', '--local', 'core.autocrlf', 'false')
    New-Item -ItemType Directory -Path (Join-Path $repo '.git/qa-empty-hooks') | Out-Null
    [IO.File]::WriteAllText((Join-Path $repo '.gitignore'), "ignorado.tmp`n")
    [IO.File]::WriteAllText((Join-Path $repo 'conflicto.txt'), "base`n")
    [IO.File]::WriteAllText((Join-Path $repo 'lineas.txt'), ((1..40 | ForEach-Object { "linea $_" }) -join "`n") + "`n")
    [IO.File]::WriteAllText((Join-Path $repo 'borrar.txt'), "contenido recuperable`n")
    Invoke-QaGit $repo @('add', '--all')
    Invoke-QaGit $repo @('commit', '--quiet', '-m', 'Base QA')
    Invoke-QaGit $repo @('branch', 'incoming')
    [IO.File]::WriteAllText((Join-Path $repo 'conflicto.txt'), "local`n")
    Invoke-QaGit $repo @('add', 'conflicto.txt')
    Invoke-QaGit $repo @('commit', '--quiet', '-m', 'Cambio local QA')
    Invoke-QaGit $repo @('switch', '--quiet', 'incoming')
    [IO.File]::WriteAllText((Join-Path $repo 'conflicto.txt'), "entrante`n")
    Invoke-QaGit $repo @('add', 'conflicto.txt')
    Invoke-QaGit $repo @('commit', '--quiet', '-m', 'Cambio entrante QA')
    Invoke-QaGit $repo @('switch', '--quiet', 'main')
    Invoke-QaGit $repo @('switch', '--quiet', '-c', 'linear')
    foreach ($step in 1..6) {
        [IO.File]::WriteAllText((Join-Path $repo "paso$step.txt"), "paso $step`n")
        Invoke-QaGit $repo @('add', "paso$step.txt")
        Invoke-QaGit $repo @('commit', '--quiet', '-m', "Paso $step QA")
    }
    Invoke-QaGit $repo @('switch', '--quiet', 'main')
    Write-Host "Fixture lista: $repo"
}

# Un nombre nuevo por caso/subcaso; se pueden crear más al avanzar.
New-QaFixture 'cambios-01'
New-QaFixture 'merge-continuar'
New-QaFixture 'merge-abortar'
New-QaFixture 'rebase-continuar'
New-QaFixture 'rebase-abortar'
New-QaFixture 'interactivo-01'
New-QaFixture 'stash-01'
New-QaFixture 'replay-01'
Write-Host "Raíz de esta ejecución: $qaRoot"
```

Cada fixture termina en `main`, limpia, con `incoming` divergente por `conflicto.txt` y `linear` con seis commits adicionales. Registrar el HEAD inicial de cada una. Crear nombres nuevos con `New-QaFixture` para repeticiones; **no** volver al estado inicial mediante un reset destructivo. No copiar carpetas de una operación pendiente como preparación de otra.

Contrastes de sólo lectura, sustituyendo `$qaRepo` por la fixture exacta:

```powershell
git -C $qaRepo status --porcelain=v1
git -C $qaRepo rev-parse HEAD
git -C $qaRepo diff --cached --name-status
git -C $qaRepo ls-files -u
git -C $qaRepo for-each-ref --format='%(refname) %(objectname)' refs/ravengit/
```

Comprobar el código de salida de cada consulta. Sólo en las fixtures, registrar hashes/referencias y nombres neutros; no copiar salida de repositorios reales. Comparar índice por hash de `.git/index` cuando la operación deba conservarlo. Revisar además los bytes de los archivos afectados, no sólo el texto del aviso.

## Matriz local

Todos los casos empiezan **pendientes**. Registrar resultado por ID y subcaso con la plantilla. El contraste CLI verifica el efecto de una acción realizada en la **copia instalada**; no sustituye esa acción por Git externo.

| ID | Preparación y pasos en la copia instalada | Resultado exigido / contraste |
| --- | --- | --- |
| I-01 | Instalar el candidato verificado en usuario de prueba sin beta previa. | Nombre/versión correctos, destino por usuario y salida del instalador registrados; no altera la instalación estable. Anotar avisos, elevación y reinicio reales. |
| I-02 | Abrir desde acceso directo y desde el ejecutable instalado, por separado. | Ventana `RavenGit Beta · 1.0.0-beta.1`, icono y controles legibles. Registrar ruta real, hash y firma del ejecutable instalado; no asumir igualdad con el binario previo al bundle. |
| I-03 | Revisar biblioteca/perfil inicial y abrir sólo una fixture. | Perfil beta independiente. No importa biblioteca estable. Si no hay instalación estable en esta máquina, su convivencia queda no ejecutada. |
| I-04 | Cerrar normalmente, abrir, entrar en Repositorios y elegir la fixture. | Entrada persistida y apertura correcta. La pantalla inicial sin selección no implica biblioteca vacía. |
| L-01 | Crear colección, asignar fixture, fijarla, buscar por nombre y reiniciar. | Colección/asignación/fijado persisten; ningún cambio en HEAD, índice o archivos. |
| L-02 | Con beta cerrada, mover una fixture sin operación pendiente a otro directorio nuevo dentro de la raíz QA; usar Localizar carpeta. | Ubicación nueva funciona; no duplica ni pierde metadatos. Comprobar confianza por nueva ruta sin heredar autorización indebidamente. |
| N-01 | Nuevo repositorio en una subcarpeta nueva de la raíz QA; repetir con destino existente. | Nuevo repo sin commits correcto; destino existente rechazado sin sobrescritura. |
| N-02 | Clonar una fixture limpia usando su ruta local absoluta a un destino nuevo; probar también destino existente. | HEAD/árbol del clon correctos, origen conservado, colisión rechazada. No acredita proveedor ni credenciales. |
| H-01 | Abrir `linear` en fixture nueva; revisar grafo, main/incoming, HEAD, búsqueda, selección y diff de Paso 1. | Seis commits sobre main, referencias y archivos exactos; búsqueda sólo sobre lo cargado. Sin escritura en Git. |
| C-01 | Abrir Cambios sin autorizar; luego el operador habilita operaciones sólo en esta fixture y actualiza. | Antes no se inspecciona el árbol ni permite commit; después estado limpio verificado. Revocar y comprobar bloqueo de nuevo. |
| C-02 | En fixture autorizada, editar líneas 2 y 38 de `lineas.txt`, añadir `nuevo-ñ.txt` y eliminar `borrar.txt` sólo allí. Revisar diff y preparar un bloque. | Dos bloques separados; índice incluye sólo el bloque elegido y el resto sigue sin preparar. HEAD intacto. |
| C-03 | Seleccionar dos archivos por teclado y Preparar seleccionados; luego Preparar todos. Quitar preparación individual. | Selección/contador y M/A/D exactos en índice. No incluye archivos no seleccionados ni crea commit. No exigir quitar preparación en grupo. |
| C-04 | Escribir resumen; preparar un archivo; crear commit desde UI. | Un commit con ese contenido exacto, padre esperado, resto sin preparar conservado. Consultar `git show --stat HEAD` y estado. |
| C-05 | Revisar una preparación/commit, editar externamente el archivo antes de confirmar y confirmar la revisión anterior. | Rechazo seguro o invalidación visible; sin commit ni preparación obsoletos. Revisar de nuevo antes de continuar. |
| C-06 | Crear manualmente `.git/index.lock` vacío en una fixture sin procesos Git activos; intentar preparar. | Rechazo, lock conservado y HEAD/índice/archivos intactos. Conservar la fixture; no borrar lock para aprobar el caso. |
| C-07 | En fixture propia con commit de prueba, Reemplazar último commit: revisar/cancelar y después revisar/confirmar mensaje/contenido. | Cancelación intacta; amend cambia sólo lo revisado y conserva referencia de respaldo al HEAD anterior. |
| C-08 | Modificar un archivo seguido, revisar Restaurar y confirmar; revisar Rehacer. Repetir cambiando archivo tras revisar. | Restauración/rehacer sólo de bytes revisados, respaldo disponible; estado obsoleto rechazado sin sobrescritura. |
| B-01 | Crear una rama de prueba, cambiar a ella, renombrarla y volver; probar cambio con archivos que colisionarían. | Referencias y contenido correctos; colisión rechazada sin pérdida, sin reset forzado. |
| T-01 | Crear tag ligero sobre commit seleccionado; repetir nombre y cancelar revisión de publicación. | Tag apunta al hash revisado, duplicado no sobrescrito, cancelar no publica. |
| M-01 | En `merge-continuar`, desde main revisar merge de incoming y ejecutar. Consultar Base/Local/Entrante. | Conflicto real (`git ls-files -u`), HEAD previo conservado, controles de continuación/aborto explícitos. |
| M-02 | Sobre M-01, guardar resolución textual con el editor integrado; antes de preparar comprobar índice; preparar mediante revisión independiente. | Respaldo del contenido previo; guardar no elimina etapas ni finaliza. Preparar elimina sólo etapas del archivo elegido; merge sigue pendiente. |
| M-03 | Antes de terminar M-02, revisar recuperación de respaldo, hacer una edición externa y confirmar revisión anterior; después revisar de nuevo y recuperar. | Rechazo obsoleto conserva edición; recuperación vigente copia bytes actuales y conserva HEAD/índice. Resolver/preparar otra vez y continuar merge explícitamente. |
| M-04 | En `merge-abortar`, iniciar conflicto, cerrar/reabrir desde biblioteca y abortar desde Ramas. | Recuperación visible; aborto restaura HEAD y árbol originales; no quedan etapas ni operación Git pendiente. |
| R-01 | En `rebase-continuar`, cambiar a incoming y rebasarla sobre main; cerrar normalmente en conflicto y reabrir. Resolver/preparar según controles disponibles y continuar. | Rama, respaldo y conflicto persisten; resultado contiene ambos cambios revisados, árbol limpio y sin registro pendiente. No repetir inicio al reabrir. |
| R-02 | Repetir en `rebase-abortar`; abortar tras reabrir en conflicto. | HEAD/rama/contenido originales restaurados; respaldo conservado, sin continuación automática. |
| R-03 | En `interactivo-01`, cambiar a linear y revisar seis commits sobre main: Paso 1 pick, Paso 2 squash, Paso 3 fixup, Paso 4 drop, Paso 5 reword; mover Paso 6 antes de Paso 5. Ejecutar con mensajes explícitos. | Tres commits finales: grupo 1–3, Paso 6, Paso 5 renombrado; sólo `paso4.txt` ausente, árbol limpio y respaldo del HEAD original. |
| R-04 | En fixtures nuevas, repetir interactivo con conflicto para pick/reword/squash/fixup, drop seguido de conflicto, dos pausas y commit recién vacío. Cerrar/reabrir en cada pausa. | Registrar cada variante por separado; mensajes/grupos/omitidos respetados, recuperación/aborto seguros, sin saltos silenciosos. Seguir el [alcance detallado](../validacion/Rebase_interactivo.md). |
| P-01 | Fixture nueva: cherry-pick del commit Paso 1 de linear sobre main; después revert de ese nuevo commit, ambos desde UI. | Primero aparece sólo paso1; revert lo deshace mediante otro commit, conserva historia previa y respaldos. |
| P-02 | Fixture nueva por operación: cherry-pick de incoming sobre main; para revert conflictivo usar main sobre incoming. Cerrar/reabrir en conflicto; probar continuar y abortar en fixtures separadas. | Recuperación explícita para ambos tipos y ambos desenlaces; sin repetir operación, HEAD/árbol finales contrastados. Ver [replay](../validacion/Cherry_pick_revert.md). |
| S-01 | En stash-01, editar/preparar `lineas.txt`, editarlo otra vez, añadir un archivo nuevo y `ignorado.tmp`; guardar primero sin incluir nuevos y, en otra fixture, incluyéndolos. | Revisiones muestran capas y opción exacta; ignorados conservados; HEAD intacto, stash y respaldo creados. |
| S-02 | Fixture nueva sin ignorados/nuevos restantes: guardar cambios con capas y restaurar marcando recuperar preparación; repetir en otra fixture sin marcar. | Bytes correctos en árbol/índice según opción; stash original y respaldo permanecen. Un archivo nuevo/ignorado que obstruya restauración debe provocar rechazo. |
| S-03 | Fixture nueva: guardar cambio a `conflicto.txt`; con árbol limpio cambiar a incoming, restaurar y provocar conflicto. Cerrar/reabrir, resolver/preparar externamente, Actualizar y Finalizar revisión. | Registro persiste y bloquea escrituras incompatibles; entrada/HEAD/respaldo conservados. Finalizar sólo retira registro, sin repetir apply ni commit. No exigir editor integrado para Stash. |
| A-01 | Revisar Actividad, cerrar/reabrir, exportar; comprobar avisos de éxito, cancelación y rechazo. | Persisten campos acotados; exportación sin salida Git, URLs, credenciales ni rutas sensibles. Mensajes se corresponden con el resultado vigente. |
| A-02 | Sólo en perfil de prueba, revisar/cancelar borrado de Actividad; después revisar y confirmar borrado. | Cancelar conserva entradas; confirmar elimina lo revisado; exportación posterior y reapertura permiten comprobarlo. No borrar evidencia externa. |
| X-01 | Repetir apertura, C-02/C-03 y recuperación a 900 × 640; recorrer con Tab/Shift+Tab/Espacio/Enter/Escape. | Controles y Cerrar alcanzables, foco visible y resultado anunciado; selección/contador correctos. Registrar todo bloqueo de teclado. |
| X-02 | Repetir a 100 %, 150 % y 200 % con lector de pantalla Windows real; registrar versión. | Sin controles críticos recortados; nombres/estados/errores/foco anunciados correctamente. AX o screenshot por sí solos no aprueban lector real. |
| X-03 | Fixture de escala separada: 300 y luego 3.000 archivos modificados/nuevos; historial de 5.000 commits preparado aparte. Medir carga, búsqueda, scroll y selección. | Registrar tiempos, RAM y tamaño/forma de fixture; UI responde y datos correctos. Sin presupuesto de rendimiento acordado, informar mediciones sin declarar cumplimiento de límite. |
| X-04 | Con WebView2 ya presente y red desconectada voluntariamente, repetir apertura/historial/preparación/commit en fixture. | Flujo local funciona sin red; registrar qué se ejecutó. No extrapolar instalación offline sin WebView2. |

Para P-02 revert conflictivo: en main, el commit local cambia `base` a `local`; en incoming el archivo contiene `entrante`. Seleccionar el commit local de main para revertir sobre incoming. Cada combinación continuar/abortar usa una fixture nueva. Para R-04 y X-03, describir en el informe la preparación adicional exacta, base/HEAD y contenido esperado; si no se preparó y ejecutó una variante, dejarla pendiente.

## Transporte, fallos y distribución

| ID | Procedimiento | Criterio y límite |
| --- | --- | --- |
| E-01 | Crear un bare local nuevo dentro de QA, clonar dos clientes desechables, configurar identidad sólo local. Desde UI revisar/publicar una rama; desde el otro cliente crear un commit y publicarlo al bare; desde UI Fetch, revisar Pull y confirmar merge. | Hash del destino igual al revisado, Fetch no integra ni altera HEAD/índice; Pull integra sólo el hash revisado. Todo tráfico queda en disco local. No usar `--mirror`, force ni publicar refs/ravengit. |
| E-02 | Con esos clientes, crear divergencia y cambiar el destino después de revisar Push; revisar/cancelar y publicar un tag de prueba al bare. | Revisión obsoleta rechazada, rama ajena intacta y sólo tag seleccionado enviado. Verificar refs del bare antes/después. |
| E-03 | Por cada proveedor/cuenta/protocolo de prueba elegido (SSH y HTTPS), identificar remoto desechable exacto, rama permitida y autorización de lectura/publicación antes de conectar. Probar éxito, falta de permisos y credencial/servicio no disponible en entorno controlado. | Informe separado por combinación y recorrido real UI; diagnóstico del agente no prueba identidad ni permiso. Sin remoto autorizado queda bloqueado. Nunca enviar credenciales por HTTP ni alterar host/TLS para pasar. |
| E-04 | En perfil de prueba, crear/editar perfiles SSH y aplicar sólo a descarga, sólo a publicación y a ambas; revisar diagnóstico y copia sanitizada. | Configuración efectiva concuerda con destino revisado; errores liberan controles; no registra claves/salida privada. Para certificar múltiples identidades, contrastar cada cuenta real; un alias no basta. |
| F-01 | Fixture nueva por operación: cerrar sólo el proceso instalado de RavenGit durante conflicto pausado de rebase o Stash; reabrir y revisar recuperación antes de actuar. | Estado/respaldos conservados y controles compatibles; continuar/abortar según operación. Stash no ofrece aborto automático. Registrar PID/momento y estado real; no matar Git ajeno. |
| F-02 | Cortes durante checkout, stash push/apply o escritura de registro: únicamente con plan de inyección controlado, fixture nueva y snapshot. | Un cierre en pausa no acredita estas ventanas. Si no puede demostrarse el punto del corte, caso pendiente. Locks/estados parciales deben impedir repetición insegura; no borrarlos ni forzar recuperación. |
| F-03 | En fixtures separadas, configurar hook de rechazo y de espera, fallo de lectura/escritura por permisos y archivo ocupado. | Registrar configuración local y error real, contenido/índice/HEAD antes/después, respaldo y recuperación. Fallo simulado no acredita disco lleno físico, corte eléctrico o ACL completa. No llenar disco del usuario ni modificar permisos fuera de QA. |
| D-01 | En snapshot/usuario nuevo con WebView2 realmente ausente, ejecutar instalación con red disponible; en otro snapshot repetir sin red. | Registrar instalación/descarga o rechazo recuperable y su mensaje; no desinstalar WebView2 de uso compartido para fabricar el caso. Si ya está presente, bloqueado. |
| D-02 | Con instalador anterior identificado por hash y perfil beta de prueba con colección/fixture guardadas, instalar candidato nuevo y reabrir. | Versión/hash nuevos, biblioteca/configuración y fixture intactos. Mismo hash reinstalado sólo acredita reinstalación; comparar candidatos 29/10 y 30/10 acredita cambio de paquete de misma versión, no migración entre versiones. |
| D-03 | Al acabar, cerrar beta, desinstalar desde Windows, comprobar accesos/ejecutable y destino; reinstalar candidato y comprobar comportamiento del perfil retenido/eliminado. | No toca repositorios QA ni versión estable; registrar qué configuración conserva y cualquier opción de eliminación elegida. Respaldo antes de borrar datos del perfil. |

E-01/E-02 requieren preparación explícita de los bare/clientes y commits adicionales **sólo dentro de QA**. Comprobar cada comando Git como en el generador y registrar nombres/hash iniciales. Se pueden usar `git init --bare --initial-branch=main`, `git clone` y Push normal a la ruta local absoluta. No apuntarlos a remotos reales. Los pasos E-03/E-04 no están autorizados por compartir esta guía: los ejecuta el operador con los destinos y permisos concretos de esa sesión.

Referencias para los casos avanzados: [conflictos](../validacion/Editar_conflictos.md), [respaldos](../validacion/Recuperar_respaldos_conflictos.md), [Stash](../validacion/Stash_recuperable.md), [rebase](../validacion/Rebase_interactivo.md), [cortes Windows](../validacion/Corte_checkout_Windows_2026-10-29.md), [hooks/almacenamiento](../validacion/Recuperacion_hooks_almacenamiento_Windows_2026-10-29.md), [SSH](../validacion/Cuentas_SSH.md). Son evidencia/alcance histórico, no aprobaciones de la nueva máquina.

## Registro y cierre

Copiar la plantilla a un registro nuevo por máquina/fecha, con identificador neutro. Copiar todas las filas/variantes ejecutadas con sus IDs; no sobrescribir evidencia del 29/10 o 30/10. Adjuntar sólo capturas/logs breves sanitizados de la copia instalada y contrastes de fixtures.

Resultados admitidos: **Aprobado**, **Fallido**, **Bloqueado** (precondición y responsable/acción), **Pendiente**. Una variante no ejecutada queda pendiente aunque otra del mismo ID pase. Contar casos y subcasos de forma explícita; no sumar las 495 pruebas automatizadas del origen como pruebas de la nueva máquina.

El cierre debe distinguir: instalación limpia, funciones locales, transporte por proveedor/cuenta, recuperación por ventana de fallo, accesibilidad/rendimiento y actualización/desinstalación. Cualquier pendiente conserva abierta su puerta del plan. Un recorrido parcial puede entregarse con límites; **no declara beta cerrada, v1 estable, firma ni publicación**. Al terminar, conservar fixtures fallidas y respaldos hasta revisar los resultados; su limpieza es una acción posterior del operador.
