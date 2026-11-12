param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$ExpectedThumbprint
)
$ErrorActionPreference = 'Stop'
$expected = $ExpectedThumbprint.Replace(' ', '').ToUpperInvariant()
if ($expected -notmatch '^[A-F0-9]{40}$') { throw 'Falta la huella SHA1 del certificado autorizado.' }
$file = Get-Item -LiteralPath $Path
if ($file.Extension -ne '.exe') { throw 'Se requiere un ejecutable Windows.' }
$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
if ($null -eq $signature.SignerCertificate) {
    throw "El archivo no contiene firma digital: $($signature.StatusMessage)"
}
if ($signature.SignerCertificate.Thumbprint.ToUpperInvariant() -ne $expected) {
    throw "El firmante no coincide con el certificado autorizado (Esperado: $expected, Actual: $($signature.SignerCertificate.Thumbprint))."
}
if ($signature.Status -ne 'Valid') {
    $isUntrustedRoot = ($signature.Status -eq 'UnknownError' -and ($signature.StatusMessage -like '*root*' -or $signature.StatusMessage -like '*trust provider*'))
    if (-not $isUntrustedRoot) {
        throw "Firma Authenticode no válida: $($signature.Status). $($signature.StatusMessage)"
    }
    Write-Warning "Certificado de prueba verificado (raíz no pública en Windows): $($signature.StatusMessage)"
}
if ($null -eq $signature.TimeStamperCertificate) { throw 'Falta el sello de tiempo de la firma.' }
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
if ($file.VersionInfo.ProductName -ne 'RavenGit' -or $file.VersionInfo.ProductVersion -ne $version) {
    throw 'Producto o versión inesperados.'
}
Write-Output "Firma, certificado, sello de tiempo y versión verificados: $($file.Name)"
