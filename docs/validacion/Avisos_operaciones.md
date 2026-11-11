# Avisos de operaciones · primer incremento: Push

22 de octubre de 2026 · versión de desarrollo 0.4.2. Cambios sin publicar sobre `374c594`, conservando el incremento anterior de Stash.

## Comportamiento implementado

Push informa su progreso y resultado en una zona general de avisos, visible también al cambiar de vista o abrir otro repositorio. Cada operación conserva su nombre de repositorio, ubicación y destino revisado (`rama local → remoto/rama de destino`). Los avisos anteriores no se borran al comenzar otra publicación; cada resultado tiene cierre independiente. La zona admite desplazamiento si acumula mensajes.

Los resultados permanecen durante la sesión hasta cerrarlos. No hay diálogo adicional que aceptar después de publicar, cierre automático ni almacenamiento de notificaciones entre reinicios. Esta zona no sustituye el futuro registro de actividad de RG-09.

| Estado | Mensaje | Condición |
| --- | --- | --- |
| En curso | Push en curso | Publicación revisada enviada a Rust; controles bloqueados durante el trabajo |
| Éxito confirmado | Push completado | Git terminó y la consulta posterior confirmó el hash esperado en la rama del destino |
| Sin nuevos commits | Destino al día | Destino ya igual al origen; la confirmación sólo era necesaria para el seguimiento solicitado |
| Éxito con advertencia | Push completado y detalle | Publicación confirmada, pero seguimiento o refresco local incompletos |
| Error previo | Push no iniciado | Códigos explícitos de revisión caducada, confianza, repositorio cambiado u ocupación anteriores al envío |
| Resultado incierto | Push sin confirmar | Comando interrumpido/rechazado sin garantía del resultado, respuesta no reconocida o verificación remota inconclusa |

No se deduce el éxito de una cadena de texto. Rust devuelve `confirmed`, `unchanged` o `uncertain`; un estado ausente/desconocido se trata de forma conservadora como incierto. Los errores no clasificados como anteriores al envío también requieren comprobar el destino. No hay reintento automático ni force push.

Si el refresco falla después de un éxito, se conserva el título de publicación confirmada y se añade la advertencia de actualizar la vista, sin recomendar repetir Push. El backend sigue consumiendo la revisión y el frontend mantiene el bloqueo de envío duplicado.

## Interfaz y accesibilidad

Reutiliza los banners, tipografía y colores de RavenGit: Azure para información/éxito, advertencia para resultados que requieren revisión y carmesí para errores anteriores al envío. El texto y el icono distinguen estados sin depender sólo del color. Éxito/progreso usan `role=status`; advertencias, errores e incertidumbre usan `role=alert`, con anuncio atómico. No se mueve el foco al mostrar un aviso. El resultado incluye un botón con nombre accesible para cerrarlo; el progreso permanece visible mientras sigue pendiente.

Esto acredita estructura accesible comprobada por pruebas DOM, no una certificación con lector de pantalla.

## Verificación automatizada

- **212 pruebas de interfaz en 23 archivos**, todas aprobadas. Nueve casos nuevos cubren progreso/contexto, éxito, igualdad, incertidumbre, fallo de refresco, error previo, cierre y foco. La prueba de integración existente se amplió para cambiar de vista y repositorio conservando el contexto original, y después cerrar el resultado. IPC simulado, sin contacto con proveedores.
- **152 pruebas Rust**, todas aprobadas, más doctests sin casos. Se añadieron dos escenarios Git reales en repositorios desechables: destino ya igual con seguimiento y comando exitoso cuyo servidor modifica el tip antes de verificarlo. Se reforzaron aserciones de estado en éxito y advertencia por seguimiento.
- Clippy all-targets con `-D warnings`, Rustfmt, Prettier y TypeScript/Vite aprobados. Bundle debug macOS ARM64 generado para el recorrido nativo.

La primera ejecución UI encontró un selector de prueba demasiado específico para el botón Historial; se corrigió para usar la navegación accesible y se repitió la suite. No se cuenta esa ejecución como aprobada.

## Validación nativa y límites

El recorrido nativo se registrará después de inspeccionar el bundle. No se extrapolan los mocks a Git real ni la ejecución Mac a Windows.

Este incremento conecta los avisos generales únicamente con Push. Fetch, Pull, commit/amend, ramas, tags y Stash conservan sus mensajes actuales y quedan pendientes de unificación. Tampoco incluye historial persistente, exportación de diagnóstico, notificaciones del sistema operativo ni prueba completa de lector de pantalla, ventana mínima y proveedores reales.
