# Revisión previa a apertura pública · 29/10/2026

Base **bbfa3be**, con el cambio previo en `docs/CONTEXTO.md` conservado. Revisión solicitada por el usuario, sin publicación, cambios de origin, commits, tags, borrado de archivos o reescritura del historial.

**Resultado: revisión completada con pendientes concretos de saneamiento y atribución. No se recomienda publicar una copia íntegra del repositorio/historial tal como está.** No se encontraron secretos con el detector utilizado; eso no equivale a garantizar ausencia absoluta de información privada o vulnerabilidades.

## Alcance y resultados

| Área | Alcance comprobado | Resultado |
| --- | --- | --- |
| Archivos actuales | 478 archivos versionados, incluido el contenido de trabajo | Gitleaks sin alertas; búsqueda adicional de datos privados con 20 ubicaciones en 12 documentos |
| Historial | 34 commits alcanzables por todas las referencias locales; 825 blobs de texto únicos | Gitleaks sin alertas; 24 ubicaciones en 15 blobs con datos identificables |
| Capturas | 56 imágenes de documentación; los 56 objetos históricos están también en el checkout actual | Revisión visual general de las 56 en hojas de contacto: UI de fixtures/pruebas, sin credenciales evidentes. No es OCR exhaustivo ni certificación de cada píxel/metadata |
| Binarios versionados | Inventario de archivos y extensiones | `ravengit.exe` en raíz, 18.067.968 bytes, introducido en `2aea17f`; no ejecutado ni retirado |
| npm de producción | 8 paquetes del lockfile y sus manifiestos/textos locales | Licencias declaradas MIT o alternativas MIT/Apache; textos localizados en los 8 |
| Cargo | 423 paquetes de la resolución; grafos filtrados Windows x64 y macOS arm64 | Unión conservadora de 274 paquetes, incluidos build-dependencies; no certifica qué código se enlaza en cada binario |
| Avisos para los destinos | 282 paquetes en conjunto (8 npm + 274 Cargo) | Sin metadatos de licencia UNKNOWN, pero faltan textos de licencia/avisos locales reconocidos en 18 paquetes |
| Material auxiliar | 149 archivos en `.agents`, procedencias en `skills-lock.json` | Material de terceros; no queda relicenciado por MIT. Un LICENSE Apache explícito en frontend-design no cubre las demás procedencias |

Los patrones adicionales contaron rutas de usuario, direcciones privadas y referencias a proyectos personales. Son señales de revisión de privacidad, **no credenciales**. No se incluyen sus valores ni el correo de autor en este registro público. Se identificó un único correo de autor en los commits: decidir su exposición antes de publicar el historial, conservando atribuciones legítimas.

## Pendientes de privacidad y contenido

Las ubicaciones actuales están en:

| Documento | Acción antes de apertura |
| --- | --- |
| `docs/validacion/0.2.0.md`, `M0.md`, `Ramas_locales.md` | Sustituir rutas personales en una copia pública o excluir la evidencia privada |
| `docs/validacion/Conflictos_macOS_2026-10-23_resultados.json`, `Stash_macOS_resultados.json` | Sanear resultados que contienen rutas reales; conservar originales privados |
| `docs/validacion/HTTPS_Windows_2026-10-28.md`, `Windows_actual_2026-10-22.md`, `Windows_actual_2026-10-26.md` | Sustituir direcciones privadas y rutas por destinos de ejemplo |
| `docs/validacion/Publicar_tags.md`, `SSH_real_Windows_2026-10-27.md` | Retirar nombres/destinos de proyectos ajenos a la futura publicación |
| `docs/validacion/Windows_estabilizacion.md`, `Windows_viabilidad.md` | Sustituir rutas personales |

La edición del checkout **no elimina los datos del historial**. `.gitignore` tampoco retira un ejecutable ya versionado. No se alteraron las evidencias originales ni la historia para aparentar limpieza.

El ejecutable de raíz es distinto del candidato Windows ya validado. Hash SHA256: `5E59C751B46C58450E497622EFD1BADD2879DA3C263831C8051FF60FB3836F70`. Excluirlo de la futura copia de código y distribuir sólo artefactos revisados desde Actions/Releases. Conservar el archivo local original mientras se decide el traslado; este informe no autoriza borrarlo ni modificar el índice.

## Licencias y avisos

[Inventario completo](../legal/INVENTARIO_DEPENDENCIAS.md), con nombres/versiones/licencia declarada y enlaces de origen, sin rutas locales de la caché.

- Los 18 paquetes seleccionados sin texto local reconocido son: alloc-stdlib, block2, dispatch2, objc2, objc2-app-kit, objc2-core-foundation, objc2-core-graphics, objc2-encode, objc2-exception-helper, objc2-foundation, objc2-io-surface, objc2-quartz-core, objc2-web-kit, selectors, tauri-plugin, webview2-com, webview2-com-macros y webview2-com-sys. La ausencia del archivo en el paquete instalado **no demuestra ausencia de permiso**; recuperar avisos auténticos del upstream de la versión correspondiente antes de cerrar distribución.
- Cinco paquetes declaran exclusivamente MPL-2.0 en los grafos consultados. Revisar el código que realmente se distribuye y añadir aviso/acceso al código de esas partes. No cambia automáticamente la licencia del código propio de RavenGit. [Referencia oficial MPL](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- Preparar un conjunto de avisos/textos de terceros y verificar su inclusión en paquetes. LICENSE de RavenGit ya está prevista en recursos; no equivale a incluir todos los avisos de terceros.
- Revisar separadamente NSIS/plugins, WebView2 y demás componentes externos. No se distribuye Git embebido. No se realizó auditoría completa de las herramientas npm de desarrollo ni revisión de vulnerabilidades/CVE.
- Para `.agents/skills`, comprobar procedencias/avisos de cada origen o excluir ese material auxiliar de la copia pública. Preservar atribuciones y no presentarlo como código original de RavenGit. No se modificaron los archivos protegidos de skills.

## Evidencia local y método

Gitleaks **8.30.1** descargado del repositorio oficial; ZIP Windows x64 verificado contra su checksum oficial: `D29144DEFF3A68AA93CED33DDDF84B7FDC26070ADD4AA0F4513094C8332AFC4E`. Dos análisis con redacción completa: historial `--all` y snapshot de los archivos versionados actuales. Ambos finalizaron con código 0 y reportes vacíos. No se envió el repositorio ni los hallazgos a un servicio de análisis remoto.

Cargo metadata con `--locked --offline`, más filtros `x86_64-pc-windows-msvc` y `aarch64-apple-darwin`. No se modificaron lockfiles ni dependencias. La metadata filtra grafos de dependencias; no compila ni valida macOS.

Informes, ubicaciones sin extractos de valores, inventarios técnicos y hojas de contacto permanecen en `state/publication-review.local/`, ignorada por Git. No publicar ese directorio. No se recorrieron repositorios personales, agentes, llaveros, `.ssh`, credenciales del sistema ni archivos de entorno locales.

## Ruta de cierre propuesta

1. Preparar avisos/atribuciones y resolver los 18 textos faltantes y componentes auxiliares.
2. Generar una copia pública saneada sin ejecutable antiguo, rutas/proyectos privados o material auxiliar no aclarado, conservando íntegros los originales privados.
3. Elegir si GitHub comienza con esa copia sin historial privado o si se prepara una limpieza histórica independiente. **No se ha ejecutado ninguna de esas alternativas.** No forzar pushes ni reescribir GitLab por efecto de esta revisión.
4. Repetir el análisis sobre la copia final exacta, completar canal/responsables/política y obtener autorización de migración/publicación.

La revisión está terminada; el saneamiento y cumplimiento de distribución no se marcan terminados por haber generado este informe. SignPath, primera ejecución Actions, instalación limpia y aceptación del producto siguen sus puertas independientes.
