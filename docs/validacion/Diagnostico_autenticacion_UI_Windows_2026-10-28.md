# Diagnóstico de autenticación · UI Windows · 28/10/2026

Base `b380c1c` con cambios locales conservados. Recorrido nativo del diagnóstico nuevo, sin consultas de red ni modificaciones de credenciales. Se usó el perfil aislado anterior y únicamente la fixture temporal autorizada, a 900 × 640 al abrir y 1366 × 768 durante el recorrido.

Build debug sin bundle con identificador aislado aprobado. Ejecutable de aceptación SHA256 `A3F29915E4B9A520277C2CC70B88825C535A9CBE1A7B1A02A83D9EA6D43BD780`; el ejecutable habitual se respaldó y restauró antes de comenzar la UI, con hash verificado. Preparación y traza AX en `state/ssh-ui-acceptance.local/native-diagnostic-trace.json`, ignorados.

## Resultados

- Consulta del diagnóstico desde el destino SSH bitbucket: descarga/publicación SSH, cliente OpenSSH de Windows y agente accesible con siete identidades. Los controles quedaron deshabilitados durante la consulta y se habilitaron al finalizar.
- La interfaz informó que hay declaraciones de credential helper y explicó que eso no acredita credenciales disponibles ni permisos para el host. No mostró valores o comandos de los helpers.
- Copiar diagnóstico sin secretos mostró confirmación satisfactoria.
- Se añadió previamente por CLI un remoto de configuración local `https-diagnostic` con la URL HTTPS del repositorio GitHub desechable autorizado, sin contactarlo. Al seleccionarlo desaparecieron el diagnóstico SSH previo y su botón Copiar. La aplicación de perfiles SSH quedó deshabilitada para ese destino HTTPS.
- Nueva consulta: descarga y publicación HTTPS, explicación del helper y advertencia explícita de que no se inicia sesión ni se comprueban identidad/permisos. El estado del agente sigue siendo una consulta local independiente del transporte HTTPS.
- Segunda copia satisfactoria; se abrió Buscar y se pegó el resumen en el campo local de historial de la misma instancia. El texto AX observado se pudo interpretar como JSON y contenía exactamente schema, scope, downloadTransport, publicationTransport, sshAgent, sshIdentities, credentialHelperEntries, authenticatedIdentityVerified y repositoryPermissionsVerified. Ambos transportes eran HTTPS, disponibilidad available, siete identidades, helper declarado y ambas verificaciones false. Sin URLs, hosts, rutas de usuario ni etiquetas de cuenta/repositorio. No se pegó en otra aplicación ni se transmitió a terceros.

La búsqueda sólo filtró commits ya cargados. Puede quedar ese texto de prueba en las preferencias del perfil aislado; no se usó la biblioteca habitual. No se aceptaron permisos del sistema ni se cambiaron claves, agentes, confianza de host o autenticación. No se ejecutaron Fetch/Pull/Push ni Comprobar acceso durante este recorrido.

## Integridad y límites

Continuación automatizada posterior: SshAccountsPanel pasó nueve casos, incluidos cuatro nuevos para agente vacío/inaccesible/indeterminado, helper no declarado y fallo de consulta con recuperación. Respuestas simuladas de IPC, sin modificar servicios ni identidades. Actualiza cobertura de fallos automatizada; no convierte esos casos en aceptación nativa. [Detalle](Cuentas_SSH.md#validación-automatizada-windows--28102026).

Tras cerrar la instancia se restauraron los bytes originales de `.git/config` desde el respaldo verificado, eliminando de la configuración local el remoto auxiliar añadido para el diagnóstico. La restauración se limitó a la ruta de la fixture comprobada bajo Temp. Configuración, HEAD e índice final coinciden con el manifiesto original; el ejecutable habitual también coincide con su respaldo.

Esto acredita consulta IPC nativa, transportes, invalidación por cambio de destino y copia real en Windows para el caso de éxito observado. No certifica denegación de portapapeles, falta de confianza, agente vacío/inaccesible, ausencia de helpers, respuestas tardías, accesibilidad completa, identidades efectivas por cuenta, HTTPS privado/rechazado ni macOS. Algunos de esos casos tienen pruebas automatizadas separadas; no se declaran aceptación nativa por extrapolación. AC-04/09 y v1 siguen abiertos.
