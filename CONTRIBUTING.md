# Contribuir a RavenGit

RavenGit se prepara para publicarse bajo [MIT](LICENSE). El repositorio público de GitHub y sus canales se anunciarán al completar la migración; este documento no acredita que ya estén disponibles.

Antes de trabajar, consulta [el contexto](docs/CONTEXTO.md) y sólo el área pertinente del [mapa](docs/MAPA.md). Para un fallo, incluye versión, plataforma, pasos reproducibles con un repositorio desechable y resultado esperado/observado. No adjuntes credenciales, claves, rutas privadas ni salidas Git sin revisar.

Propón cambios pequeños y pruebas adecuadas al módulo. Conserva confianza por ruta, planes revisados de un solo uso y comprobaciones de estado; no elimines precondiciones para simplificar una interfaz. No pruebes escrituras contra repositorios personales o de terceros sin permiso.

Usa Node/npm, Rust, Git y los requisitos nativos de Tauri 2. `npm ci` instala las dependencias fijadas; el mapa indica las pruebas focalizadas. Las pruebas manuales de proveedores requieren acceso y autorización independientes; no se ejecutan para completar recuentos. Un resultado Windows no certifica macOS.

Quien mantiene el proyecto revisa contribuciones y cambios a los flujos de entrega antes de incorporarlos. La solicitud de firma y la publicación son pasos separados; un PR no recibe acceso a credenciales de firma. Conserva los avisos de licencia aplicables a aportaciones y dependencias.
