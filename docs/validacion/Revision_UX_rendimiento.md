# Revisión de interfaz, rendimiento y UX

22 de octubre de 2026 · fuentes locales sobre `fb4e614`, incluyendo amend sin publicar. El usuario confirmó el funcionamiento de amend antes de esta revisión. Se detiene el avance funcional de tags para consolidar la experiencia actual.

## Dirección de diseño

Conservar la identidad Obsidian/Azure/carmesí, las fuentes de sistema y la navegación Cambios/Historial/Sincronizar. Base `#0b0f17`, lateral `#101620`, contexto `#111925`, texto `#e6edf5`, acción `#52b7ff`, peligro `#ff667d`. No añadir paneles ornamentales ni rediseñar la aplicación completa sin evidencia de uso.

Primero legibilidad y trabajo visible; después detalle técnico bajo demanda. Las acciones de navegación no deben confundirse con cambios Git. Las advertencias de publicación, permisos y borrado no se retiran para reducir clics.

## Hallazgos y primera corrección

| Hallazgo comprobado en código | Cambio aplicado | Evidencia / límite |
| --- | --- | --- |
| El historial estaba virtualizado, pero buscar montaba todas las coincidencias | La búsqueda reutiliza la ventana virtual, con claves separadas y altura de 64 px; búsqueda diferida e índice normalizado reutilizable | Prueba con 10 000 coincidencias y ventana simulada de 8: sólo 8 botones. Comprueba el consumo de la ventana; no mide el virtualizador real ni p95 |
| Buscar mostraba las cabeceras Grafo/Fecha aunque los resultados tenían otro diseño | Resultados con hash, mensaje y autor; cabecera del grafo sólo al limpiar; texto completo disponible en título | Sin cambiar el alcance: sólo commits cargados, sin búsqueda remota |
| Consultas de diff de historial continuaban fuera de Historial o con inspector cerrado | No se inicia una nueva consulta en esas condiciones; al volver a mostrar el detalle se lee de nuevo | Contadores IPC en integración; ignorar respuesta obsoleta no cancela un proceso Git ya iniciado |
| Cambios podía consultar el diff conservado al volver antes de recibir el estado fresco | Se descarta el estado de lectura al ocultar, conservando el borrador; sólo pide diff después del nuevo estado visible | Prueba con respuesta de estado diferida y token actualizado |
| Diff unificado calculaba las filas de comparación dividida sin usarlas | El contenido unificado no calcula ese modelo; contenido memorizado si texto/formato no cambian | Espía del parser y regresión de alternancia. El control de disponibilidad sigue comprobando compatibilidad una vez |
| Cerrar biblioteca estaba bloqueado durante la lectura inicial de disco | Cerrar/Escape disponibles durante la carga inicial, bloqueados durante acciones en curso | No se cancela una escritura ni se elimina la protección de Papelera |
| Seleccionar una referencia del lateral podía parecer un cambio de rama | Ayuda de la referencia aclara que localiza el commit sin cambiar la rama activa | Revisar en nativo si la indicación es suficiente; cambio real sigue en Ramas |

La búsqueda incorpora Flechas/Inicio/Fin para seleccionar y desplazar la ventana, estado seleccionado y anuncio de conteo. No equivale a certificar toda la navegación de la aplicación con lector de pantalla.

## Validación de esta pasada

- 170 pruebas de interfaz aprobadas en 18 archivos; incluye 5 regresiones nuevas y 57 pruebas focalizadas aprobadas previamente.
- TypeScript/Vite, Prettier y `git diff --check` aprobados. Sin nuevas dependencias ni cambios en contratos o mutaciones Git durante esta pasada; se conservan los cambios previos de amend.
- Compilación Windows debug sin bundle aprobada: `src-tauri/target/debug/ravengit.exe`. No se generó instalador ni se ejecutó el recorrido nativo en esta revisión.
- No se repitió la suite Rust ni se ejecutó una auditoría visual/lector de pantalla. Los límites de los fixtures y la ventana virtual simulada se mantienen explícitos.

## Próximas pasadas priorizadas

1. **Nativa Windows/macOS:** 900 × 640 y escalado; buscar/limpiar/desplazarse, mensajes/autores largos, mantener foco, abrir/cerrar biblioteca y alternar Cambios/Historial sin perder borrador. La revisión presente es de código y pruebas, no una inspección visual nativa.
2. **Simplificación de flujos:** unificar vocabulario de descarga/publicación, revisar duplicaciones entre barra y paneles y presentar detalle técnico de forma progresiva. No fusionar Fetch e integración ni ocultar el destino o la confirmación de publicación/borrado.
3. **Rendimiento medido:** fixture real de 100 000 commits y diff de 1 MiB; tiempo hasta vista utilizable, búsqueda/paginación, memoria y p95 frío/caliente. Medir IPC/Git por separado del render. Aún no se acredita el objetivo RG-02.
4. **Accesibilidad:** recorrido completo sólo teclado, lector de pantalla y alternativa textual del grafo; contraste medido, foco y controles a escala. No declarar conformidad WCAG por estas pruebas.
5. **Estructura:** extraer historial/búsqueda cuando exista cobertura suficiente y medir división de bundles antes de agregar lazy loading. Evitar desmontar paneles que deban conservar borradores.

La siguiente función permanece tags ligeros, pero después de aceptar esta consolidación. Se conservan pendientes de Papelera real, plataformas, proveedores y distribución; no se cierran por la confirmación puntual de amend.
