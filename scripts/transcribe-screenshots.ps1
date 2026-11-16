param([string]$OutputDirectory = '.tmp/ocr', [switch]$EnlargedCrops)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($operation, $resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (!$engine) { throw 'Japanese OCR language is required.' }
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root $OutputDirectory
$null = New-Item -ItemType Directory -Force -Path $output
foreach ($group in 8..12) {
    $files = Get-ChildItem -LiteralPath (Join-Path $root "Q$group") -Filter *.png | Sort-Object { [int]([regex]::Match($_.Name,'\d+').Value) }
    $records = @()
    foreach ($file in $files) {
        $inputPath = $file.FullName
        if ($EnlargedCrops) { $inputPath = Join-Path $root ".tmp/ocr-input/Q$group/$($file.Name)" }
        $storage = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($inputPath)) ([Windows.Storage.StorageFile])
        $stream = Await ($storage.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $lines = @($result.Lines | ForEach-Object {
            $words = @($_.Words)
            [ordered]@{ text=$_.Text; x=($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum; y=$words[0].BoundingRect.Y; words=@($words | ForEach-Object { [ordered]@{text=$_.Text; x=$_.BoundingRect.X; y=$_.BoundingRect.Y; width=$_.BoundingRect.Width; height=$_.BoundingRect.Height} }) }
        })
        if ($EnlargedCrops) {
            foreach ($line in $lines) {
                $line.x = $line.x / 2 + 500
                $line.y = $line.y / 2 + 200
                foreach ($word in $line.words) { $word.x=$word.x/2+500; $word.y=$word.y/2+200; $word.width/=2; $word.height/=2 }
            }
        }
        $records += [ordered]@{ file=$file.Name; lines=$lines }
        $bitmap.Dispose()
        $stream.Dispose()
    }
    $records | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $output "Q$group.json")
    Write-Output "Q${group}: $($records.Count) screenshots transcribed"
}
