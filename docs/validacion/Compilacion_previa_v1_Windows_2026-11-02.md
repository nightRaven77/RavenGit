# Compilación y regresión previa a v1 · Windows · 02/11/2026

Ejecución en una máquina Windows limpia, solicitada para instalar las dependencias faltantes y completar las comprobaciones locales. No se modificaron políticas de seguridad, configuración global, referencias Git ni artefactos remotos.

## Toolchain

- Node.js LTS 26.13.0/npm 11.20.0 instalado desde winget; `npm ci` instaló 126 paquetes y reportó 0 vulnerabilidades.
- Rust MSVC 1.99.1, Cargo, Rustfmt y Clippy instalados.
- Visual Studio Build Tools 2022 / MSVC 14.44.35207 y Windows SDK 10.0.26100.0 instalados para el enlace C++ x64.
- Git y WebView2 estaban disponibles. Las rutas de Node y Rust se añadieron sólo a los procesos de validación.

## Comprobaciones aprobadas

| Comprobación | Resultado |
| --- | --- |
| `npm run release:check` | Aprobado; versión `1.0.0-beta.1` coherente |
| `npm test -- --maxWorkers=2` | 271 aprobadas, 29 archivos |
| `node --test scripts/check-release-ref.test.mjs` | 8 aprobadas |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Aprobado |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=4` | Suite de biblioteca: 214 aprobadas, 0 fallidas y 6 ignoradas; el binario de integración `rebase_editor` inicialmente no pudo ejecutarse |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Aprobado |

La primera ejecución Cargo dentro del sandbox dio fallos al crear fixtures y trabajar con repositorios/hook locales. La repetición fuera del sandbox dejó la suite de biblioteca en verde. Windows Application Control bloqueó el binario de integración `rebase_editor` con error 4551; no se modificó ni eludió esa política.

## Build Windows

`npm run beta:build:windows` pasó el chequeo de versión y el build web de TypeScript/Vite. La primera compilación Rust release falló al cargar `zerofrom_derive`; repetir con un único job reprodujo `E0463`. Al probar `CARGO_PROFILE_RELEASE_STRIP=debuginfo`, la compilación avanzó y Windows Application Control bloqueó `src-tauri/target/release/build/getrandom-*/build-script-build` con error 4551. No se cambió el perfil release ni se alteró la política para sortear el bloqueo.

## Reanudación tras actualizar Smart App Control

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --test rebase_editor`: 2 aprobadas, 0 fallidas. El ejecutable de integración dejó de ser bloqueado.
- `npm run beta:build:windows`: pasó el chequeo de versión, TypeScript/Vite, compilación Rust release y empaquetado NSIS x64.
- Ejecutable release `ravengit.exe`: 6,748,672 bytes, versión `1.0.0-beta.1`.
- Instalador `RavenGit Beta_1.0.0-beta.1_x64-setup.exe`: 2,098,744 bytes, versión `1.0.0-beta.1`, SHA256 `BECC17A70E93AF6E36BF93C6B5A60E606996C4E487E2D94F185BF6CBDBC358D9`, Authenticode `NotSigned`.

## Estado

Regresión UI, núcleo Rust, editor de rebase, Clippy y empaquetado Windows validados en esta máquina. El instalador nuevo no se instaló ni recorrió; la matriz funcional, firma/distribución y aceptación nativa siguen pendientes. Esta ejecución no cierra la beta ni certifica v1.
