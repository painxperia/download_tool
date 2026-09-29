param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\icons")
)

Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

function Add-RoundedRectanglePath {
    param(
        [System.Drawing.Drawing2D.GraphicsPath]$Path,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $diameter = $Radius * 2
    $Path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $Path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $Path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $Path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $Path.CloseFigure()
}

function New-DownloadToolIcon {
    param([int]$Size)

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    [single]$padding = [Math]::Max(1.0, $Size * 0.055)
    [single]$rectSize = $Size - (2 * $padding)
    $rect = [System.Drawing.RectangleF]::new($padding, $padding, $rectSize, $rectSize)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    Add-RoundedRectanglePath -Path $path -X $rect.X -Y $rect.Y -Width $rect.Width -Height $rect.Height -Radius ($Size * 0.22)

    $startColor = [System.Drawing.Color]::FromArgb(255, 59, 130, 246)
    $endColor = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $startColor, $endColor, 55.0)
    $graphics.FillPath($brush, $path)

    $lineWidth = [Math]::Max(1.65, $Size * 0.095)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $lineWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $center = $Size * 0.5
    $graphics.DrawLine($pen, $center, $Size * 0.22, $center, $Size * 0.60)
    $graphics.DrawLine($pen, $Size * 0.34, $Size * 0.46, $center, $Size * 0.62)
    $graphics.DrawLine($pen, $center, $Size * 0.62, $Size * 0.66, $Size * 0.46)
    $graphics.DrawLine($pen, $Size * 0.28, $Size * 0.77, $Size * 0.72, $Size * 0.77)

    $outputPath = Join-Path $OutputDirectory "icon-$Size.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $pen.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

16, 32, 48, 128 | ForEach-Object { New-DownloadToolIcon -Size $_ }
