# RavenGit · estabilización Windows antes de merge

Fecha: 21 de octubre de 2026. Alcance: cerrar los pendientes de contención de procesos y portabilidad de fixtures identificados durante la viabilidad y el incremento de ramas. No implementa merge ni certifica distribución pública.

## Contención de procesos

El ejecutor compartido crea un Job Object exclusivo por invocación en Windows, con `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Inicia el hijo con `CREATE_SUSPENDED | CREATE_NO_WINDOW`, lo asigna al job y sólo entonces reanuda su hilo inicial. La consulta del hilo usa una captura de los hilos del proceso hijo mediante Process Snapshotting; no recorre los hilos de todo el equipo ni clona su memoria.

La captura obtiene los identificadores de hilos. Sus fechas reales de creación se consultan mediante `GetThreadTimes` para identificar el hilo inicial, conservando su handle hasta reanudarlo; no se presupone un orden de enumeración ni se interpretan campos de contexto que no se hayan solicitado.

Se vuelve a verificar que cada handle pertenezca al proceso hijo para evitar reutilización de identificadores. Las capturas se liberan antes de reanudar. La reanudación descuenta una sola suspensión: un contador adicional no se interpreta como un error ni se elimina a la fuerza. Los hilos que ya estén ejecutándose o hayan terminado se omiten, sin actuar sobre procesos ajenos. Una regresión con dos suspensiones comprueba que la suspensión restante se conserva.

Si no se puede crear/configurar el job, asignar el proceso o reanudarlo, se rechaza el inicio. Un proceso ya creado permanece suspendido hasta estar contenido; ante un fallo de preparación se termina y se recoge. No hay fallback a ejecución sin contención ni se solicita elevación desde RavenGit.

El deadline se contabiliza desde la entrada al ejecutor, incluida la preparación e intercambio por stdin/stdout/stderr. Al vencer, se termina el job, además del hijo directo. Cerrar el job también termina auxiliares que hayan quedado ejecutándose después de una salida normal o un error de entrada. Los handles del job, capturas, marcadores e hilos usan liberación automática.

Se conserva Git CLI con argumentos separados y sin shell de aplicación. `CREATE_NO_WINDOW` evita crear una consola para el proceso que inicia RavenGit. La aplicación no es una sandbox para hooks maliciosos: procesos lanzados por servicios externos, herramientas privilegiadas u otros mecanismos fuera del árbol contenido necesitan controles independientes. Terminar Git no revierte efectos anteriores ni confirma por sí solo el resultado de una escritura; sigue siendo obligatorio comprobar el repositorio antes de repetir una operación incierta.

## Fixtures multiplataforma

- El caso de primer commit/stage/unstage conserva el nombre extremo Unix `:(glob)* ü\n.txt`; en Windows utiliza `[literal] ü.txt`, con espacios, Unicode y caracteres significativos para glob. La prueba completa sigue ejecutándose en ambos sistemas.
- Los repositorios temporales fijan `core.autocrlf` localmente para no depender del valor global del usuario. Las pruebas específicas de CRLF comprueban ambos valores y `.gitattributes`, comparando blobs del índice/commit y bytes del árbol de trabajo.
- Las pruebas de hooks de commit, timeout, rechazo local/remoto de push y filtro clean previo a la confianza también se ejecutan en Windows mediante el shell que utiliza Git for Windows. Sólo los permisos ejecutables POSIX mantienen `cfg(unix)`.
- Una prueba Windows crea un junction dentro del fixture hacia otra carpeta temporal controlada y verifica el rechazo de escape, rutas absolutas/de unidad y acceso a `.git`, conservando el archivo exterior.
- No se cambia configuración global de Git, se borran locks ajenos ni se utilizan repositorios personales para provocar fallos.

## Reproducción

Con Node/npm, Git for Windows y Rust MSVC disponibles en PATH:

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --offline -- --test-threads=8
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run tauri build -- --debug --no-bundle
```

En una máquina sin caché Rust, quitar `--offline` para descargar dependencias. `windows-sys` 0.61.2 ya estaba en el lockfile y ahora es una dependencia directa exclusiva de Windows. Se mantiene Rust estable, sin APIs nightly ni scripts de instalación.

## Evidencia

Entorno verificado: Windows x64, Rust 1.99.1 con target `x86_64-pc-windows-msvc`, Git 2.56.0.windows.2, Node v24.14.0 y npm 11.9.0. El PATH de esta sesión no estaba actualizado; para el build Tauri se añadió `C:/Users/erick/.cargo/bin` sólo al proceso de compilación.

| Comprobación | Resultado |
| --- | --- |
| Suite Rust completa, offline, ocho pruebas en paralelo | 62 aprobadas, 0 fallidas y 1 entrada auxiliar ignorada; 487,44 segundos en la ejecución final. También aprobaron los targets de binario y doc-tests sin casos adicionales. |
| Contención Windows | Seis pruebas aprobadas: pipes heredados con padre terminado/vivo, limpieza de descendientes tras éxito, entrada bloqueada, drenado/límite de salida, arranques repetidos de helper/Git y preservación de suspensiones adicionales. |
| Fixtures Git | Primer commit, stage/unstage, commits, hooks, filtros, locks, ramas, remotos, fetch y push pasan en la suite completa. Se comprueban CRLF y blobs normalizados, además de rutas Windows y junctions. |
| Vitest completo | 43 aprobadas en siete archivos; IPC simulado. |
| Clippy all-targets | Aprobado con `-D warnings`. |
| TypeScript/Vite | Build aprobado, también ejecutado como parte del build nativo. |
| Build nativo Windows x64 | Aprobado con `--debug --no-bundle`; genera `src-tauri/target/debug/ravengit.exe`. |
| Formato y diff | `cargo fmt -- --check` y `git diff --check` aprobados. |

El helper de procesos se ejecuta mediante subprocesos del propio binario de pruebas; su entrada marcada `ignored` no es un escenario omitido, sino el punto de entrada utilizado por las pruebas de contención. Las pruebas Git y de procesos se ejecutaron fuera del sandbox con aprobación, sobre fixtures temporales controlados. El compilador informó fallback de hard links a copias en su caché incremental; no impidió compilar ni produjo hallazgos Clippy.

Los dos pendientes técnicos previos a merge —contención Windows y portabilidad de fixtures— quedan cerrados con este alcance. No se publicaron cambios ni se crearon ramas del proyecto; las pruebas utilizaron repositorios temporales controlados.

## Límites que siguen abiertos

Esta estabilización no sustituye pruebas macOS en un equipo macOS, instalación limpia, firma, definición de versiones mínimas, credenciales HTTPS/SSH con servidores reales, rutas UNC/red y largas, accesibilidad con lector de pantalla ni benchmarks del grafo. El flujo nativo completo requiere su smoke correspondiente. M0 y el MVP conservan sus criterios pendientes.

## Referencias primarias

Consultadas el 21 de octubre de 2026: [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject), [PssCaptureSnapshot](https://learn.microsoft.com/en-us/windows/win32/api/processsnapshot/nf-processsnapshot-psscapturesnapshot), [PssFreeSnapshot](https://learn.microsoft.com/en-us/windows/win32/api/processsnapshot/nf-processsnapshot-pssfreesnapshot), [GetThreadTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getthreadtimes) y [ResumeThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread). Las pruebas locales, no la documentación de las APIs por sí sola, acreditan el comportamiento de RavenGit en este entorno.
