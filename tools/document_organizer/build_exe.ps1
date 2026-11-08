param([string]$TesseractDir)

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $toolDir '.venv\Scripts\python.exe'
$model = Join-Path $toolDir 'models\kor.traineddata'

if (-not (Test-Path -LiteralPath $python)) { throw '전용 Python 환경이 없습니다. README의 준비 단계를 실행하세요.' }
if (-not (Test-Path -LiteralPath $model)) { throw '한국어 OCR 모델이 없습니다: models\kor.traineddata' }

if (-not $TesseractDir) {
    $TesseractDir = @(
        (Join-Path $env:ProgramFiles 'Tesseract-OCR')
        (Join-Path $env:LOCALAPPDATA 'Programs\Tesseract-OCR')
        (Join-Path $env:LOCALAPPDATA 'Tesseract-OCR')
    ) | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'tesseract.exe') } | Select-Object -First 1
}
if (-not $TesseractDir -or -not (Test-Path -LiteralPath (Join-Path $TesseractDir 'tesseract.exe'))) {
    throw 'Tesseract-OCR 설치 경로를 찾지 못했습니다. -TesseractDir로 지정하세요.'
}

& $python -m PyInstaller --noconfirm --clean --onedir --windowed `
    --name DocumentOrganizer `
    --distpath (Join-Path $toolDir 'dist') `
    --workpath (Join-Path $toolDir 'build') `
    --specpath $toolDir `
    --hidden-import pymupdf `
    --add-data "${model};models" `
    (Join-Path $toolDir 'app.py')
if ($LASTEXITCODE -ne 0) { throw '실행 파일 빌드에 실패했습니다.' }

$outputDir = Join-Path $toolDir 'dist\DocumentOrganizer'
$ocrDir = Join-Path $outputDir 'ocr'
New-Item -ItemType Directory -Path $ocrDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $TesseractDir 'tesseract.exe') -Destination $ocrDir
Get-ChildItem -LiteralPath $TesseractDir -Filter '*.dll' -File | Copy-Item -Destination $ocrDir

Write-Host "완료: $(Join-Path $outputDir 'DocumentOrganizer.exe')"
Write-Host '다른 PC에서는 dist\DocumentOrganizer 폴더 전체를 복사하세요.'
