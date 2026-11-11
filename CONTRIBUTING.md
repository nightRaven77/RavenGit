# Contribuir a RavenGit

RavenGit se prepara para publicarse bajo [MIT](LICENSE). El repositorio público de GitHub y sus canales se anunciarán al completar la migración; este documento no acredita que ya estén disponibles.

Antes de trabajar, consulta el [índice de documentación](docs/README.md), la [visión y requisitos](docs/producto/01_Vision_y_requisitos.md) y el [análisis de arquitectura](docs/producto/02_Analisis_de_arquitectura.md); revisa sólo los documentos pertinentes al cambio. Para un fallo, incluye versión, plataforma, pasos reproducibles con un repositorio desechable y resultado esperado/observado. No adjuntes credenciales, claves, rutas privadas ni salidas Git sin revisar.

Propón cambios pequeños y pruebas adecuadas al módulo. Conserva confianza por ruta, planes revisados de un solo uso y comprobaciones de estado; no elimines precondiciones para simplificar una interfaz. No pruebes escrituras contra repositorios personales o de terceros sin permiso.

Usa Node/npm, Rust, Git y los requisitos nativos de Tauri 2. `npm ci` instala las dependencias fijadas. Elige pruebas focalizadas según el módulo y documenta qué ejecutaste. Las pruebas manuales de proveedores requieren acceso y autorización independientes; no se ejecutan para completar recuentos. Un resultado Windows no certifica macOS.

Quien mantiene el proyecto revisa contribuciones y cambios a los flujos de entrega antes de incorporarlos. La solicitud de firma y la publicación son pasos separados; un PR/MR no recibe acceso a credenciales de firma. Conserva los avisos de licencia aplicables a aportaciones y dependencias.
