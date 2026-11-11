# Firma Windows con SignPath · preparación

Revisión: 29/10/2026. El usuario indicó modalidad **Open Source** y pidió preparar el proyecto y automatizar futuras entregas. Estado: configuración local inicial; **no se ha creado el proyecto remoto, emitido certificado, enviado solicitud ni firmado un archivo**. La beta existente sigue sin firma.

[Lista previa a la apertura pública](OPEN_SOURCE_CHECKLIST.md) · `Validación local de esta preparación` (archivo no incluido en este repositorio: `SignPath_preparacion_2026-10-29.md`).

## Decisiones y acceso pendientes

- El usuario eligió **MIT** y preparar la apertura del código. LICENSE, metadatos y guía de contribución añadidos. No se ha publicado ni cambiado la visibilidad de un repositorio.
- Origin sigue en GitLab. El usuario decidió trasladarlo a **GitHub una vez terminado**; URL pública definitiva pendiente. La automatización se prepara para ese futuro repositorio, sin cambiar origin.
- El usuario configurará personalmente el portal con los pasos siguientes. No se piden contraseñas, tokens ni claves privadas por chat.
- Confirmar elegibilidad/aprobación OSS y disponibilidad del certificado para RavenGit. Tener una cuenta no prueba que el proyecto esté aprobado. Quedan revisión de licencias de dependencias, publicación y responsables de firma.

## Proyecto propuesto para revisar en el portal

| Campo | Valor propuesto |
| --- | --- |
| Name | RavenGit |
| Slug | ravengit |
| Description | Cliente Git de escritorio para Windows y macOS; firma Authenticode de los artefactos de Windows |
| Repository URL | URL pública definitiva de GitHub; pendiente, no usar una URL inventada |
| Artifact Configuration de la beta | windows-beta-installer |
| Artifact Configuration del ejecutable | windows-beta-app |
| Signing Policy de release | release-signing, con aprobación humana y verificación de origen |
| Certificado | Seleccionar sólo el certificado autorizado para este proyecto por SignPath; pendiente |
| Roles | Definir responsables de desarrollo/revisión/aprobación con el usuario; no otorgados automáticamente |

Las configuraciones XML adyacentes limitan nombre, producto y versión requerida mediante parámetro. Su raíz ZIP corresponde al artefacto generado por GitHub Actions. Son borradores para importar/revisar en SignPath, no configuraciones ya aceptadas por su servicio.

## Pasos del portal que completa el usuario

1. Entrar en [SignPath](https://app.signpath.io), seleccionar la organización OSS y comprobar el estado de la solicitud del proyecto. Si no aparece opción para añadir proyectos/certificados, seguir el proceso de aprobación OSS; no crear un certificado autofirmado y tratarlo como firma pública.
2. Crear el proyecto con Name **RavenGit**, Slug **ravengit** y, cuando exista, la URL definitiva del repositorio público GitHub. Si la edición exige hacerlo mediante soporte/aprobación, solicitarlo por ese canal.
3. Añadir/importar dos Artifact Configurations con slugs **windows-beta-app** y **windows-beta-installer**, usando los XML de `docs/releases/signpath/`. Revisar su aceptación en el portal. Ambos exigen el parámetro `version`.
4. En Trusted Build Systems añadir el predefinido **GitHub.com** a la organización y enlazarlo con RavenGit. Seguir la integración oficial y limitar el acceso de la GitHub App al repositorio elegido. No conceder acceso a todos los repositorios por comodidad.
5. Crear o revisar **release-signing**, seleccionar el certificado de release autorizado para RavenGit y conservar aprobación humana y verificación de origen. Restringir origen al repositorio y workflow revisados. Configurar responsables efectivos y MFA conforme a las condiciones OSS.
6. Copiar Organization ID y la huella del certificado público (no la clave privada). Crear el acceso CI mínimo permitido y guardar su token directamente como secreto de GitHub, sin pasarlo por chat. El usuario aprueba las solicitudes en SignPath.

Antes de solicitar el certificado, completar la [Code signing policy](CODE_SIGNING_POLICY.md) con URL y responsables reales, revisión de dependencias, atribución aprobada y divulgaciones requeridas. Este borrador no afirma patrocinio o aceptación de SignPath.

## Variables de GitHub

Crear el environment **windows-signing**, con reglas explícitas para la rama predeterminada (ejecución manual) y tags **`v*-beta.*`** (automático), conservando los controles de revisión. Si sólo permite ramas, el job por tag quedará bloqueado. Revisar también que las políticas de origen de SignPath admitan estos tags del repositorio/workflow autorizado sin retirar la aprobación humana. Definir estas variables en el **repositorio** (la condición previa al job necesita leer SIGNPATH_ENABLED):

| Variable | Valor |
| --- | --- |
| SIGNPATH_ENABLED | `false` hasta terminar aprobación, configuración y revisión; después `true` |
| SIGNPATH_ORGANIZATION_ID | ID real de la organización |
| SIGNPATH_PROJECT_SLUG | `ravengit` |
| SIGNPATH_SIGNING_POLICY_SLUG | `release-signing` |
| SIGNPATH_CERTIFICATE_THUMBPRINT | Huella SHA1 de 40 caracteres del certificado autorizado; no es una contraseña |

Secreto del environment: **SIGNPATH_API_TOKEN**, acceso de envío limitado al proyecto/política. No hace falta un PAT de GitHub en el workflow: utiliza GITHUB_TOKEN con `contents: read` y `actions: read`.

## Alcance de la firma

El NSIS se puede tratar como PE para firmar **el instalador exterior**. Esto no certifica ni firma automáticamente el `ravengit.exe` comprimido dentro. No hay soporte NSIS compuesto documentado en la referencia consultada de SignPath; no se extrapola su ejemplo de firma profunda MSI a NSIS.

Flujo preparado: compilar sin bundle → firmar el ejecutable → empaquetar con `--no-sign --no-binary-patching` → firmar el instalador → verificar ambos y regenerar hashes. La CLI instalada admite esa opción para conservar la firma; este producto no tiene actualizador por tipo de bundle. Se compara el hash del ejecutable antes/después del empaquetado y tras la instalación de aceptación. No se firman DLL de terceros.

La firma Authenticode de Windows es distinta de la firma del actualizador de Tauri y de la firma/notarización Apple. No se añade actualización automática a RavenGit.

## Automatización preparada, pendiente de aceptación real

Archivo: `.github/workflows/windows-signpath.yml`. Ejecución automática al **subir un tag `vX.Y.Z-beta.N`** y alternativa manual en la rama predeterminada, sólo en repositorio público y con activación explícita de SignPath. No se ejecuta por push de rama ni por PR. El tag debe coincidir con la versión y el commit debe estar integrado en la rama predeterminada; se comprueban antes de utilizar las credenciales de firma. Usa Windows alojado por GitHub, Rust 1.99.1, Node 24 y acciones fijadas por revisión consultada en sus repositorios oficiales. El flujo sigue limitado a beta, no stable. [Guía de tags](TAGS_BETA.md).

1. Compilación Windows x64 desde una revisión identificable, versiones coordinadas y pruebas de entrega aprobadas.
2. Conservar el artefacto en CI y enviar la solicitud mediante la integración oficial. Separar permisos de envío y aprobación.
3. Esperar aprobación humana, descargar la copia firmada a otra carpeta y comprobar Authenticode, certificado esperado, timestamp, producto y versión.
4. Verificar el ejecutable instalado además del instalador, generar SHA256 y manifiesto nuevos. Conservar los hashes anteriores como evidencia del artefacto sin firma.
5. Dejar los archivos como artefactos revisables. Publicar release/tag es una acción independiente; no habilitar publicación implícita.

El workflow conserva el ejecutable firmado dentro del NSIS, verifica Authenticode contra la huella esperada y exige sello de tiempo. Instala sólo en el runner efímero de GitHub, bajo RUNNER_TEMP, y exige que el ejecutable instalado sea idéntico al firmado. El resultado queda como artefacto descargable, con licencia, notas, SHA256 y manifiesto; no se publica un release. Habrá dos solicitudes/aprobaciones por ejecución. El timeout total es 120 minutos; cada espera de aprobación tiene 30 minutos.

Los secretos se configuran directamente en CI, con alcance restringido; nunca en archivos versionados ni en logs. La primera ejecución remota, las políticas XML aceptadas por el servidor y las firmas reales siguen pendientes. Revisar los requisitos efectivos de SignPath para los artefactos derivados entre ambas solicitudes. No se declara verificación de origen ya aprobada.

## Próximo paso

Completar los pasos del portal y la preparación pública; migrar sólo cuando el usuario lo indique. Después activar la variable y subir un tag beta revisado o ejecutar manualmente desde la rama predeterminada. Aprobar las solicitudes en SignPath, descargar el resultado firmado y registrar evidencia antes de distribuir. La beta local histórica conserva sus hashes y estado sin firma.

## Fuentes oficiales consultadas

- [Condiciones OSS y certificado Foundation](https://signpath.org/terms).
- [Proyectos y políticas](https://docs.signpath.io/projects).
- [Integración GitHub](https://docs.signpath.io/trusted-build-systems/github).
- [Tipos de archivos admitidos](https://docs.signpath.io/artifact-configuration/reference).
- [Sintaxis y restricciones](https://docs.signpath.io/artifact-configuration/syntax).
- [Firma Windows con Tauri](https://v2.tauri.app/distribute/sign/windows/).
