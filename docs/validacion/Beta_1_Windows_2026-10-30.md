# Beta 1 · Windows · 30/10/2026

Validación local de **1.0.0-beta.1**, base `de55bf1`. Árbol limpio al inicio. Se leyeron AGENTS.md, el contexto, las filas de entrega Windows/referencias de entrega del mapa y el plan congelado de beta. Sin commits, ramas, tags ni publicaciones.

## Resultado

**Secuencia detenida en la primera precondición.** Desde la raíz, `npm ci` terminó con código 1: PowerShell no reconoce `npm` en el PATH de esta sesión. No llegó a instalar dependencias. La consulta posterior de comandos encontró Node y Git, pero no npm ni Cargo; esto describe la sesión y no demuestra que estén ausentes de toda la máquina.

| Comando | Resultado |
| --- | --- |
| `npm ci` | Falló al resolver el comando; código 1 |
| `npm run release:check` | No ejecutado |
| `npm test -- --maxWorkers=2` | No ejecutado |
| `node --test scripts/check-release-ref.test.mjs` | No ejecutado |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | No ejecutado |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=4` | No ejecutado |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | No ejecutado |
| `npm run beta:build:windows` | No ejecutado |

Totales: **1 comando intentado, 1 bloqueo de entorno, 7 comandos sin ejecutar; 0 pruebas ejecutadas y 0 artefactos generados**. No se usaron repositorios personales ni se realizaron operaciones sobre remotos. No hubo aceptación nativa, instalación ni verificación de firma. No se extrapolan resultados históricos ni de macOS.

Para reanudar: disponer de npm y Cargo en el entorno de ejecución Windows y repetir la secuencia completa desde `npm ci`, deteniéndose ante cualquier fallo. No se modificó el PATH ni se instalaron herramientas para sortear el bloqueo.

## Preparación posterior autorizada

El usuario autorizó instalar las dependencias faltantes. Se instalaron mediante winget Node.js LTS 26.13.0/npm 11.20.0, Visual Studio Build Tools 2022 con C++ y SDK recomendados, y Rust estable MSVC x64 mediante rustup (Cargo 1.99.1, Rustfmt y Clippy presentes). El selector del proyecto reconoció MSVC 14.44.35207. Git y WebView2 ya estaban disponibles. Se antepusieron las rutas instaladas sólo en los procesos de validación; las sesiones ya abiertas de Codex pueden conservar su PATH anterior.

Reanudación: `npm ci` aprobó (126 paquetes, auditoría de 127, 0 vulnerabilidades reportadas); `release:check` aprobó; **271 pruebas UI en 29 archivos** y **8 pruebas de referencias** aprobaron; Rustfmt aprobó. El primer intento UI dentro del sandbox falló antes de ejecutar pruebas por EPERM al renombrar temporales; la repetición autorizada fuera del sandbox pasó.

`cargo test --locked --manifest-path src-tauri/Cargo.toml -- --test-threads=4` aprobó: **214 pruebas del núcleo, 6 ignoradas y 2 pruebas del editor**, sin fallos. Las ejecuciones auxiliares de trabajadores de interrupción no se suman como pruebas adicionales. No se ejecutaron los casos manuales de proveedores. Clippy estricto con todos los targets aprobó; se limitaron sus trabajos de compilación a dos en el proceso hijo.

`npm run beta:build:windows` aprobó TypeScript/Vite, compilación release y empaquetado NSIS x64 (código 0). La compilación release tardó 20 min 21 s. Esta máquina tiene 4 GB de RAM; se observó memoria libre reducida durante la compilación.

Salidas locales: `src-tauri/target/release/ravengit.exe` y `src-tauri/target/release/bundle/nsis/RavenGit Beta_1.0.0-beta.1_x64-setup.exe` (2,00 MiB según el empaquetador). SHA256 del instalador: `E55800A24F1F7D52BC33E53EA3CC1E0BB983D81BF17752B75AA0998B38C61D31`.

Resultado de la reanudación: **8 pasos aprobados**, **271 UI + 8 referencias + 214 núcleo Rust + 2 editor = 495 pruebas aprobadas**, 6 auxiliares/manuales Rust ignoradas. La instalación de herramientas y el build no acreditan aceptación nativa de RavenGit, instalación limpia ni firma. No se abrió ni instaló el candidato, no se publicó y no se modificaron archivos de producción ni lockfiles. `git diff --check` aprobó.

## Instalación y prueba nativa posterior autorizadas

El usuario pidió instalar y probar el candidato. Se verificó de nuevo el SHA256 del instalador anterior y se ejecutó NSIS en modo silencioso por usuario: **código 0**, producto instalado **1.0.0-beta.1**. No se observó solicitud de reinicio. El recorrido gráfico usó la guía computer-use y la copia instalada, no el ejecutable de desarrollo.

La ruta nominal es `%LOCALAPPDATA%/RavenGit Beta/ravengit.exe`. La ventana devuelta por Windows identificó la ruta real bajo `AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/RavenGit Beta/`. SHA256 de la copia instalada, también comprobado en esa ruta: `A66E31F332329610DE3FDA2DC083A64FA31D8305B18A1F0713BAD8C03542383D`. Authenticode: **NotSigned**. No se certifica identidad binaria con el ejecutable previo al empaquetado.

Recorrido básico aprobado en esta máquina:

- Arranque con título **RavenGit Beta · 1.0.0-beta.1**, interfaz renderizada y biblioteca inicialmente vacía.
- Apertura por selector nativo de una fixture nueva en `state/installed-beta-smoke.local/windows-2026-10-30`, sin remotos ni commits. Historial muestra correctamente que no hay commits.
- Vista Cambios muestra autorización por ruta pendiente y creación de commit deshabilitada. Se conservó esa puerta; no se habilitaron operaciones ni se certificó inspección del archivo, preparación o commit.
- Cierre normal mediante Alt+F4 y nuevo arranque de la copia instalada. Ventana nueva comprobada.
- La entrada de la fixture persiste en **Repositorios** y se abre desde ella. La pantalla inicial sin repositorio seleccionado no implica pérdida de biblioteca.
- Estado Git final de la fixture: sólo `?? prueba.txt`, sin índice ni referencias. Sin commits, ramas adicionales, tags ni publicaciones; proyecto original conservado. La beta queda abierta en el historial de la fixture.

Alcance: **instalación por usuario y recorrido nativo básico**, con redirección de Windows bajo Codex. No es aceptación en entorno limpio, actualización/desinstalación, ausencia de WebView2, firma ni matriz funcional completa instalada. No se extrapola a macOS. `git diff --check` aprobó después del recorrido.
