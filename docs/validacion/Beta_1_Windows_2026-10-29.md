# Candidato 1.0.0-beta.1 · Windows · 29/10/2026

Base `e0f1fc9`, con cambios locales conservados. No corresponde a un tag ni a un árbol limpio. Alcance funcional congelado por petición del usuario; no se han hecho commits, ramas ni publicaciones.

## Comprobaciones terminadas antes del reinicio

- UI: **271 pruebas aprobadas en 29 archivos**, con dos trabajadores.
- Rust: **214 aprobadas, 0 fallidas y 6 ignoradas**; además **2 pruebas del protocolo del editor aprobadas**. Duración de la suite Rust: 1856,26 segundos.
- Las seis ignoradas son tres auxiliares de procesos/cortes y tres recorridos manuales de proveedores. No representan seis fallos ni se ejecutaron accesos reales adicionales.
- El corte controlado durante los comandos reales de Stash guardar/aplicar pasó también de forma focalizada: registro conservado, HEAD y respaldos comprobados y rechazo de repetir el plan. Usa fixtures locales y un proceso hijo propio; no certifica un corte eléctrico ni todas las ventanas críticas.
- Rustfmt y Clippy estricto para todos los targets aprobados. Comprobación coordinada de versiones npm/Cargo/Tauri/lockfiles aprobada. TypeScript/Vite aprobados durante el empaquetado inicial.

## Empaquetado y reinicio

La primera compilación encontró bibliotecas C++ ausentes en la instalación de Visual Studio seleccionada por defecto. Se detectó una instalación completa de Build Tools ya existente. `scripts/windows-toolchain.mjs` prepara exclusivamente el entorno del proceso hijo, sin instalar componentes ni modificar el PATH del sistema. Clippy pasó con ese entorno.

El reinicio inesperado interrumpió la primera compilación release. Al retomar se conservaron los cambios y no había instalador terminado. La repetición de `npm run beta:build:windows` terminó correctamente: release optimizado en **9 min 31 s**, NSIS x64 en español generado. El empaquetador descargó sus herramientas NSIS y validó sus hashes.

## Artefacto y comprobaciones

Entrega local ignorada por Git: `state/beta-1.local/windows-x64/`, con instalador, notas, `SHA256SUMS.txt` y `manifest.json`. No se ha publicado ni creado un tag.

| Archivo | Bytes | SHA256 |
| --- | ---: | --- |
| RavenGit Beta_1.0.0-beta.1_x64-setup.exe | 2100724 | `E5314652FBB684A8E7FE9CBCE707665712DEE293DEA5419E3CBA73650724C1A8` |
| ravengit.exe de target/release | 6752768 | `B3AD0DDDECF2B05AA5DF79ABB688100CEFDD75F9FFF38350723FE4606C72096F` |
| ravengit.exe instalado | 6752768 | `DF33C4E1C5DFFA961E0D45DC78F4C18D26EFA237A1009C6AD6610F5C86DA3406` |

Producto **RavenGit Beta**, ProductVersion/FileVersion **1.0.0-beta.1** en instalador y ejecutable. Authenticode informa **NotSigned**. Se verificaron los seis tamaños de icono RavenGit en el ejecutable compilado y en el instalado.

La copia instalada difiere de la compilada exclusivamente en **3 bytes desde el offset 6421495**: `__TAURI_BUNDLE_TYPE_VAR_UNK` pasa a `__TAURI_BUNDLE_TYPE_VAR_NSS`. Se conservan ambos hashes; no se declara identidad binaria completa.

## Instalación y arranque autorizados

- Primer arranque de la copia compilada: título **RavenGit Beta · 1.0.0-beta.1**, interfaz renderizada, biblioteca vacía y acciones de repositorio deshabilitadas. El perfil beta no existía antes de este recorrido.
- El usuario autorizó expresamente instalar y comprobar la beta. Asistente en español: destino por usuario **AppData/Local/RavenGit Beta**, instalación completada y finalización correctas. Sin solicitud de elevación ni reinicio observado.
- La copia instalada se abrió desde el asistente con título y versión correctos; biblioteca vacía, icono y estado inicial observados. Abrir «Nuevo repositorio» y cerrarlo con Escape funcionó; no se creó repositorio ni se ejecutó una operación Git.
- En este entorno Codex de Microsoft Store, la ruta real observada del proceso queda bajo `AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/RavenGit Beta/`. Se verificó el hash también en esa ruta. No se extrapola este recorrido a una máquina limpia sin redirección de Windows.
- La beta instalada queda abierta para el usuario. La instalación habitual y sus repositorios no se utilizaron.

Instalación por usuario y recorrido básico aprobados en este equipo; **no** es prueba en VM limpia, desinstalación, actualización/migración, instalación sin WebView2 ni matriz funcional completa de la copia instalada.

## Límites de aceptación

El candidato utiliza nombre **RavenGit Beta** e identificador **dev.ravengit.beta**, separado de la biblioteca habitual. NSIS está configurado para el usuario actual. Git y WebView2 son requisitos; el instalador puede necesitar descargar WebView2.

Firma, VM limpia, matriz funcional instalada y validación multiplataforma siguen abiertos. Gitea HTTPS requiere un endpoint TLS; no se enviaron credenciales a su URL HTTP. No se declara v1 estable ni beta publicada.

[Plan y puertas de aceptación](../releases/PLAN_BETA_1.md) · [Notas del candidato](../releases/1.0.0-beta.1.md)
