# Rebase: revisión previa local

Fecha: 2026-10-21. Primera entrega de rebase en RG-05. No cierra AC-05.

Este documento conserva el alcance y resultados de la primera entrega. Su
continuación está en [ejecución y recuperación](Rebase_ejecucion.md).

## Revisión de los avances recibidos

Base revisada: `b7046b4`, después de `a96d6b7`. Árbol de trabajo limpio al iniciar.
Se contrastaron README, documentación de validación, registro IPC y flujos de
Ramas/merge/Pull. Antes de modificar, se ejecutaron en macOS ARM64 las suites:
76 pruebas Rust y 62 de interfaz aprobadas. Esto no equivale a una auditoría
exhaustiva de todos los caminos de ejecución ni a aceptación nativa completa.
La evidencia de Windows ya registrada conserva su alcance original.

Se corrigió una contradicción del README que aún enumeraba Pull como inactivo.
La siguiente fase funcional es rebase, separando análisis y ejecución para
desarrollar y verificar también su recuperación antes de habilitar reescrituras.

## Flujo y contrato

En Ramas, pulsar **Revisar rebase** junto a la rama base. La rama activa sería
la reubicada; la seleccionada aporta la base. No es la dirección de un merge.
`preview_rebase(id, token, base)` devuelve nombres y hashes congelados, relación,
cantidad de commits exclusivos, lista acotada y presencia de merges en todo el rango.
La base sólo puede elegirse de las ramas locales existentes y distintas de la activa.

Se reutiliza la comparación local de merge. Para los candidatos se invierte el
rango: `base..HEAD`, recorrido topológico invertido con salida limitada a 100.
Si se trunca, se informa; la lista no pretende ser el plan completo ni una
simulación de `git rebase`. Los parches equivalentes y commits vacíos pueden
recibir tratamiento distinto al ejecutar Git. Una base ya contenida no requiere
rebase; sin commits exclusivos de la activa, puede avanzarse sin reproducirlos.

Sólo lectura local, sin `git rebase`, hooks de rebase, fetch, checkout ni refs de
respaldo. Se requiere confianza antes de inspeccionar. Se reutilizan los bloqueos
de repositorios completos/simples de merge y la huella de Ramas antes/después.
Cambios sin commit, HEAD separado, operaciones activas, estado obsoleto, clones
parciales/superficiales, reemplazos/grafts y configuraciones avanzadas bloquean
el análisis. Historias sin base común fallan sin ofrecer una revisión válida.
No hay descarga implícita de objetos. Los filtros confiados de las lecturas de
estado mantienen los límites existentes: no se ofrece aislamiento de sus efectos.

La UI ignora respuestas obsoletas, bloquea acciones mientras consulta e invalida
el resultado al actualizar, mutar ramas o revisar otra integración. No guarda
un plan ejecutable en Rust ni expone un comando de escritura de rebase.

## Validación de esta entrega

Pruebas Git locales: dirección rama/base, candidatos de la activa, preservación
de HEAD/índice/archivo, sin estado de rebase, base ausente/igual, huella obsoleta,
base contenida, fast-forward, detección de merges y rechazo de clon parcial.
Prueba de confianza con ruta inexistente. Pruebas de UI con IPC simulado:
revisión sin mutación/refresco, límites/merges visibles, invalidación y error
sin reintento. Las fixtures no contactan proveedores reales.

Resultado local macOS ARM64: **79 pruebas Rust y 64 pruebas de interfaz aprobadas**.
Build TypeScript/Vite, Clippy con `-D warnings`, formato Rust/Prettier de los
archivos de interfaz modificados y `git diff --check` aprobados.

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --offline
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Un intento restringido no pudo crear temporales del sistema; se repitieron las
suites con permiso y pasaron. Cargo reutilizó advertencias del intento restringido
relativas al caché temporal de `xcrun`; Clippy posterior terminó sin advertencias.
No se hizo revisión visual ni prueba nativa de esta entrega, ni se repitió Windows.
No se atribuyen a estas pruebas ejecución ni recuperación de rebase.

## Siguiente entrega y criterios pendientes

- Plan de ejecución de un solo uso, asociado a repositorio, rama y hashes, con
  nueva validación de confianza/estado dentro del bloqueo de escrituras.
- Política explícita para merges, parches equivalentes, commits vacíos y ramas
  publicadas; no inferir que una rama es privada por no tener tracking local.
- Recuperar rebase desde Git tras reinicio y resolver/continuar/abortar con
  pruebas de integridad, conservación de datos y resultados inciertos.
- Probar fallos de hooks/firma, cancelación/plazo y cambios externos de refs.
- Validación nativa Windows/macOS de toda la interacción antes de declarar
  completada la fase; rebase interactivo y force push no quedan autorizados
  ni implementados por esta revisión.

Fuentes: [Git rebase](https://git-scm.com/docs/git-rebase) y
[Git rev-list](https://git-scm.com/docs/git-rev-list).
