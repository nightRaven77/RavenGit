# SignPath OSS y preparación pública · 29/10/2026

Base `10ddcbb`, árbol limpio al comenzar esta preparación. El usuario confirmó modalidad Open Source, licencia MIT, futura migración a GitHub una vez terminado y configuración personal del portal. No se han hecho commits, ramas, migración, publicación ni cambios remotos.

## Preparado

LICENSE MIT y metadatos npm/Cargo, inclusión de LICENSE en los recursos del empaquetado futuro, guía de contribución, borrador Code signing policy, lista previa a apertura y pasos de SignPath. Workflow manual GitHub, alojado en Windows, limitado a rama predeterminada pública y activación explícita. Acciones fijadas a las revisiones obtenidas de sus repositorios oficiales el 29/10.

Flujo de dos solicitudes: ejecutable → empaquetado sin parcheo/firma local → instalador. XML con ZIP raíz, nombre/producto y versión requerida; no se extrapola firma profunda MSI a NSIS. El flujo comprueba la firma contra un certificado esperado, sello de tiempo y versión; instala sólo en el runner efímero y compara el ejecutable instalado con el firmado. No publica releases.

## Comprobado localmente

- `npm run release:check`: aprobado.
- Prettier de workflow/helper: aprobado; YAML parseado sin errores.
- `node --check scripts/build-beta-windows.mjs`: aprobado.
- Analizador PowerShell del verificador: sin errores.
- XML: ambos bien formados y con namespace esperado. No se ha validado el esquema ni su aceptación por el servidor SignPath.
- Verificador sobre la beta local sin firma: rechazo confirmado. Huella mal formada: rechazo confirmado. No se ha probado el camino válido, otro firmante real ni sello de tiempo real.
- CLI local: `build --help` admite `--no-bundle --no-sign`; `bundle --help` admite `--no-sign --no-binary-patching` y describe la conservación de firma. No se ejecutó un nuevo bundle ni se modificó el instalador previo.
- Sin suites completas nuevas: no hay cambios a lógica de la aplicación; la validación actual se limita a infraestructura de entrega.

## Pendiente

Revisión del workflow en GitHub/primera ejecución, aprobación de la Foundation, proyecto y certificados reales, controles de origen/permisos, política pública completa y responsables, revisión de dependencias/licencias antes de publicación. No hay prueba de firma válida ni aceptación de la copia firmada. Los resultados anteriores de la beta sin firma conservan su alcance y hash.

[Pasos del portal y variables de GitHub](../releases/SIGNPATH.md) · [Política en borrador](../releases/CODE_SIGNING_POLICY.md).
