# RavenGit · revisión de progreso y viabilidad Windows

Fecha: 21 de octubre de 2026. Base: código 0.4.2, HEAD `eb290f7`. Estado: evaluación inicial; Windows todavía no validado. Esta revisión antecede a la siguiente fase funcional de ramas.

Este documento conserva el diagnóstico inicial. El avance posterior de procesos, fixtures y suites está en [Windows_estabilizacion.md](Windows_estabilizacion.md); los datos de entorno y pendientes originales no representan por sí solos el estado actual.

## Dictamen

Es viable continuar con Tauri 2 + React/TypeScript + Rust para Windows y macOS. Windows ya es un objetivo de los documentos aprobados. La separación UI → IPC → Rust → Git CLI permite conservar una base común; no se encontró una dependencia de producción exclusivamente macOS que exija cambiar el stack. Esto es una conclusión de inspección, no una compilación Windows exitosa.

## Progreso frente a las bases

| Área | Entregado en código/documentación de validación | Pendiente de aceptación |
| --- | --- | --- |
| Lectura local | Apertura, historial paginado, grafo virtualizado, refs, inspección y diff de merges | Flujo nativo en ambos sistemas, benchmark de 100 000 commits y accesibilidad completa |
| Trabajo local | Confianza explícita, estado, stage/unstage completo y por bloque, commit inicial/normal, huellas y locks | Validación Windows, checkout/creación de ramas y recuperación de operaciones avanzadas |
| Transporte | Configuración de remotos, consulta, fetch explícito y push normal con revisión | HTTPS/SSH con proveedores reales, credenciales por sistema y cuentas/API |
| Estabilización 0.4.2 | Ejecutor compartido, límites/deadlines, bloqueo de lazy fetch y correcciones UI | Terminación de descendientes Windows y pruebas equivalentes |
| Producto completo | Base visual y arquitectura aprobadas | Persistencia de workspaces, clone/pull, merge/rebase, conflictos, distribución y firma |

Las versiones 0.1–0.4.2 son incrementos de implementación, no equivalen a los hitos M0–M3 cerrados. M0 mantiene criterios abiertos; M1 tiene lectura implementada sin aceptación multiplataforma y M2 tiene entregas parciales. El informe 0.4.2 registra 49 pruebas Rust, 34 Vitest, Clippy y build macOS arm64 aprobados; esos resultados son evidencia histórica de macOS y no se ejecutaron nuevamente en esta revisión.

## Entorno Windows inspeccionado

| Componente | Evidencia local |
| --- | --- |
| Node / npm | Node v24.14.0; npm 11.9.0 |
| Git | 2.56.0.windows.2, accesible en PATH |
| Rust / Cargo | No resueltos en PATH; tampoco se encontró contenido en la ubicación habitual `C:/Users/erick/.cargo/bin`. No se afirma ausencia en toda la máquina. |
| Microsoft C++ Build Tools | `vswhere` con requisito `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` devuelve Visual Studio 18 BuildTools. SDK y enlace efectivo pendientes de compilación. |
| WebView2 | Carpeta de runtime 155.0.4283.62 detectada; ejecución nativa pendiente |
| Dependencias frontend | `node_modules` ausente en este checkout |
| Sistema | Registro: DisplayVersion 26H2, build 26300. ProductName informa Windows 10 Pro; no se usa ese nombre para fijar compatibilidad mínima. |

No se instalaron toolchains ni dependencias ni se modificó configuración del sistema. No se ejecutaron build, tests ni instaladores: falta preparar las dependencias frontend y disponer de Rust/Cargo. No existe `.github/` en esta base, por lo que tampoco hay evidencia de CI multiplataforma en el repositorio.

## Hallazgos de portabilidad

1. **Procesos y timeout — prioridad alta.** `src-tauri/src/process.rs` termina el grupo de procesos sólo bajo `cfg(unix)`. En Windows mata el hijo directo y evita esperar indefinidamente los lectores, pero auxiliares pueden seguir vivos y conservar pipes/hilos. Incorporar contención de descendientes mediante Job Objects o solución equivalente, con pruebas de hooks/filtros/helpers y presupuesto de ejecución. Sus tres pruebas actuales están dentro de `cfg(all(test, unix))`: una suite verde en Windows omitiría esa cobertura.
2. **Fixture incompatible — prioridad alta para ejecutar la suite.** `initial_commit_and_unstage_new_literal_path` en `changes.rs` crea `:(glob)* ü\n.txt`, nombre con caracteres incompatibles con archivos Windows normales. Separar cobertura Unix de nombres extremos y conservar un fixture Windows con Unicode, espacios y caracteres admitidos; añadir pruebas de rechazo de rutas inválidas. No basta con omitir toda la prueba sin reemplazar sus garantías.
3. **Índice y archivos — verificación requerida.** `IndexTransaction::install` cierra el handle antes de renombrar el lock sobre el índice, una base favorable. Verificar reemplazo del índice existente, permisos, archivo ocupado y limpieza en fallos sobre NTFS. No se ha demostrado un fallo de `fs::rename`; no cambiarlo por borrar/copiar sin evidencia, porque perdería garantías.
4. **Rutas — verificación requerida.** Se usa `Path`/`PathBuf` y canonicalización. Probar unidades, espacios, Unicode, rutas largas, UNC y prefijos extendidos; verificar interoperabilidad con Git for Windows y contención frente a junctions/enlaces. La prueba de escape mediante symlink existente es Unix. Los remotos locales absolutos se aceptan mediante `Path::is_absolute`; comprobar además la distinción entre ruta de unidad y sintaxis SSH antes de ampliar formatos.
5. **CRLF y configuración Git — verificación requerida.** Ejecutar staging completo/parcial y commit con `core.autocrlf` activado y desactivado y `.gitattributes` explícitos. Comparar blobs/índice con Git, no sólo diff visual. Los fixtures heredan parte de la configuración Git del equipo; registrar y controlar esa configuración sin modificar la global.
6. **Credenciales y auxiliares — verificación requerida.** Comprobar Git Credential Manager y agente SSH desde la aplicación iniciada fuera de una terminal. La política de acceso no interactivo debe conservarse; no almacenar tokens ni desactivar comprobaciones de host/TLS. Revisar ventanas de consola de los procesos Git: `windows_subsystem` en el binario principal no configura por sí solo la creación de cada proceso hijo.
7. **Interfaz y paquete — verificación requerida.** La UI contempla Segoe UI y Ctrl/Meta+O, y ya existe icono ICO. Probar WebView2, diálogo de carpetas, foco, teclado, escalado 100/150/200 % y avisos de error. `bundle.targets = "all"` no acredita instaladores comprobados; comenzar con un formato explícito para aislar fallos.

## Secuencia de viabilidad antes de ramas

Objetivo inicial propuesto: Windows x64 nativo con toolchain MSVC y Git instalado por el usuario; ARM64 y versiones mínimas quedan pendientes de decisión y evidencia.

1. Preparar Rust estable MSVC, comprobar SDK/C++ y ejecutar `npm ci`. Registrar `rustc -Vv`, `cargo --version`, Git, Node y runtime WebView2. Descargar dependencias Rust en la primera ejecución; `--offline` sólo después de poblar la caché.
2. Ejecutar `npm run build`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml` y `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`. Corregir incompatibilidades de fixtures y código con evidencia, conservando cobertura macOS.
3. Resolver y probar la contención de procesos Windows y completar fixtures de rutas, CRLF, locks y reemplazo de índice. Todos los cambios Git de prueba deben usar repositorios temporales, nunca el repositorio de trabajo del usuario.
4. Compilar con `npm run tauri build -- --debug --no-bundle` y verificar en la aplicación: abrir → historial → diff → autorizar → stage/unstage → commit → fetch/push contra bare local. Comprobar hooks fallidos, timeout y refresco posterior sin repetir escrituras.
5. Generar un instalador NSIS explícito con `npm run tauri build -- --bundles nsis`; validar instalación, arranque desde acceso directo, detección de Git/WebView2 y desinstalación sin afectar repositorios. Firma y canal de distribución siguen pendientes antes de distribución pública. MSI puede evaluarse después.
6. Registrar resultados por plataforma y añadir CI Windows/macOS para build y pruebas automáticas. La CI no sustituye el flujo nativo, credenciales ni instalación limpia.

## Condición de salida

Viabilidad Windows confirmada cuando exista build nativo, suites con cobertura Windows explícita, pruebas de integridad de índice/archivos/refs, timeout con auxiliares contenidos y smoke nativo reproducible. El primer instalador necesita evidencia en un entorno limpio. Hasta entonces, conservar la etiqueta «Windows pendiente de validación» y no declarar cerrado M0 ni el MVP. Benchmark, accesibilidad completa y proveedores reales siguen abiertos aunque pase este spike.

## Fuentes

Base interna: `docs/producto/01_Vision_y_requisitos.md`, `docs/producto/02_Analisis_de_arquitectura.md`, `docs/producto/03_Especificacion_UX.md`, informes de `docs/validacion/` y código 0.4.2.

Documentación oficial consultada el 21 de octubre de 2026: [requisitos Tauri para Windows](https://v2.tauri.app/start/prerequisites/) y [instaladores Windows](https://v2.tauri.app/distribute/windows-installer/). Tauri requiere herramientas C++ y WebView2; su empaquetado ofrece NSIS y MSI. La documentación señala un requisito adicional de VBScript para generar MSI. Estas fuentes acreditan posibilidades del framework, no soporte verificado de RavenGit.
