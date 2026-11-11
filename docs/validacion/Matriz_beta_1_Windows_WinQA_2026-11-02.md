# Matriz instalada Windows · WinQA · 2026-11-02

**Ejecución detenida en precondiciones.** Se comprobó el artefacto y las dependencias locales, pero no se instaló ni ejecutó la matriz: hay un perfil beta previo que debe conservarse y no se acreditó un usuario de prueba limpio. No es evidencia de aceptación funcional ni de una instalación limpia.

## Identificación

| Campo | Dato observado |
| --- | --- |
| Fecha/hora/zona y operador neutro | 2026-11-02; hora exacta no registrada; WinQA |
| Equipo/VM y snapshot inicial | Entorno Windows de prueba mediado; físico/VM y snapshot no acreditados |
| Windows/compilación/arquitectura | Windows NT 10.0.26300.0; x64 |
| RAM/espacio libre/resolución/escalas | RAM/resolución/escalas no accesibles; C: con 19.5 GiB libres al consultar |
| Git / WebView2 / lector de pantalla | Git 2.56.0.windows.3; WebView2 detectado 156.0.4314.56 y 156.0.4314.58; lector no comprobado |
| Instalación limpia, actualización o reinstalación | Sin clasificar: existe perfil beta previo; instalación actual no acreditada |
| Redirección Codex, OneDrive, red u otra | Entorno de ejecución mediado; rutas locales del host no verificables |
| Instalador/versión/SHA256/firma | `RavenGit Beta_1.0.0-beta.1_x64-setup.exe`; 1.0.0-beta.1; `E55800A24F1F7D52BC33E53EA3CC1E0BB983D81BF17752B75AA0998B38C61D31` coincide; `NotSigned` |
| Ejecutable instalado/ruta real/versión/SHA256/firma | No comprobado: no se encontró ventana/app RavenGit en el inventario del escritorio |
| Perfil beta y separación del estable | El directorio de perfil `dev.ravengit.beta` ya existe; no se inspeccionó ni modificó. Separación frente al estable no comprobada |
| Origen privado del artefacto/base conocida | Artefacto local del checkout; base del candidato indicada por la guía: `de55bf1`; sin publicación |

## Precondiciones comprobadas

- SHA256 coincide exactamente con el candidato esperado. Authenticode informa `NotSigned`.
- Git está disponible en PATH. WebView2 está presente; no se instaló dependencia adicional.
- El acceso a registro/CIM está denegado en este entorno. Se usaron detecciones no invasivas de rutas runtime y del inventario de apps.
- Existe un perfil beta previo. Se preservó sin inspección ni cambios. No se inició el instalador ni se ejecutó el binario sin firma.
- No se crearon fixtures ni se conectaron proveedores. Sin copia instalada activa y sin usuario limpio no era posible validar los efectos de la aplicación; no se sustituyó la acción UI por Git externo.

## Casos

| ID / variante | Fixture y estado inicial | Acción UI / contraste Git | Esperado | Observado / evidencia breve | Resultado |
| --- | --- | --- | --- | --- | --- |
| I-01 | Usuario limpio requerido; hay perfil beta previo | No se abrió el instalador | Instalación por usuario desde candidato verificado | Hash/firma verificados; precondición de instalación limpia no satisfecha y perfil conservado | Bloqueado |
| I-02 | Instalación de I-01 no disponible | Sin apertura de app | Ventana, ruta, hash y firma del ejecutable | RavenGit no figura en inventario de ventanas/apps; binario instalado sin verificar | Bloqueado |
| I-03 | Perfil beta preexistente | Sin abrir biblioteca | Separación del perfil estable y fixture aislada | Sólo se constató existencia del directorio beta; sin UI | Bloqueado |
| I-04 | Requiere I-02 | Sin reinicio de aplicación | Persistencia y apertura de fixture | No ejecutado | Bloqueado |
| L-01 | Requiere copia instalada y fixture nueva | Sin cambios Git/UI | Colección, asignación y fijado persisten | No ejecutado | Bloqueado |
| L-02 | Requiere copia instalada y fixture nueva | Sin mover repositorios | Localizar carpeta sin duplicar metadatos | No ejecutado | Bloqueado |
| N-01 | Requiere copia instalada y destinos QA nuevos | Sin inicialización UI | Repo nuevo correcto y colisión rechazada | No ejecutado | Bloqueado |
| N-02 | Requiere copia instalada y origen QA | Sin clonación UI | Clon local correcto y colisión rechazada | No ejecutado | Bloqueado |
| H-01 | Requiere fixture lineal e instalada | Sin lectura en RavenGit | Grafo, ramas, búsqueda y diff correctos | No ejecutado | Bloqueado |
| C-01 | Requiere fixture nueva | Sin puerta de confianza UI | Bloqueo sin confianza y permiso acotado | No ejecutado | Bloqueado |
| C-02 | Requiere fixture nueva | Sin editar/preparar | Sólo bloque elegido en índice | No ejecutado | Bloqueado |
| C-03 | Requiere fixture nueva | Sin preparación por selección | Índice coincide con archivos elegidos | No ejecutado | Bloqueado |
| C-04 | Requiere fixture nueva | Sin commit UI | Commit y padre revisados | No ejecutado | Bloqueado |
| C-05 | Requiere fixture nueva | Sin revisión obsoleta | Rechazo seguro sin commit obsoleto | No ejecutado | Bloqueado |
| C-06 | Requiere fixture nueva y lock controlado | No se creó lock | Rechazo conservando lock/índice | No ejecutado; lock no creado | Bloqueado |
| C-07 | Requiere fixture nueva | Sin amend UI | Cancelar intacto; amend respaldado | No ejecutado | Bloqueado |
| C-08 | Requiere fixture nueva | Sin restaurar/rehacer | Restauración revisada y rechazo obsoleto | No ejecutado | Bloqueado |
| B-01 | Requiere fixture nueva | Sin operaciones de rama | Cambio/renombre seguro | No ejecutado | Bloqueado |
| T-01 | Requiere fixture nueva | Sin crear ni publicar tags | Tag correcto y cancelar sin publicación | No ejecutado | Bloqueado |
| M-01 | Requiere fixture nueva | Sin merge UI | Conflicto y etapas verificables | No ejecutado | Bloqueado |
| M-02 | Depende de M-01 | Sin resolver/preparar | Respaldo y etapas conservados hasta preparación | No ejecutado | Bloqueado |
| M-03 | Depende de M-02 | Sin editar/recuperar | Revisión obsoleta rechazada; recuperación vigente | No ejecutado | Bloqueado |
| M-04 | Requiere fixture nueva | Sin iniciar/abortar merge | Recuperación visible y aborto exacto | No ejecutado | Bloqueado |
| R-01 | Requiere fixture nueva | Sin rebase UI | Recuperar y continuar explícitamente | No ejecutado | Bloqueado |
| R-02 | Requiere fixture nueva | Sin rebase UI | Recuperar y abortar explícitamente | No ejecutado | Bloqueado |
| R-03 | Requiere fixture lineal nueva | Sin rebase interactivo | Orden, grupos, drop y respaldo correctos | No ejecutado | Bloqueado |
| R-04 | Requiere fixtures nuevas por variante | Sin preparar variantes | Conflictos/pausas/recuperación explícitos | Ninguna variante ejecutada | Bloqueado |
| P-01 | Requiere fixture nueva | Sin cherry-pick/revert UI | Aplicar y revertir con respaldo | No ejecutado | Bloqueado |
| P-02 | Requiere fixtures nuevas por operación/desenlace | Sin replay conflictivo | Continuar/abortar explícitos | Ninguna variante ejecutada | Bloqueado |
| S-01 | Requiere fixtures nuevas | Sin guardar Stash | Capas/opción y respaldo correctos | No ejecutado | Bloqueado |
| S-02 | Requiere fixtures nuevas | Sin restaurar Stash | Bytes/índice según opción; obstrucción rechazada | No ejecutado | Bloqueado |
| S-03 | Requiere fixture nueva | Sin apply conflictivo | Registro persiste; finalizar no repite apply | No ejecutado | Bloqueado |
| A-01 | Requiere copia instalada | Sin actividad UI/exportación | Persistencia y exportación sanitizada | No ejecutado | Bloqueado |
| A-02 | Requiere perfil de prueba y revisión UI | Sin borrar actividad | Cancelar conserva; confirmar sólo borra revisado | No ejecutado | Bloqueado |
| X-01 | Requiere copia instalada | Sin recorrido teclado | Foco y controles operables a 900×640 | Resolución no disponible; no ejecutado | Bloqueado |
| X-02 | Requiere copia instalada y lector real | Sin recorrido accesible | Anuncios correctos a 100/150/200 % | Lector no comprobado; no ejecutado | Bloqueado |
| X-03 | Requiere fixtures de escala | Sin generar carga | Mediciones y datos correctos | No se generaron fixtures | Bloqueado |
| X-04 | Requiere copia instalada | No se desconectó red | Flujo local offline | No ejecutado | Bloqueado |
| E-01 | Requiere bare y dos clientes QA | Sin crear transporte ni operar UI | Push/Fetch/Pull local por hashes revisados | No ejecutado | Bloqueado |
| E-02 | Requiere bare y clientes de E-01 | Sin divergencia/tag UI | Revisión obsoleta y tag selectivo | No ejecutado | Bloqueado |
| E-03 | Requiere remoto de prueba específico y autorización | No se contactó proveedor | Lectura/publicación controladas | Destino/cuenta no especificados para esta sesión | Bloqueado |
| E-04 | Requiere perfil de prueba UI | Sin crear ni aplicar perfiles SSH | Alcance efectivo y copia sanitizada | No ejecutado; no se modificó configuración SSH | Bloqueado |
| F-01 | Requiere conflicto y copia instalada | Sin cerrar procesos | Recuperación tras cierre de RavenGit | No ejecutado | Bloqueado |
| F-02 | Requiere plan de inyección/snapshot | Sin inducir cortes | Ventana demostrada y recuperación segura | Sin plan de inyección en este entorno | Bloqueado |
| F-03 | Requiere fixtures y hooks/errores locales | Sin configurar hooks/permisos | Estado/bytes/índice conservados | No ejecutado | Bloqueado |
| D-01 | Requiere WebView2 ausente en snapshot | No se desinstaló runtime compartido | Instalación con/sin red | WebView2 ya presente; caso no reproducible con seguridad aquí | Bloqueado |
| D-02 | Requiere beta previa identificada y perfil QA respaldado | Sin actualizar | Perfil y fixture intactos con candidato nuevo | Perfil previo existe, pero candidato instalado/versionado y respaldo no acreditados | Bloqueado |
| D-03 | Requiere instalación y respaldo de perfil | Sin desinstalar | Desinstalar/reinstalar sin tocar datos ajenos | No ejecutado; perfil beta preexistente preservado | Bloqueado |

## Defectos y bloqueos

- Bloqueo común I-01–D-03: no se acreditó usuario limpio/snapshot ni se encontró una ventana RavenGit instalada activa; existe perfil beta previo que debe preservarse. Resolver en usuario de prueba/VM limpia y repetir precondiciones sin trasladar perfiles.
- E-03/E-04: se necesita un destino de proveedor de prueba y autorización específica para cualquier conexión/perfil.
- D-01: requiere snapshot separado donde WebView2 no esté instalado; no retirar el runtime compartido.
- No se observaron fallos funcionales porque la aplicación no se ejecutó. Estado de fixtures: no se crearon.

## Totales y decisión

- Casos base previstos: 48. Variantes avanzadas desglosadas/ejecutadas: 0.
- Aprobados: 0. Fallidos: 0. Bloqueados: 48. Pendientes: 0 casos base ejecutados; variantes de R-04/P-02/X-03 permanecen sin preparar.
- Instalación limpia: bloqueada. Funciones locales: bloqueadas. Transporte: E-01/E-02 no ejecutados; E-03/E-04 bloqueados por destino/autorización faltantes.
- Recuperación: sin ejecutar. Accesibilidad/rendimiento: sin ejecutar. Actualización/reinstalación/desinstalación: sin ejecutar.
- Estado final: RavenGit no se abrió; instalador sin ejecutar; perfil beta preexistente conservado; no hay fixtures ni respaldos QA creados.
- Decisión: **sin aceptación nueva**. Beta abierta; sin declaración de cierre, firma ni publicación.
