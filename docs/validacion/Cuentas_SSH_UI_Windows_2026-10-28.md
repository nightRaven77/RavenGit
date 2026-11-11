# Cuentas SSH · aceptación nativa Windows · 28/10/2026

Base `b8b680e`, cambios locales conservados. Interfaz real de RavenGit a 900 × 640 en instancia y perfil aislados. Sólo se abrió la fixture temporal de [publicación autorizada](Permisos_SSH_Windows_2026-10-28.md); sin repositorios personales.

## Preparación y alcance

Build debug sin bundle aprobado con identificador y título separados, «RavenGit SSH Acceptance». SHA256 del ejecutable aislado: `DEC7D742BFC35181B8C443EF5CBD5C3565E5B8F8A9008131542236615D54B7DA`. El ejecutable normal se restauró y verificó por hash.

Biblioteca, confianza de ruta y cuatro perfiles de metadatos preparados como fixture antes del recorrido. Se comprobó su visualización; **no prueba crear, editar, aplicar ni persistir perfiles desde UI**. El alias del perfil Gitea difiere del destino IP/puerto del remoto; no se afirmó aplicar ese perfil. Preparación, manifiesto y traza AX en `state/ssh-ui-acceptance.local/`, ignorados, sin claves ni credenciales. La instancia se cerró al terminar.

## Resultados observados

| Comprobación nativa | Resultado |
| --- | --- |
| Biblioteca, fixture y cuatro destinos | Aprobado; rama y commit de prueba visibles |
| Cuentas SSH y agente | Cuatro perfiles preparados visibles; OpenSSH de Windows y siete identidades en la consulta inicial |
| Comprobar acceso · Bitbucket/GitLab/GitHub/Gitea | Los cuatro aprobados individualmente |
| Revisar push · Bitbucket/Gitea | Ambos al día, 0 por enviar/0 por integrar, mismo hash y confirmación deshabilitada sin solicitar upstream |
| Revisar push · GitHub | Falló inicialmente; reintento posterior solicitado por el usuario aprobado: al día, mismo hash, 0/0 y confirmación deshabilitada |
| Revisar push · GitLab | Falló inicialmente; reintento posterior solicitado por el usuario aprobado: al día, mismo hash, 0/0 y confirmación deshabilitada |

Los éxitos de lectura mostraron «Acceso de lectura comprobado. Esto no verifica permisos de publicación ni actualiza el grafo». La revisión aprobada comparó la rama `codex/ssh-acceptance-20261028-b3ecf814` y el hash `78e0d2dc6dba12a9fc82af5b151283aab1b23fcc` en origen y servidor. Cambiar de remoto retiró la revisión anterior. Durante operaciones se observaron controles deshabilitados.

No se pulsó Confirmar publicación, no se estableció seguimiento ni se crearon commits, ramas o publicaciones adicionales. Abrir Fetch sólo mostró Remotos; no se ejecutaron Fetch/Pull en este recorrido.

## Bloqueo inicial y reintento posterior

Tras los éxitos iniciales, GitHub también falló con `Permission denied (publickey)` en una consulta independiente de sólo lectura al mismo remoto desechable, con OpenSSH de Windows, BatchMode y verificación estricta. La consulta final `ssh-add -l` devolvió agente **sin identidades** (código 1); el servicio ssh-agent seguía Running. Difiere de las siete identidades iniciales; no se determinó qué vació el agente ni el momento exacto.

No se atribuye el fallo a RavenGit sólo con esta evidencia. No se cargaron claves ni modificaron agente, credenciales, configuración o known_hosts.

Posteriormente el usuario pidió reintentar sólo GitHub y GitLab. Se abrió el mismo ejecutable y perfil aislados, se seleccionó cada remoto y se ejecutó Revisar push una vez por proveedor. Ambos pasaron: rama de prueba y hash indicados arriba idénticos en origen/servidor, 0 por enviar y 0 por integrar, seguimiento sin cambios y Confirmar publicación deshabilitado. El bloqueo deja de estar pendiente para estas dos revisiones. No se volvió a consultar Gitea/Bitbucket ni se repitió la publicación del núcleo. No se midió de nuevo el número de identidades del agente. Traza adicional local: `native-trace-retry.json` en la carpeta ignorada anterior. Instancia cerrada y HEAD/índice/configuración/ejecutable normal nuevamente idénticos al manifiesto.

## Integridad, deuda y pendientes

HEAD, bytes del índice y configuración local de la fixture coincidieron al finalizar con el manifiesto previo. También coincidió el ejecutable normal restaurado. Identidad SSH, permisos concretos y aceptación UI conservan alcances separados.

Deuda UX: Comprobar acceso usa los títulos globales «Actualizando remoto»/«Remoto actualizado», aunque el cuerpo describe lectura. Corregirlos para evitar sugerir un Fetch. Las zonas de desplazamiento anidadas requieren mover lista e inspector por separado; no certifica accesibilidad completa.

Continuación posterior: [alta, edición y persistencia de perfiles desde UI Windows](Perfiles_SSH_UI_Windows_2026-10-28.md) aprobadas; revisión de alias sólo descarga conserva publicación sin guardar cambios Git. Borrado y aplicación efectiva a descarga/publicación/ambas aprobados posteriormente en esa fixture Windows, con restauración exacta de configuración. También siguen errores controlados por host, HTTPS, múltiples cuentas efectivas, macOS e instalación. No cierra AC-04/AC-09 ni acredita v1 estable.
