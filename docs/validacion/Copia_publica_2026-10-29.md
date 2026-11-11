# Copia pública saneada · 29/10/2026

Base privada `bbfa3be`, incluidos los cambios documentales locales de la auditoría. El usuario autorizó crear la copia pública, sin publicar, crear commits/tags, cambiar origin ni reescribir historia. El original y sus evidencias siguen conservados.

## Entrega local

Directorio relativo a este repositorio: `state/public-source.local/2026-10-30T02-55-34-139Z/RavenGit/`. La marca de carpeta es UTC; corresponde al 29/10 en la zona del usuario.

ZIP: `state/public-source.local/2026-10-30T02-55-34-139Z/RavenGit-public-source-1.0.0-beta.1.zip`.

SHA256: `0591B4B24D38ED067B5A64E73C2875EFB8F9DA8B58CE136D1427BEF2A187B14E`.

Se incluyen `PUBLIC_SOURCE.md` con alcance y pendientes, y `PUBLIC_SOURCE_MANIFEST.json` con hashes de los 329 archivos anteriores al propio manifiesto. Se verificaron **330 archivos** del ZIP y su correspondencia con los hashes. `SHA256SUMS.txt` queda al lado del ZIP.

## Exclusiones y anonimización

- 152 archivos auxiliares/versionados excluidos: `.agents`, `skills-lock.json`, configuración de editor y ejecutable antiguo de raíz. No se incluyen `.git`, historia, remotos, cachés, node_modules, target, dist, herramientas de auditoría ni evidencia local ignorada.
- 18 documentos anonimizados: rutas de usuario, cuentas, nombres de proyectos, correo de autor presente en texto y hosts privados sustituidos por ejemplos. JSON modificado conserva estructura válida y declara anonimización; los registros Markdown modificados se marcan como copia, no nueva aceptación.
- Se retiraron metadatos de texto/EXIF/IPTC en 54 imágenes de documentación. Comparación independiente de píxeles decodificados: **56 capturas idénticas** a sus originales. No se recrearon imágenes ni se modificaron los originales.
- Ejemplos de dos fixtures visuales y nombres de `AuthorAvatar.test.ts` anonimizados. Las iniciales y la normalización de nombres siguen cubiertas.
- En la copia, la prueba HTTPS manual ignorada de `ssh.rs` requiere `RAVENGIT_HTTPS_ACCEPTANCE_URL` y `remote_url` idéntico en el marcador de autorización de su fixture. Valida HTTPS, host oficial según proveedor, puerto y ausencia de credenciales/query/fragment. No se contactaron proveedores. El código de producción anterior a `cfg(test)` conserva su contenido, normalizando sólo finales de línea al formatear la copia.

## Comprobaciones

- **142 entradas de compilación** idénticas al original; se declaran las cuatro excepciones de fixtures/pruebas anteriores. La lógica de la aplicación no se ha cambiado en el repositorio original.
- Copia de verificación separada con dependencias propias (`npm ci --ignore-scripts`): **2 pruebas de AuthorAvatar y 8 de referencias de release aprobadas**; TypeScript/Vite aprobados. No se incluyeron esas dependencias ni dist en la entrega.
- Las **161 entradas de código/configuración/fixtures** de la entrega final coinciden con las de la copia verificada.
- Gitleaks 8.30.1 en la exportación final: **0 alertas**, aproximadamente 2,55 MB analizados. Comprobación adicional de patrones identificables: 0 coincidencias; revisión de exclusiones y hashes aprobada.
- No se identificó EXIF ni los identificadores privados buscados en datos legibles de las 71 imágenes PNG/JPEG del conjunto (capturas y recursos).
- Comprobación de versiones ejecutada desde la copia aprobada. Rustfmt aplicado sólo al módulo de pruebas modificado dentro de la copia.

## Límites y próximos pasos

Es un snapshot sin Git, no un repositorio remoto ya publicado. Antes de activar CI, el usuario debe inicializar/publicar un nuevo repositorio mediante una acción independiente autorizada. No subir el `.git` privado ni hacer push mirror. Los commits antiguos citados en documentos describen antecedentes privados y no están incluidos.

No se ha compilado el núcleo Rust modificado para pruebas, ejecutado las pruebas manuales HTTPS, generado instalador nativo nuevo ni ejecutado Actions desde esta copia. La compilación frontend no acredita esas comprobaciones. No se realizó una nueva auditoría de vulnerabilidades.

Los avisos/textos de 18 dependencias y componentes externos siguen pendientes antes de cerrar la distribución binaria. La exclusión de skills resuelve su inclusión en esta copia, sin relicenciar material ajeno. Configuración/aprobación SignPath, URL definitiva, responsables/canal de seguridad y primera entrega remota siguen pendientes.

El escaneo sin alertas no garantiza ausencia absoluta de secretos. Los informes detallados y copias intermedias/de verificación permanecen en carpetas locales ignoradas; la entrega revisada es exclusivamente el directorio y ZIP identificados arriba.
