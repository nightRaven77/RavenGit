# Icono de RavenGit

22 de octubre de 2026 · primera identidad propia aplicada en desarrollo, sin cambiar versión ni identificador de aplicación.

## Concepto

Cuervo geométrico de perfil con ala facetada. La ramificación en negativo dentro del ala representa el grafo Git; el ojo carmesí aporta el acento de identidad sin depender de texto. Mantiene la paleta Obsidian/Azure de la interfaz, sin utilizar los iconos de plantilla de Tauri o Vite.

- Obsidian: `#101722`.
- Azure: `#52B7FF`; faceta del ala: `#2788CB`.
- Carmesí: `#FF667D`.
- Contorno: `#29384D`.
- Lienzo SVG: 1024 × 1024, coordenadas internas 512 × 512; fondo de esquinas redondeadas con transparencia exterior.

## Fuente e integración

`public/ravengit.svg` es el original vectorial editable. Se utiliza en el favicon y en la cabecera junto al nombre RavenGit. La imagen de cabecera es decorativa para evitar anunciar dos veces el nombre con lector de pantalla.

Los recursos de escritorio de `src-tauri/icons/` se generan desde esa misma fuente:

```sh
npm run icons
```

El script utiliza la CLI Tauri instalada en el proyecto, genera en un directorio temporal exclusivo y copia únicamente los recursos de escritorio PNG/ICO/ICNS. No requiere nuevas dependencias ni añade carpetas móviles al repositorio. Modificar la fuente y regenerar en vez de editar cada tamaño manualmente.

La configuración de bundle existente ya referencia estos nombres. Se reemplazan PNG de ventana y assets de Windows, `icon.ico` para Windows e `icon.icns` para macOS. No se añade bandeja de sistema ni se altera la configuración o la biblioteca del usuario.

## Validación y límites

- Inspección visual del PNG de 512 px y del icono de 32 px: silueta y contraste conservados.
- Pruebas de recursos: PNG cuadrados RGBA, dimensiones esperadas, tamaños de ICO, cabecera/longitud ICNS, referencias de favicon/bundle y recurso local en cabecera.
- Suite completa: 178 pruebas aprobadas en 19 archivos; TypeScript/Vite, Prettier y `git diff --check` aprobados. SVG confirmado en la salida de producción.
- Primer rebuild Windows debug sin bundle terminado tras cerrar la aplicación/dev; un intento anterior estaba bloqueado por acceso denegado al ejecutable abierto. Como se comprobó después, completar esa compilación no actualizó los recursos del icono. No se generó instalador ni se ejecutó aceptación nativa.
- Corrección posterior al reporte del usuario: el build anterior terminaba correctamente, pero conservaba los recursos nativos antiguos. El registro de `tauri-build` no incluía la carpeta `icons` entre las dependencias de reconstrucción; el ejecutable no contenía ninguno de los seis payloads del ICO nuevo. Se añade `cargo:rerun-if-changed=icons` en `build.rs`. La aprobación anterior del build no acreditaba el icono incrustado.
- `npm run icons:verify` comprueba que el ejecutable Windows contiene los payloads de 16, 24, 32, 48, 64 y 256 px del ICO actual. Puede recibir otra ruta de ejecutable mediante `npm run icons:verify -- ruta/al/ejecutable.exe`. El control falló con el ejecutable obsoleto; debe ejecutarse después de reconstruir, no sólo revisar los PNG fuente.
- Tras corregir `build.rs`, reconstrucción Windows debug sin bundle y verificación binaria aprobadas para los seis tamaños; 14 pruebas focalizadas de recursos/cabecera aprobadas, formato y TypeScript/Vite aprobados. Ejecutable corregido: `src-tauri/target/debug/ravengit.exe`. La comprobación visual del sistema sigue pendiente del usuario; no se ha modificado ni vaciado su caché de iconos.
- La creación del ICNS no equivale a validar Dock/Finder en macOS. Queda pendiente aceptar el icono en ventana, barra de tareas, Dock y accesos directos de cada plataforma tras reconstruir/reiniciar la aplicación.
- Diseño propio vectorial creado para este proyecto; no se realizó búsqueda de marcas ni análisis de exclusividad comercial.

## Comprobación posterior macOS · 22 de octubre

Bundle ARM64 generado y render nativo revisado. El ICNS empaquetado coincide byte por byte con el de fuentes y el SVG está en `dist`; `hashes y alcance` (archivo no incluido en este repositorio: `MacOS_actual_2026-10-22.md`). No se confunde esa comparación con aceptar la representación en Dock/Finder o una distribución firmada.
