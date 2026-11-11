# Compilar RavenGit Beta · Apple Silicon sin membresía

Preparación del 29/10/2026 para `1.0.0-beta.1`. Se genera `.app` y `.dmg` arm64 con firma **ad hoc**, sin cuenta Apple Developer ni notarización. No se configura SignPath para macOS. Perfil **dev.ravengit.beta**, separado del habitual; los repositorios abiertos siguen siendo archivos reales.

## Preparación de la Mac, una vez

Lleva a la Mac el código completo actualizado, incluidos los nuevos scripts/configuraciones y LICENSE. Todavía no se han publicado estos cambios: un `git pull` del remoto actual no basta si no se han subido. No copies `node_modules`, `dist`, `src-tauri/target` ni carpetas locales de evidencia desde Windows.

Necesitas Node **24 o posterior compatible con Vite**, npm, Git, Rust actualizado (referencia usada en Windows: **1.99.1**) y Xcode Command Line Tools. Instala Node nativo arm64, sin Rosetta. No se instalan componentes, certificados o credenciales automáticamente.

Si faltan las herramientas de Apple, ejecuta y completa su instalador:

```sh
xcode-select --install
```

Con Node y Rust ya instalados, abre Terminal en la raíz de RavenGit:

```sh
rustup target add aarch64-apple-darwin
npm ci
npm run beta:check:macos
```

Si Rust es antiguo, actualízalo desde su instalación habitual antes de compilar. El comando de comprobación sólo valida los archivos de configuración; no certifica Xcode ni un paquete macOS.

## Compilar

```sh
npm run beta:build:macos
```

Comprueba requisitos locales, versiones y destino arm64; compila y genera ambos paquetes. Usa `signingIdentity: "-"` y excluye variables APPLE_* sólo del proceso hijo para que no importe certificados ni utilice credenciales de notarización heredadas. No modifica llavero, Gatekeeper, SSH ni el entorno permanente.

Después verifica identificador/versión del bundle, arquitectura arm64, firma ad hoc, firma estructural de la `.app` e integridad del DMG. Si falla una comprobación, no anuncia entrega completada. No inicia la app ni la instala automáticamente.

Salidas desde la raíz del proyecto:

- Aplicación: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/RavenGit Beta.app`.
- Imagen: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`.
- Copia del DMG, licencia, SHA256 y manifiesto: `state/beta-macos.local/1.0.0-beta.1/<fecha>/`, ignorada por Git. La ruta exacta se imprime al terminar. Cada ejecución conserva una entrega separada.

## Empaquetar automáticamente con GitHub Actions

Preparado en `.github/workflows/macos-beta.yml`. Cuando el usuario lleve estos archivos al repositorio GitHub, no hará falta compilar desde su Mac ni aportar certificados o secretos de Apple.

1. Asegurar que el workflow y los archivos de esta preparación estén en la rama predeterminada del repositorio GitHub. Actualmente siguen como cambios locales; no se han subido ni se ha cambiado origin.
2. Subir un tag **`vX.Y.Z-beta.N`** que coincida exactamente con la versión del proyecto y señale un commit integrado en la rama predeterminada. Eso inicia automáticamente el empaquetado. También se conserva **Actions → macOS beta · Apple Silicon → Run workflow**, sólo desde la rama predeterminada. Un push de rama o un PR no lo inicia.
3. Al terminar correctamente, abrir la ejecución y descargar en **Artifacts** el archivo `ravengit-beta-macos-arm64-<número>`.
4. Descomprimir el artefacto para obtener el DMG, SHA256, licencia, guía y manifiesto. El DMG contiene la `.app`; no se sube la carpeta `.app` directamente, para preservar permisos y estructura dentro de la imagen.

El runner `macos-15` es arm64 según la [referencia de GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners); el workflow comprueba la arquitectura real y usa Node arm64. Instala Rust 1.99.1 en el runner, ejecuta `npm ci`, comprueba configuración, corre pruebas UI y llama al mismo script local de empaquetado/verificación. Las acciones están fijadas a las revisiones ya verificadas para la preparación de Windows. Los paquetes duran 30 días como artefactos de la ejecución.

Antes de construir, ambos workflows ejecutan `scripts/check-release-ref.mjs` sobre un checkout completo. El filtro de GitHub `v*-beta.*` sólo selecciona eventos; el script aplica el formato estricto, la igualdad de versión, la coincidencia tag/checkout y la pertenencia del commit a la historia de la rama predeterminada. No se crean ni se cambian tags automáticamente. [Preparar y subir un tag de entrega](TAGS_BETA.md).

Sólo requiere lectura del repositorio. No importa certificados, solicita notarización, publica releases/tags ni cambia permisos remotos. No ejecuta la suite Rust completa ni sustituye instalación/arranque/aceptación nativa. La primera ejecución real de Actions está **pendiente**; la revisión local de YAML no acredita una compilación en GitHub. El consumo de runners depende del plan y la configuración de GitHub del usuario.

## Probar después de compilar

Abre el DMG y copia RavenGit Beta a Aplicaciones. Comprueba el primer arranque, biblioteca independiente, icono y operaciones sólo con repositorios de prueba. La aceptación de instalación en esta Mac y un recorrido local acotado se registraron el 02/11/2026; no certifican otros equipos ni todos los flujos macOS.

La firma ad hoc no identifica un desarrollador reconocido por Apple y no elimina necesariamente los avisos al descargar. Si macOS lo bloquea por desarrollador no identificado, el usuario puede revisar y autorizar esa aplicación concreta según la [guía de Apple](https://support.apple.com/en-gb/102445). No se desactiva Gatekeeper ni se eliminan atributos de cuarentena automáticamente. Un aviso de malware o un paquete corrupto requiere investigación, no autorizarlo por rutina.

## Estado real

Actualización 02/11/2026: se verificó nuevamente el DMG, se copió la `.app` a `/Applications` y se abrió desde Finder en macOS 27.2 arm64. Se observó el icono Finder y el estado inicial sin repositorio; el usuario confirmó Dock. El recorrido de la fixture cubrió historial/diff, preparación y Stash. `codesign --verify --deep --strict` valida el bundle. `spctl` falla con error interno en el bundle original y la copia instalada; `syspolicy_check` inició su revisión pero no terminó. No se modificó Gatekeeper. `Evidencia detallada` (archivo no incluido en este repositorio: `Beta_1_macOS_2026-11-02.md`). La instalación permanece en Aplicaciones. El paquete es ad hoc; no se solicita dictamen de Gatekeeper para validar integridad de esta distribución privada. Aceptación más amplia y primera ejecución de Actions pendientes. No se publicó tag/release ni se cambió la versión, que sigue en `1.0.0-beta.1`.

Actualización 30/10/2026: la beta `1.0.0-beta.1` se compiló localmente en macOS 27.2 arm64; `.app`, firma ad hoc y DMG quedaron verificadas. La app abrió desde el bundle y desde una copia temporal extraída de la DMG; Stash pasó guardar/restaurar en UI sobre una fixture. `Evidencia` (archivo no incluido en este repositorio: `Beta_1_macOS_2026-10-30.md`).

Comprobaciones de preparación del 29/10: sintaxis Node, Prettier, coherencia de versiones, configuración ad hoc/recursos e icono presentes y `git diff --check` aprobados. Intentar el comando normal en Windows se rechazó antes de invocar Tauri. La carpeta de entregas está ignorada por Git. No se ejecutaron suites completas ni comandos nativos Mac desde Windows.

Referencia: [firma ad hoc de Tauri](https://v2.tauri.app/distribute/sign/macos/) y [requisitos de compilación](https://v2.tauri.app/start/prerequisites/).
