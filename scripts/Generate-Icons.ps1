$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$iconsRoot = Join-Path $root "src\\common\\icons"

if (-not (Test-Path -LiteralPath $iconsRoot)) {
    New-Item -ItemType Directory -Path $iconsRoot | Out-Null
}

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 64, 96, 128)

foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $backgroundRect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
        $backgroundRect,
        [System.Drawing.Color]::FromArgb(255, 15, 118, 110),
        [System.Drawing.Color]::FromArgb(255, 24, 95, 189),
        45
    )
    $graphics.FillEllipse($backgroundBrush, 1, 1, $size - 2, $size - 2)

    $ringPen = New-Object System.Drawing.Pen -ArgumentList @(
        [System.Drawing.Color]::FromArgb(120, 255, 255, 255),
        [float][Math]::Max(1, $size * 0.05)
    )
    $graphics.DrawEllipse($ringPen, $size * 0.08, $size * 0.08, $size * 0.84, $size * 0.84)

    $linePen = New-Object System.Drawing.Pen -ArgumentList @(
        [System.Drawing.Color]::White,
        [float][Math]::Max(2, $size * 0.085)
    )
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $leftX = [int]($size * 0.28)
    $midX = [int]($size * 0.48)
    $rightX = [int]($size * 0.70)
    $topY = [int]($size * 0.27)
    $midY = [int]($size * 0.50)
    $bottomY = [int]($size * 0.72)

    $graphics.DrawLine($linePen, $leftX, $topY, $leftX, $bottomY)
    $graphics.DrawLine($linePen, $leftX, $midY, $midX, $midY)
    $graphics.DrawLine($linePen, $midX, $midY, $midX, $topY)
    $graphics.DrawLine($linePen, $midX, $midY, $rightX, $midY)

    $nodeBrush = New-Object System.Drawing.SolidBrush -ArgumentList @(
        [System.Drawing.Color]::FromArgb(255, 255, 244, 214)
    )
    $nodeRadius = [Math]::Max(3, [int]($size * 0.10))

    foreach ($point in @(
        @{ X = $leftX; Y = $topY },
        @{ X = $leftX; Y = $bottomY },
        @{ X = $midX; Y = $topY },
        @{ X = $rightX; Y = $midY }
    )) {
        $graphics.FillEllipse($nodeBrush, $point.X - $nodeRadius, $point.Y - $nodeRadius, $nodeRadius * 2, $nodeRadius * 2)
    }

    $targetPath = Join-Path $iconsRoot "icon-$size.png"
    $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $nodeBrush.Dispose()
    $linePen.Dispose()
    $ringPen.Dispose()
    $backgroundBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
