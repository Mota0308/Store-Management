$pdfPath = "C:\Users\Dolphin\OneDrive - City University of Hong Kong - Student\桌面\Project_Q\發票(訂單號碼_3095811,3095810,3095776,3095773).pdf"
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = @()
$bodyLines += "--$boundary"
$bodyLines += "Content-Disposition: form-data; name=`"locationId`"$LF"
$bodyLines += "元朗$LF"
$bodyLines += "--$boundary"
$bodyLines += "Content-Disposition: form-data; name=`"file`"; filename=`"test.pdf`"$LF"
$bodyLines += "Content-Type: application/pdf$LF$LF"
$body = $bodyLines -join $LF
$pdfBytes = [System.IO.File]::ReadAllBytes($pdfPath)
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$endBoundary = [System.Text.Encoding]::UTF8.GetBytes("$LF--$boundary--$LF")
$fullBody = $bodyBytes + $pdfBytes + $endBoundary
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4001/api/import/outgoing" -Method POST -Body $fullBody -ContentType "multipart/form-data; boundary=$boundary"
    Write-Host "響應狀態: $($response.StatusCode)" -ForegroundColor Green
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "處理結果:" -ForegroundColor Yellow
    Write-Host "處理: $($responseData.summary.processed)" -ForegroundColor Cyan
    Write-Host "匹配: $($responseData.summary.matched)" -ForegroundColor Cyan
    Write-Host "更新: $($responseData.summary.updated)" -ForegroundColor Cyan
    Write-Host "未找到: $($responseData.summary.notFound -join ', ')" -ForegroundColor Cyan
    Write-Host "錯誤: $($responseData.summary.errors -join ', ')" -ForegroundColor Red
} catch {
    Write-Host "錯誤: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "錯誤詳情: $responseBody" -ForegroundColor Red
    }
}
