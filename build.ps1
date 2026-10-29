# ==========================================================================
# build.ps1 — 전달용 HTML 한 파일 만들기 (build.bat 을 더블클릭하면 이 파일이 실행됨)
#
#   index.html 의 <link>(css/app.css) 와 <script src>(js/*.js, 편집기 포함)를 그 자리에 내용째 넣어
#   dist\asis-keeper.html 하나로 만듭니다. 순서는 index.html 그대로 — 원본 파일은 바꾸지 않습니다.
#   압축(주석 · 줄바꿈 지우기)은 하지 않음: 받은 쪽에서도 코드를 읽을 수 있게.
#   코드를 고친 뒤에는 다시 실행해야 dist 파일에 반영됩니다. dist\ 는 .gitignore 에 있어 git 에 올라가지 않음.
# ==========================================================================

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$outDir = Join-Path $root 'dist'
$outFile = Join-Path $outDir 'asis-keeper.html'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

# 파일 읽기 (UTF-8)
function Read-SourceFile([string]$relativePath) {
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path)) { throw "파일이 없습니다: $relativePath" }
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

$html = Read-SourceFile 'index.html'

# 1) CSS: <link> 를 <style> 로
$cssLink = '<link rel="stylesheet" href="css/app.css">'
if (-not $html.Contains($cssLink)) { throw "index.html 에서 다음 줄을 찾지 못했습니다: $cssLink" }
$html = $html.Replace($cssLink, "<style>`n" + (Read-SourceFile 'css/app.css') + "`n</style>")

# 2) JS: <script src="…"></script> 를 내용째로 (index.html 순서 그대로)
#    글 안의 '</script' 와 '<!--' 는 HTML 이 스크립트 끝 · 주석으로 잘못 읽지 않게 바꿔 둠 (JS 에서는 같은 글자)
$script:scriptCount = 0
$html = [regex]::Replace($html, '<script src="([^"]+)"></script>', {
  param($match)
  $script:scriptCount++
  $source = $match.Groups[1].Value
  $code = (Read-SourceFile $source).Replace('</script', '<\/script').Replace('<!--', '<\!--')
  return "<script>/* ---- $source ---- */`n$code`n</script>"
})
if ($script:scriptCount -eq 0) { throw 'index.html 에서 <script src> 를 찾지 못했습니다.' }

# 3) 맨 위에 만든 파일이라는 표시 (직접 고치지 말 것)
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$html = $html.Replace('<html lang="ko">', "<html lang=`"ko`">`n<!-- 자동 생성 파일 ($stamp, build.bat). 직접 고치지 말고 원본(index.html · css · js)을 고친 뒤 build.bat 을 다시 실행하세요. -->")

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
[System.IO.File]::WriteAllText($outFile, $html, $utf8NoBom)

$sizeKb = [math]::Round((Get-Item -LiteralPath $outFile).Length / 1KB)
Write-Host ''
Write-Host "완료: dist\asis-keeper.html  ($sizeKb KB, 스크립트 $($script:scriptCount)개 포함)" -ForegroundColor Green
Write-Host '이 파일 하나만 전달하면 됩니다. Chrome 또는 Edge 로 여세요.'
