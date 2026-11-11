# Comprobación visual de ajustes UX · Windows · 27/10/2026

Base `e715539` más los cambios locales de interfaz. Instancia nativa `RavenGit Windows Acceptance`, perfil `dev.ravengit.winaccept.ua8fa0a4e`, ventana 900 × 640; control mediante `@oai/sky`. Se reutilizaron exclusivamente las fixtures aisladas del [recorrido anterior](Windows_nativo_2026-10-26.md).

| Ajuste | Resultado observado |
| --- | --- |
| Cerrar fijo en conflictos | Se abrió Consultar conflicto → Editar resultado y se desplazó el diálogo al final, hasta el área de resultado/confirmación. Cabecera y Cerrar permanecieron visibles. Clic en Cerrar cerró el diálogo sin guardar ni preparar. |
| Ayuda de recuperación | La comparación de un respaldo persistido mostró «Inicio y Fin llevan al principio y al final del contenido», sin símbolos Mac. Se cerró con Escape sin restaurar. No se repitieron límites de desplazamiento con archivos grandes. |
| Ir a Ramas | En Cambios durante MERGE_HEAD, el botón fue visible y abrió Ramas → Merge en curso. Staging/commit permanecieron bloqueados. El caso rebase tiene regresión automatizada; no se repitió nativamente este enlace durante rebase. |
| Aviso anterior | Se creó desde UI la rama desechable `ux-aviso-20261027`, sin cambiar la rama activa. Se observó su aviso de éxito; al pulsar Revisar rebase sobre feature desapareció durante la lectura y siguió ausente al aparecer la revisión. No se ejecutó el rebase. |

Comprobaciones independientes: HEAD del repositorio de rebase siguió en `aba3f051b35d358861d17e3d6c22786780163322`, árbol limpio. HEAD de conflictos siguió en `a30d4c2e72418dd5df042d9951f8f28b4d5088b4`; se conservaron las tres etapas del conflicto recreado para esta prueba y otro.txt preparado. El editor no guardó cambios. Para preparar la fixture se conservó el resultado anterior en `state/windows-acceptance.local/conflicto-antes-ux.txt` y se reconstruyó únicamente su conflicto con `git checkout -m`.

Build debug aislado sin bundle aprobado; SHA-256 `18babca70a5ec16d6e5e83abacb3e757b43800ddb9478fb954b2bf427799c18e`. Se restauró el ejecutable normal y se verificó su hash `0b3ef62505cc7ff84d209081c8abdf02692cade8fafe37498b59fdbdaca83a30`. Traza accesible en `state/windows-acceptance.local/ux-20261027-trace.json`, artefacto local ignorado. No hubo nuevas modificaciones de producción, commits ni publicaciones en esta comprobación; la rama creada pertenece sólo a la fixture desechable.

Resultado: cuatro ajustes comprobados de forma acotada en Windows. La [repetición macOS del mismo día](MacOS_actual_2026-10-27.md) también pasó a 900 × 640; lector de pantalla y las matrices avanzadas del registro anterior siguen pendientes. La suite de 243 UI y el build normal corresponden a la implementación anterior inmediata; no se repitieron suites sin cambios de código.
