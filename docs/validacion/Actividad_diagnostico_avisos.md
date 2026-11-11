# Actividad, diagnóstico y avisos globales

27 de octubre de 2026 · versión de desarrollo 0.4.2 · cambios sin commit sobre `eb6621d`.

## Alcance implementado

**Herramientas → Actividad y diagnóstico…** consulta un registro local persistente y acotado a 500 resultados finales. Cada entrada contiene sólo fecha, tipo de operación, estado y, cuando puede obtenerse desde el repositorio ya abierto en Rust, el nombre de su carpeta. No persiste rutas completas, URLs, credenciales, ramas, tags, hashes, mensajes de commit, diffs, stdout ni stderr.

El archivo se valida antes de leer o reemplazar, rechaza enlaces y estados corruptos, serializa escrituras y conserva el contenido anterior ante un fallo. **Borrar actividad local** exige consentimiento y un token de estado vigente; no modifica repositorios ni respaldos.

La exportación escribe JSON únicamente en el destino elegido por la persona. Sustituye los nombres de carpeta por `Repositorio N` e incluye versión de RavenGit, plataforma, arquitectura, conteo, resultados sanitizados y exclusiones explícitas. No contacta servidores ni incorpora configuración Git o del sistema.

Los avisos generales de la sesión se extendieron desde Push a inicializar/clonar, autorización, preparación individual/múltiple, commit/amend, remotos, Fetch/Pull, ramas, tags, Stash, merge/rebase, cherry-pick/revert, conflictos, recuperación de respaldo y perfiles SSH. Progreso y resultado comparten un identificador; no hay reintentos automáticos. Un fallo de refresco posterior conserva el éxito de la operación y se presenta como advertencia. Los detalles útiles pueden aparecer en el aviso de sesión, pero sólo `operación + estado` cruzan al comando de persistencia.

## Seguridad y límites

- La actividad no es un log de auditoría ni acredita que un proveedor remoto aceptó una operación más allá de la confirmación específica de cada flujo.
- El registro puede perder la asociación de carpeta cuando la operación todavía no tiene un repositorio abierto, como inicializar o clonar. No se persiste la ruta para compensarlo.
- No se capturan bloqueos, procesos, variables de entorno, configuración SSH/Git, identidad efectiva ni permisos del proveedor.
- El exportado no incluye logs técnicos brutos. Un diagnóstico futuro puede ampliar campos sólo después de definir y probar su sanitización.
- Los avisos permanecen hasta cerrarlos o terminar la sesión; el historial persistente guarda resultados finales, no progresos.
- Esta implementación y sus pruebas locales no certifican Windows, lector de pantalla, proveedores reales ni instalación/publicación.

## Verificación automatizada

- **264 pruebas UI en 29 archivos**, todas aprobadas. Los casos nuevos cubren explicación de privacidad, lectura, exportación, rechazo del selector nativo, consentimiento/token de borrado y el paso de un resultado global al IPC sanitizado. Las pruebas de los paneles siguen usando IPC simulado y no contactan proveedores.
- **196 pruebas Rust aprobadas y 1 manual ignorada**. Tres pruebas nuevas comprueban límite/persistencia/borrado obsoleto, exportación con nombres neutros sin rutas/URLs y conservación exacta de un archivo corrupto. Los demás casos usan repositorios desechables.
- TypeScript/Vite, Rustfmt y Clippy `--all-targets -D warnings` aprobados. Bundle debug ARM64 aislado generado; las pruebas automatizadas no sustituyen el recorrido siguiente.

## Aceptación nativa macOS acotada

Se utilizó `RavenGit Activity Acceptance`, identificador `dev.ravengit.activityaccept.20261027`, en una compilación y configuración independientes a 900 × 640. SHA-256 final del binario: `f1daeae8739e32b525558846c708f7dd794af35bb990b8cccb346194407eeabe`. RavenGit normal no se abrió. La fixture desechable se conserva en `/private/tmp/ravengit-activity-accept.36r35u`; no se envió nada a Papelera.

- Autorizar la fixture y preparar `archivo.txt` mostraron avisos globales de progreso/resultado. HEAD permaneció en `7c00340abe43cf9105037827b0605d9d9fae77de`; sólo el cambio previsto quedó preparado.
- Actividad mostró dos entradas (`trust` y `stage`) con estado completado y nombre de carpeta, sin ruta visible en el registro. Tras cerrar y reabrir la instancia, las dos entradas seguían disponibles incluso sin abrir el repositorio.
- Exportar abrió el selector nativo, escribió dos eventos con `Repositorio 1` y exclusiones explícitas. La inspección independiente del JSON no encontró la ruta de la fixture, archivo, contenido, URL ni credencial.
- El bundle final propuso `ravengit-diagnostico-2026-10-27`, usando la fecha local pese a que UTC ya había cambiado de día; esa exportación de comprobación se canceló sin sobrescribir el archivo anterior.
- El borrado estuvo deshabilitado hasta marcar el consentimiento y volvió a quedar deshabilitado al retirarlo. No se ejecutó el borrado nativo; token obsoleto, consentimiento y vaciado efectivo están cubiertos automáticamente.

La primera pasada detectó que faltaba `dialog:allow-save` y que el rechazo del selector no quedaba capturado. Se añadió la capacidad mínima, se incorporó el selector al manejo de errores y una regresión; después se reconstruyó desde un target temporal limpio y el recorrido anterior pasó.

Windows, lector de pantalla, varios cientos de eventos, corrupción/errores reales de permisos y borrado nativo efectivo permanecen pendientes. Esta aceptación no certifica proveedores ni publicación.
