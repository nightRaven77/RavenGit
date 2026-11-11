# Diff dividido: lectura de commits y cambios locales

Fecha: 2026-10-21. Incremento de RG-03, sin declarar completado el hito M2.

## Comportamiento

Selector Unificado/Dividido en el inspector del commit y en Cambios. Antes es el
lado eliminado/original del parche; Después, el añadido/nuevo. En commits se
conserva el padre elegido; en Cambios, la comparación preparada/sin preparar ya
calculada por Rust. No representa un editor de conflictos de tres paneles.

El parser lee rangos `@@ -inicio,cantidad +inicio,cantidad @@`, comprueba los
conteos y numera únicamente las líneas presentes. Agrupa eliminaciones/adiciones
contiguas para presentar filas enfrentadas; si sobran líneas en un lado, el otro
queda vacío sin número. La alineación no afirma equivalencia semántica entre líneas.

Admite múltiples archivos/bloques, archivos nuevos/eliminados, nombres Unicode,
contenido que parece encabezado y marcadores de ausencia de salto final. Conserva
los encabezados/metadatos del parche. Si un contenido completo no admite división
(binario, diff combinado, sólo metadatos, formato desconocido o bloque incompleto),
deshabilita Dividido y muestra el texto original unificado. No inventa contenido,
no reconstruye archivos completos y no trunca silenciosamente una comparación.

La preferencia se mantiene en el componente durante la sesión. No se guarda una
configuración global en disco. Ambas columnas se desplazan juntas; en espacios
estrechos se ofrece desplazamiento horizontal. El color se acompaña de signos y
números; controles con estado anunciado, encabezados de tabla y región enfocables.
El texto se renderiza mediante React, sin interpretar HTML del repositorio.

## Integridad y alcance

Cambiar formato sólo transforma la representación del diff recibido. No añade
comandos Git, red ni escrituras. Las acciones de preparar/quitar bloque siguen
usando índice de bloque y huella de revisión originales; nunca se genera un
parche desde las filas divididas. Las restricciones de staging no cambian.

No incluye selección de líneas, resaltado de palabras, edición, plegado ni
virtualización del diff. No hay benchmark de grandes parches ni auditoría completa
de accesibilidad. Se conservan los límites de datos y lectura del backend.

## Pruebas

- Parser: contexto, reemplazos asimétricos, inserción/eliminación completa,
  varios bloques/archivos, metadatos, Unicode, ausencia de salto final, caracteres
  de encabezado dentro del contenido, rangos inválidos y formatos no compatibles.
- Componente: alternancia, numeración por lado, texto HTML literal y retorno a
  unificado al seleccionar un binario.
- Integración Cambios: alternar no invoca escrituras; preparar un bloque desde
  Dividido envía el mismo token, ruta, área, índice y huella de revisión a Rust,
  sin duplicar la solicitud.

Resultado: **85 pruebas de interfaz aprobadas** en 12 archivos; build
TypeScript/Vite y bundle nativo macOS ARM64 debug aprobados. Prettier y
`git diff --check` aprobados. No hay cambios Rust ni IPC; no se repitió su suite.

Comprobación nativa con el bundle, sin mocks: sobre la fixture local de rebase
se mostró el commit `e45769aa` contra su padre `8eefbba6`, con Antes/Después
y línea 1 por lado. En Cambios, se añadió una línea temporal, se alternó a
Dividido, se preparó el bloque y Git confirmó únicamente esa adición en el índice.
Se quitó el bloque desde Dividido: el índice quedó vacío y la adición permaneció
en el archivo de trabajo. Finalmente se retiró sólo la línea de prueba, dejando
limpia la fixture. El repositorio de desarrollo no se utilizó para esas escrituras.

La inspección inicial detectó desplazamiento horizontal innecesario en el
inspector; se redujo el ancho mínimo a 480 px conservando el scroll para ventanas
más estrechas. No se certifica compatibilidad con todos los tamaños o lectores de
pantalla. No se atribuye validación Windows a esta entrega.

```sh
npm test
npm run tauri build -- --debug --bundles app
npx prettier --check src/DiffViewer.tsx src/DiffViewer.test.tsx src/splitDiff.ts src/splitDiff.test.ts src/ChangesPanel.tsx src/ChangesPanel.test.tsx src/App.tsx src/App.css
git diff --check
```

Fuente del formato: [Git diff-format](https://git-scm.com/docs/diff-format).
