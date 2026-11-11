# RavenGit · Simplificación de la interfaz

Fecha: 21 de octubre de 2026. Estado: implementación inicial; validación macOS y revisión visual.

## Objetivo y dirección visual

Reducir decisiones de navegación y dar prioridad al contenido de trabajo: archivos, historial y diff. Conservar la experiencia visual de un cliente Git de escritorio y las revisiones explícitas de las operaciones existentes.

Paleta: Obsidian `#0b0f17`, superficie `#111925`, separadores `#263141`, texto `#e6edf5`, Azure `#52b7ff` y carmesí `#ff667d`. Tipografía del sistema: SF en macOS y Segoe UI en Windows. Sin fuentes externas.

Principios: navegación estable, acciones disponibles, superficies discretas, contraste de selección y divulgación progresiva. Los avisos de errores, bloqueos y recuperación siguen visibles.

## Organización

```
Repositorio · Rama             Abrir · Actualizar · Fetch · Pull · Push · Rama · Buscar
Navegación       Contenido principal                  Inspector / diff
  Cambios        Archivos y preparación               Diff de archivo
  Historial      Grafo y commits                     Diff de commit
  Sincronizar    Remotos y Fetch | Pull | Publicar    Revisión de destino
  Herramientas   Ramas y operaciones de commit
  Referencias    Ramas locales, remotas y etiquetas plegables
```

La barra mantiene los comandos Git básicos implementados. Los comandos pendientes dejan de ocupar botones. Cambios se abre desde la navegación principal. Las acciones de la barra Fetch, Pull y Push abren sus revisiones; no ejecutan operaciones de red al pulsarlas.

Sincronizar recuerda su última sección durante la sesión. Los paneles conservan su montaje por repositorio para mantener borradores y revisiones. Las herramientas avanzadas están dentro de un desplegable; al entrar en Ramas desde la barra se muestra su navegación. Las ramas locales se despliegan inicialmente; referencias remotas y etiquetas se pueden abrir bajo demanda.

El inspector gana proporción horizontal en ventanas amplias. La composición estrecha conserva el inspector debajo del contenido mediante el comportamiento adaptable existente. Se mantienen los nombres accesibles, el salto al panel activo, los bloqueos durante operaciones y el foco visible.

## Alcance y decisiones pendientes

Esta iteración reorganiza la navegación y la jerarquía visual; no cambia contratos IPC ni operaciones Git. No incorpora clonación, stash, terminal, deshacer ni rehacer. Las revisiones de merge y rebase aparecen al revisar una rama; renombrar aparece al seleccionar su acción. La creación de ramas conserva su formulario visible. La adaptación a pantallas menores que la ventana mínima del producto requiere una iteración posterior.

No se declara validación de Windows ni Linux a partir de una compilación macOS. Tampoco se atribuyen mejoras de usabilidad a mediciones con usuarios: requieren sesiones observadas.

## Comprobaciones

- Pruebas de interfaz: 91 aprobadas en 13 archivos, incluida navegación agrupada, restauración de la sección de sincronización y ausencia de ejecución de operaciones de red al navegar.
- TypeScript y compilación Vite: aprobados.
- Bundle nativo macOS ARM64 de depuración: generado correctamente.
- Revisión independiente: recorrido visual del bundle nativo desde inicio sin repositorio, apertura de fixture, Historial, Cambios, Sincronizar, Pull, Publicar y Ramas; sin ejecutar mutaciones Git. Detectó estados vacíos excesivos, formularios simultáneos en Ramas, autorización dominante y pie de navegación desactualizado. Se aplicaron correcciones y se generó otro bundle para comprobarlas.
- Ventana estrecha: la inspección inicial no logró redimensionar la ventana nativa mediante el controlador de UI; no se declara validada hasta completar ese recorrido.

La segunda inspección independiente del bundle final, a 1440 × 920, confirmó: autorización plegada, estado vacío de Remotos compacto, formulario Publicar visible en el primer encuadre, sólo Crear en el inspector inicial de Ramas y pie actualizado. En ese recorrido no quedaron bloqueadores ni problemas mayores. Esto cubre navegación y presentación; no sustituye pruebas de integración Git ni validación con usuarios.

| Heurística | Hallazgo localizado | Severidad | Mejora |
| --- | --- | --- | --- |
| Estado visible | Rama, selección y vista reconocibles | Pasa | — |
| Correspondencia | Tres destinos principales reconocibles | Pasa | — |
| Control y libertad | Navegación persistente permite regresar | Pasa en navegación | Recuperación de mutaciones fuera de esta revisión |
| Consistencia | Push en barra y Publicar en subvista | Menor | Unificar etiqueta conservando el término Git en la ayuda |
| Prevención de errores | Acciones inválidas deshabilitadas; navegar no publica | Pasa en recorrido | Confirmaciones de escritura fuera de alcance visual |
| Reconocimiento | Crear visible inicialmente; revisiones según tarea | Pasa | — |
| Eficiencia | Siete comandos implementados; recorrido de foco observado | Pasa en muestra | Auditoría completa de atajos pendiente |
| Minimalismo | Vacíos compactos, autorización plegada y menos instrucciones simultáneas | Pasa | — |
| Recuperación de errores | Publicar sin remotos indica dónde configurarlos | Menor | Añadir acceso directo a Remotos y Fetch desde el aviso |
| Ayuda contextual | Etiquetas suficientes para el recorrido observado | Pasa | — |

Prioridad restante: comprobar adaptación a 900 × 640; después resolver las dos mejoras menores. La revisión visual utilizó una fixture sin cambios pendientes ni remotos configurados: no cubre estados de conflictos, lectores de pantalla ni todos los atajos.
