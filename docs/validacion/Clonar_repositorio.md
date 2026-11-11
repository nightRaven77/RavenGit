# Clonar un repositorio

> Actualización macOS del 22/10: Clonado y apertura nativas en macOS desde bare local comprobados, con HEAD/árbol/upstream y archivos verificados. No certifica SSH/HTTPS externos. Véanse [evidencia y alcance](MacOS_actual_2026-10-22.md). El registro original de este documento se conserva a continuación.


Fecha: 2026-10-22. Incremento C de RG-01 sobre `6533312` y cambios locales de
biblioteca e inicialización; desarrollo 0.4.2, sin declarar publicación.

## Uso

Clonar repositorio… en el lateral permite indicar origen, carpeta contenedora y
nombre de carpeta nueva. Admite HTTPS sin credenciales incrustadas, SSH/SCP y
rutas locales absolutas o `file://`. No requiere un repositorio activo. Cambiar
origen o destino invalida la confirmación. Se acepta explícitamente la confianza
en el origen y la configuración/filtros Git propios antes de ejecutar.

Sólo usa un destino nuevo y fuera de otros repositorios. No sobrescribe carpetas
existentes, incluso vacías. Un origen local absoluto se canonicaliza y se convierte
a `file://`, evitando problemas con rutas extendidas de Windows y caracteres Unicode.
Ese URL normalizado queda como `origin`. Para HTTPS/SSH se conserva la URL aceptada.

Git descarga y materializa la rama elegida por HEAD del servidor, configura origin
y su seguimiento normal; un remoto vacío puede abrirse sin commits. No publica
cambios. No permite en este incremento elegir ramas, profundidad, clon parcial,
mirror/bare ni opciones arbitrarias. Usa `--no-local` para evitar optimizaciones
locales que compartan objetos mediante enlaces; no crea alternates propios.

Si hay referencias descargadas pero falta un HEAD remoto utilizable, conserva un
aviso visible tras abrir y no cierra el diálogo silenciosamente: indica revisar las
referencias y seleccionar una rama antes de trabajar. No afirma un checkout completo
ni inventa una rama de destino desde la aplicación.

No inicializa submódulos y omite la descarga automática LFS con
`GIT_LFS_SKIP_SMUDGE=1`; pueden quedar punteros LFS. Los filtros configurados por el
usuario aún pueden ejecutar herramientas externas durante el checkout. No hay
aislamiento completo de efectos de helpers/filtros ni de procesos ajenos que cambien
rutas/configuración entre comprobaciones. La confirmación no autoriza automáticamente
futuras escrituras del repositorio en RavenGit.

## Transporte, errores y recuperación

- Reutiliza el ejecutor común de remotos, sanitización de diagnósticos y selección
  SSH existente, incluidos agente de Windows y configuración de macOS. Respeta
  credenciales Git/sistema sin introducir OAuth, secretos propios ni login web.
- Mantiene los controles de protocolo, TLS, redirecciones y verificación de host
  del transporte existente; no acepta claves desconocidas ni modifica known_hosts.
- Antes de contactar, `ls-remote --get-url` comprueba localmente que la configuración
  visible no reescriba el origen mediante insteadOf. Una reescritura se rechaza sin
  mostrar su destino potencialmente sensible. El origen se verifica otra vez tras
  clonar. No se presenta esto como aislamiento contra configuración Git arbitraria
  del propio usuario, que se acepta explícitamente en la confirmación.
- Descarta variables ambientales de almacenamiento/inyección de configuración para
  el proceso de clonado, pero mantiene configuración global necesaria para acceso.
  Fija el árbol de trabajo al destino, desactiva recursión de submódulos, evita
  plantillas/hooks durante clone y activa las protecciones de rutas NTFS/HFS de Git.
  No modifica configuración global ni la del repositorio fuente.
- Worker asíncrono y mutex de escrituras. Plazo de transporte de 60 s; indica trabajo
  en curso sin inventar porcentaje. Cerrar y doble envío se bloquean mientras trabaja.
- Si Git falla o el resultado es incierto, no hay reintento ni borrado recursivo
  automático por RavenGit. Revisar el destino parcial antes de elegir otro intento.
  Git puede limpiar sus propios archivos al fallar; no se promete conservar cada
  objeto descargado. Las carpetas previas ajenas nunca se usan como destino.
- Si el clonado se confirma pero abrir falla, Abrir repositorio clonado repite sólo
  la apertura. Una apertura correcta pasa por el flujo normal y recuerda la biblioteca.

Se añade `clone_repository` al IPC existente sin ampliar capacidades Tauri. El
diálogo de creación comparte su estructura con la inicialización y mantiene
separados sus contratos (`parent/name/url` frente a `parent/name/branch`).

## Evidencia y límites

Windows x64 / Git 2.56.0.windows.2. Seis pruebas Rust específicas de clonado con
fixtures temporales locales: copia de historial/archivos/seguimiento, origen vacío,
rechazo de destinos/nesting/nombres inseguros, URLs con secretos/protocolos no
admitidos, fallo de acceso, HEAD remoto inexistente y reescritura de URL sin contacto ni filtración del destino.
Se conservan archivos/HEAD del origen y archivos ajenos de la fixture. El diagnóstico
inicial detectó problemas de rutas extendidas Windows; convertir orígenes locales
a file:// resolvió la regresión.

**138 pruebas de interfaz aprobadas en 16 archivos**: contrato de clonado, consentimiento
invalidable, error SSH sin retry, reapertura sin reclonar y acceso desde App sin
repositorio activo. Se conserva la cobertura de inicialización, cierre y bloqueo.
Se repitieron además las suites de remotos (13), SSH (4) e inicialización (6):
**29 pruebas Rust afectadas aprobadas**, no una suite completa del núcleo.
TypeScript/Vite, Clippy con `-D warnings`, formato Rust, Prettier,
`git diff --check` y build Windows debug sin bundle aprobados. Cargo copió su caché
incremental cuando no pudo crear enlaces duros; no impidió el build.
La interfaz usa IPC simulado;
las pruebas Rust no usaron proveedores reales ni credenciales del usuario.

No se declara la suite Rust completa de Git repetida ni aceptación nativa del nuevo
flujo. El usuario confirmó la inicialización anterior; eso no certifica este clonado.

## Comprobación nativa pendiente

1. Abrir Clonar repositorio…, indicar un origen de prueba autorizado y un nombre
   nuevo bajo una carpeta fuera de repositorios; revisar origen/destino y confirmar.
2. Comprobar archivos, HEAD, origin y upstream de la copia; no debe cambiar el origen.
3. Cerrar/reabrir y abrir desde la biblioteca. Verificar SSH/HTTPS con credenciales
   Git ya configuradas en el sistema, sin pegarlas en la URL.
4. Probar un destino existente y un origen inválido; no deben sobrescribirse carpetas
   previas ni repetirse el clonado automáticamente. Inspeccionar destinos parciales.
5. Repetir en macOS y en la matriz de proveedores antes de dar esa aceptación por
   cerrada. Revisar teclado, ventana mínima/escalado y clones superiores a 60 s.

RG-01/AC-04/12 permanecen parciales. Después corresponde continuar C con amend
explícito y tags ligeros en incrementos separados, sin force push ni reset destructivo.
