# Merge: primera entrega — revisión local

Fecha: 2026-10-21. Este incremento inicia RG-05, no cierra merge ni AC-05.

Este documento conserva el alcance de la primera entrega. La continuación se
documenta en [ejecución y recuperación](Merge_ejecucion.md).

## Uso

Abrir Ramas y pulsar **Revisar merge** junto a una rama distinta de la activa.
El inspector distingue origen y destino, muestra hashes, cantidades de commits
exclusivos y hasta 100 commits entrantes. La acción no cambia la rama activa.

La relación se obtiene comparando los hashes congelados con
`git rev-list --left-right --count destino...origen`. Cero commits entrantes
significa que el destino contiene el origen; cero exclusivos del destino permite
fast-forward; ambos positivos señalan divergencia. No simula el árbol resultante,
no asegura ausencia de conflictos ni autoriza integrar historiales sin relación.
Un historial superficial se presenta como no concluyente.

## Integridad

- Requiere autorización del repositorio y las restricciones conservadoras de Ramas.
- Rechaza HEAD separado, origen inexistente, origen igual a destino y tokens obsoletos.
- La rama se resuelve desde la lista local; no se aceptan revisiones u opciones arbitrarias.
- Vuelve a comprobar la huella al terminar; respuestas obsoletas de UI se ignoran.
- Sólo realiza lecturas locales, sin descargas implícitas ni hooks de merge.
- No guarda una autorización para ejecutar: una futura ejecución deberá revisar y
  validar de nuevo bajo el bloqueo de escrituras.

## Validación

Pruebas nuevas: clasificación direccional, confianza sin acceso al repositorio,
fixture Git real al día/fast-forward/divergencia, token obsoleto, origen inválido,
índice sin cambios, sin checkout ni MERGE_HEAD, UI sin mutaciones y error sin reintentos.

Comandos:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --offline merge -- --test-threads=4
npm test
npm run build
cargo clippy --manifest-path src-tauri/Cargo.toml --offline --all-targets -- -D warnings
```

## Siguiente entrega

Resultado local Windows x64: 4 pruebas Rust filtradas por `merge` y 45 pruebas de
interfaz aprobadas; build TypeScript/Vite, Clippy y formato Rust aprobados.
No se repitió la suite Rust completa ni la distribución instalable en este incremento.

Ejecutar una revisión validada, reconocer MERGE_HEAD tras reinicio y ofrecer
resolución, continuar y abortar con pruebas de integridad. Hasta disponer de ese
ciclo completo no se habilita una acción que deje conflictos sin recuperación visual.

Referencia: [Git rev-list](https://git-scm.com/docs/git-rev-list) y
[Git merge](https://git-scm.com/docs/git-merge).
