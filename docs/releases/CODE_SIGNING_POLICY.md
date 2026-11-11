# Code signing policy · RavenGit

Estado: preparación para GitHub y solicitud OSS. **RavenGit todavía no dispone de una firma de SignPath Foundation verificada.** La beta Windows actual permanece sin firma. No se declara patrocinio, aprobación ni certificado concedido.

## Alcance propuesto

Solicitar firma únicamente para el ejecutable propio RavenGit y su instalador Windows, construidos desde el código revisado del repositorio público futuro. Dependencias binarias de terceros conservan su firma original o su estado sin firma; no se firman con el certificado del proyecto. macOS requiere un proceso Apple independiente.

El workflow preparado compila y comprueba, solicita la firma del ejecutable, empaqueta sin cambiarlo, solicita la firma del instalador y verifica la copia instalada y los hashes. No publica releases ni crea tags. Cada solicitud de release requiere aprobación humana en SignPath.

## Responsables pendientes de configurar

Los mantenedores del futuro repositorio definirán quién puede incorporar/revisar cambios y aprobar las firmas. No hay permisos remotos asignados por este documento. Antes de activar la firma deben publicarse aquí los responsables efectivos, la URL definitiva y los datos de atribución que SignPath apruebe. No se añaden credenciales a la documentación.

## Privacidad y comunicaciones

RavenGit es un cliente Git local. El usuario elige repositorios, remotos y operaciones de red; Git/OpenSSH y los proveedores administran las credenciales. El diagnóstico y la actividad tienen límites descritos en la documentación del producto. El instalador de Windows puede descargar WebView2 de Microsoft si falta ese componente. No se declara que toda instalación sea completamente offline ni se convierte el diagnóstico local en prueba de identidad o permisos del proveedor.

Esta política es un borrador para la solicitud; antes de publicar, completar la revisión de dependencias, las divulgaciones aplicables y los requisitos de SignPath. [Preparación y configuración del portal](SIGNPATH.md).
