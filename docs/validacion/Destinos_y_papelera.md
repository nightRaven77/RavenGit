# Destinos y Papelera

Incremento sobre fuentes locales sin publicar, Windows, 22 de octubre de 2026.

## Comportamiento

- Abrir Nuevo/Clonar prepara `RavenGit/Repositorios` dentro de Documentos, resuelto mediante la carpeta conocida del sistema. No traslada repositorios existentes ni sobrescribe archivos. Si falla, permite elegir otra ubicación.
- Clonar sugiere la carpeta desde la URL SSH/HTTPS o ruta local, sin consultar la red. Elimina `.git` y normaliza caracteres incompatibles. Una edición manual tiene prioridad; una respuesta tardía del destino predeterminado no sustituye la ubicación elegida.
- Quitar de la lista conserva la carpeta por defecto. La casilla separada de Papelera exige revisar la ruta y escribir exactamente el nombre de la carpeta.
- La carpeta incluye cambios sin commit, archivos no seguidos y commits no publicados. No elimina el remoto. Recuperar depende del sistema y de que no se vacíe la Papelera.
- El plan es de un uso; cambios detectados tras revisar obligan a revisar de nuevo. No hay reintento automático. Ante resultado incierto, inspeccionar carpeta y Papelera antes de repetir.
- Al eliminar el repositorio activo se cierra su vista y se revoca su autorización. Si falla guardar la biblioteca después del traslado, se advierte sin repetir la operación física.

## Protecciones

Sólo entradas registradas con `.git` de directorio. Rechaza raíces, carpetas protegidas o sus ancestros, solapamientos con otras entradas, repositorios anidados, worktrees enlazados, submódulos registrados, enlaces simbólicos y puntos de reanálisis/junctions. Revisión limitada a 100 000 entradas y 15 segundos, con huella de rutas y metadatos; no equivale a aislamiento frente a modificaciones externas concurrentes.

Windows utiliza `IFileOperation` con `FOFX_RECYCLEONDELETE` y `FOFX_EARLYFAILURE`, sin borrado permanente alternativo. [Referencia oficial de flags](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags.md).

macOS utiliza `trash` 5.2.9; no se ejecutó en esta plataforma. Linux no habilita traslado a Papelera en este incremento y conserva quitar sólo de la lista.

## Evidencia y aceptación pendiente

- Interfaz: 156 pruebas aprobadas en 17 archivos, incluidas sugerencia de nombre, destino tardío, cancelación, confirmación escrita, fallo y cierre del repositorio activo.
- Rust: pruebas focalizadas sobre carpetas temporales verifican destino idempotente, rechazo de rutas peligrosas, cambios tras revisión y errores del traslado. El traslado satisfactorio se simula mediante renombrado dentro del fixture: no prueba la Papelera real.
- Filtro Rust `repository_`: 9 aprobadas. Prettier, Rustfmt, Clippy con advertencias denegadas, TypeScript/Vite y compilación Windows debug sin bundle aprobados. Ejecutable: `src-tauri/target/debug/ravengit.exe`. No se generó instalador ni se ejecutó una compilación macOS.
- Regresión de biblioteca Rust: 12 aprobadas; preservación de metadatos, preferencias y colecciones. No se repitió la suite Rust completa.
- Pendiente aceptación nativa Windows y macOS: crear/clonar sin elegir destino, editar nombre, quitar sólo metadatos y trasladar un repositorio desechable a Papelera; comprobar recuperación desde el sistema. No usar un repositorio único sin respaldo.
