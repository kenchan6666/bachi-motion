# Publishes the Windows zip to GitHub Releases for the current tag.
# The tag must be v<package.json version>. For 0.2.1 that tag is v0.2.1.
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$tag = $env:GITHUB_REF_NAME
if (-not $tag) { throw "GITHUB_REF_NAME is empty" }
if ($env:GITHUB_REF -notlike "refs/tags/*") {
  throw "Refusing to publish from $env:GITHUB_REF. Push a tag instead."
}

$pkg = Get-Content -Raw -Encoding utf8 "package.json" | ConvertFrom-Json
$ver = [string]$pkg.version
if ($tag -ne "v$ver") {
  throw "Tag must be v$ver (this checkout is $tag). The version number stays $ver."
}

$zip = Get-ChildItem dist -Filter "bachi-motion-$ver-windows-x64.zip" | Select-Object -First 1
if (-not $zip) { throw "Missing dist/bachi-motion-$ver-windows-x64.zip" }

$notes = "packaging/windows/release-notes.md"
gh release view $tag
if ($LASTEXITCODE -eq 0) {
  gh release upload $tag $zip.FullName --clobber
} else {
  gh release create $tag $zip.FullName --title "bachi-motion $ver" --notes-file $notes
}
if ($LASTEXITCODE -ne 0) { throw "gh release failed" }
Write-Host "published $tag"
