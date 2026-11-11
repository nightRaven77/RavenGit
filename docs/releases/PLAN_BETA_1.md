# Congelación y salida de 1.0.0-beta.1

Decisión del usuario: 29/10/2026. Se congela el alcance funcional para cerrar la primera beta. Sólo correcciones de errores, recuperación, validación, identificación de versión, empaquetado y documentación; no se añaden integraciones o funciones nuevas. Los requisitos pendientes de v1 estable siguen abiertos.

## Candidato de Windows

Se prepara primero Windows x64 desde el árbol de trabajo conservado, base `e0f1fc9`. No se hacen commits, ramas, tags ni publicaciones. El paquete es una beta para pruebas privadas, no una versión estable ni certificación macOS.

La beta usa **RavenGit Beta** y el perfil `dev.ravengit.beta`, separados de `dev.ravengit.desktop`. No importa automáticamente la biblioteca habitual. El instalador NSIS es para el usuario actual; Git y WebView2 siguen siendo requisitos. No se añade actualizador automático ni almacenamiento de credenciales.

## Puertas de aceptación

- [x] Alcance congelado y versiones de npm/Cargo/Tauri/lockfiles coordinadas.
- [x] Guardado exclusivo/completo de registros de rebase y Stash, con pruebas de fallos.
- [x] Cortes controlados durante Stash push/apply: registro preservado y operación no repetida.
- [x] Regresión completa Windows: 271 UI, 214 Rust y 2 del editor aprobadas; 6 auxiliares/manuales ignoradas.
- [x] Clippy estricto, Rustfmt, comprobación de versión y formato de archivos de entrega.
- [x] Build release Windows x64 e instalador NSIS con versión beta identificable.
- [x] Verificación de icono, metadatos, SHA256 y manifiesto del candidato; sin firma digital.
- [x] Arranque del ejecutable beta con perfil independiente.
- [x] Primera instalación por usuario y recorrido básico de la copia instalada, autorizados y aprobados en este equipo.
- [ ] VM limpia sin redirección de Windows, instalación sin WebView2, actualización/desinstalación y matriz funcional instalada completa.

El instalador construido puede revisarse antes de aprobar la instalación. No se publica ni se marca aceptada una puerta que no se ejecutó. Una compilación no acredita instalación, firma, permisos del proveedor ni otro sistema operativo.

## Ejecución en otra máquina Windows

Usar la [matriz funcional de la copia instalada](MATRIZ_BETA_1_WINDOWS.md) y copiar su [plantilla de resultados](../validacion/PLANTILLA_MATRIZ_BETA_1_WINDOWS.md) a un registro nuevo por máquina/fecha. La guía identifica por SHA256 el candidato del 30/10, define precondiciones, fixtures independientes, casos nativos y criterios de cierre. Preparar esta documentación **no ejecuta ni aprueba la matriz**.

El [registro Windows del 30/10](../validacion/Beta_1_Windows_2026-10-30.md) confirma la regresión/build y la instalación con recorrido básico en la máquina de origen, con redirección de Windows bajo Codex. La instalación limpia sin redirección, funciones instaladas completas, ausencia de WebView2, actualización/desinstalación y demás puertas conservan su estado pendiente. La otra máquina debe recibir el instalador concreto; no necesita herramientas de desarrollo para probarlo.

## Pendientes que conserva la beta

- Mac: repetir los cambios recientes de recuperación, compilar, instalar y recorrer el mismo punto de código; no se fabrica ni se valida desde este Windows.
- Preparación Mac Apple Silicon disponible: `npm run beta:build:macos`, firma ad hoc sin membresía ni notarización. [Requisitos y salidas](MACOS_BETA.md). No cierra la aceptación macOS anterior.
- Auth: varias identidades efectivas y errores por proveedor; HTTPS restante, incluido endpoint TLS de Gitea. Los accesos reales ya registrados mantienen su alcance, sin reintentarlos automáticamente.
- Recuperación: ventanas de publicación aún no cubiertas, fallos físicos de disco/ACL, otros volúmenes y UI de errores restantes. Los cortes controlados no certifican corte eléctrico ni recuperación automática general.
- Rendimiento y accesibilidad: historial grande, paginación/archivos a escala, lectores de pantalla, escalado y teclado restante.
- Distribución: firma, plataformas mínimas, instalación/migración y regresión multiplataforma antes de la versión estable. Decisión del usuario del 30/10: pasar directamente de beta a v1 sin una RC intermedia una vez cerradas las puertas; esto no declara beta validada ni autoriza publicar.

`gh` releases, APIs/PR/MR, worktrees/submódulos/LFS y nuevas funciones quedan fuera de este cierre. No se rebajan RG/AC para llamar estable a la beta. Cada fallo de beta se registra por versión, plataforma, pasos reproducibles e impacto, sin tokens, claves, rutas sensibles o salida Git privada.

## Comandos

Sólo para validar/compilar desde fuente con herramientas de desarrollo disponibles, no para ejecutar el instalador en la otra máquina. Ejecutar desde la raíz, en este orden y deteniéndose ante el primer fallo:

```text
npm ci
npm run release:check
npm test -- --maxWorkers=2
node --test scripts/check-release-ref.test.mjs
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=4
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run beta:build:windows
```

Resultados de origen: [29/10](../validacion/Beta_1_Windows_2026-10-29.md) y [30/10](../validacion/Beta_1_Windows_2026-10-30.md), con artefactos/hashes distintos. Registrar cada ejecución nueva por separado. Las pruebas manuales de proveedores y auxiliares ignorados se identifican expresamente; no se ejecutan contra repositorios personales para completar un recuento.

Si hay varias instalaciones de Visual Studio, `node scripts/build-beta-windows.mjs --clippy` usa la misma selección comprobada de bibliotecas C++ que el empaquetado, exclusivamente en el proceso hijo. No modifica el entorno del sistema.
