# Inicializar un repositorio nuevo

> Actualización macOS del 22/10: Creación y apertura nativas en macOS comprobadas: main, vacío, sin remotos/autor inventado/hooks de plantilla. Errores y otras plataformas conservan límites. Véanse [evidencia y alcance](MacOS_actual_2026-10-22.md). El registro original de este documento se conserva a continuación.


Fecha: 2026-10-22. Primer incremento C de RG-01, sobre `6533312` y cambios locales
anteriores. Desarrollo 0.4.2, sin declarar publicación ni finalización del MVP.

## Uso y alcance

En el lateral, Nuevo repositorio… funciona con o sin repositorio activo. Elegir
una carpeta contenedora existente, indicar el nombre de una carpeta nueva y la
rama inicial (`main` inicialmente), revisar el destino y confirmar por separado.
Cambiar ubicación, nombre o rama invalida la confirmación.

Sólo crea una carpeta nueva mediante creación exclusiva: rechaza destinos
existentes, incluso vacíos. No convierte carpetas con código existente ni
reinicializa repositorios. Para un repositorio existente se usa Abrir. No crea
commits, archivos de proyecto, remotos ni cuentas y no contacta servidores.
Clonar, amend y tags ligeros siguen en incrementos posteriores de C.

Al terminar, abre la ruta devuelta por Rust mediante el flujo normal de apertura,
que recuerda el repositorio en la biblioteca. No altera el repositorio anterior
al crear; la apertura posterior cambia la selección con sus reglas normales.
No concede confianza persistente automáticamente. Las operaciones posteriores
requieren su autorización habitual; no se inventan nombre/email de autor.

Si la creación termina pero falla la apertura, conserva el éxito y ofrece Abrir
repositorio creado. Ese botón sólo repite apertura, nunca `git init`. Un error de
creación consume la confirmación; no hay reintento automático. La carpeta nueva
puede contener una inicialización parcial: se conserva para inspección, sin
limpieza recursiva ni borrado de archivos como supuesto rollback.

## Precondiciones y ejecución

- Ruta contenedora absoluta, accesible, directorio y canonicalizada. Rechaza
  ancestros con `.git` (directorio, archivo o enlace) y marcadores de repositorio
  bare. No se crean repositorios anidados ni dentro de worktrees enlazados.
- Nombre de una sola carpeta, hasta 100 caracteres/255 bytes, sin traversal,
  separadores, controles ni nombres reservados básicos de Windows; no acaba en
  punto/espacio. Los límites y permisos adicionales los aplica el sistema.
- Rama explícita, sin opciones ni controles, hasta 255 bytes; se verifica con
  `git check-ref-format refs/heads/…` antes de crear la carpeta. HEAD no se admite
  como nombre. Git disponible se comprueba en ese paso, antes de escribir.
- Worker asíncrono y mutex global de escrituras; proceso contenido con límite
  de 15 s. La UI bloquea doble envío y cierre durante una solicitud.
- Git sin shell, argumentos separados, `--initial-branch=…`, `--object-format=sha1`
  y `--template=`. Se ignoran configuración global/sistema y variables de inyección
  de configuración, plantillas y almacenamiento Git durante la creación. No se
  copian hooks de plantillas. No se cambia la configuración global del usuario.
- Tras Git, se verifica `.git` y HEAD simbólico contra la rama solicitada. No se
  informa éxito si no se puede verificar. Los errores no exponen stderr sin filtrar.
- Sólo se añade `initialize_repository` al IPC; no se amplían capacidades Tauri.
  No se promete aislamiento frente a otros procesos que modifiquen rutas entre
  comprobaciones, ni recuperación automática de una interrupción forzada.

## Evidencia

Windows x64, Git 2.56.0.windows.2 y toolchain del registro Windows actual.
**6 pruebas Rust de inicialización aprobadas**, con directorios temporales reales:
creación sin commits/remotos/hooks y rama elegida, apertura del repositorio vacío,
conservación de destinos existentes y contenido, nombres/ramas inválidos, rutas
ausentes/relativas/archivo, repositorios anidados/gitfile/bare y aislamiento de
entorno de creación. Se ejecutó:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --offline initialize::tests
```

Las pruebas de interfaz usan IPC simulado, no crean repositorios del usuario.
Resultado: **132 pruebas de interfaz aprobadas en 16 archivos**, incluidas 6 del
diálogo nuevo y su integración desde App. TypeScript/Vite y compilación Windows
debug sin bundle, Clippy con `-D warnings`, formato Rust, Prettier y
`git diff --check` aprobados. Cargo copió la caché incremental al no poder crear
enlaces duros; el build terminó correctamente. No se ejecutó el nuevo flujo mediante
la aplicación nativa en esta revisión.
Cubren confirmación invalidable, creación única, cierre seguro, errores sin retry,
reintento exclusivo de apertura y entrada desde la aplicación sin repositorio activo.
No se presenta la suite Rust anterior como repetida por este incremento.

## Comprobación nativa pendiente

Seguimiento del usuario: confirmó que la inicialización funciona sin problemas.
Se registra ese resultado informado, sin extrapolarlo a todos los casos de error,
teclado/escalado ni a macOS. El siguiente incremento implementa clonado por separado.

1. Elegir una carpeta temporal fuera de repositorios; crear una subcarpeta nueva
   con rama explícita y comprobar apertura vacía y entrada en la biblioteca.
2. Cerrar/reabrir y abrir esa entrada. Autorizar por separado si se van a hacer
   operaciones locales. La identidad de commit se configura como en Git normal.
3. Intentar usar un nombre de carpeta existente y una ubicación dentro de otro
   repositorio de prueba; comprobar rechazo sin cambios en sus archivos/refs.
4. Revisar teclado, Escape, ventana mínima y escalado en el ejecutable Windows;
   repetir en macOS antes de certificarlo allí.

RG-01 y AC-01/12 siguen parciales: no incluye clonado, inicialización de carpetas
con contenido, Git embebido, instalación limpia ni certificación multiplataforma.
