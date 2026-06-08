# Kafka 이벤트 테스트 스크립트 (Windows PowerShell)
# 사용법: .\scripts\send-kafka-test-events.ps1
# 백엔드가 http://localhost:8080 에서 실행 중이어야 합니다.

# 한글 출력 깨짐 방지 (UTF-8)
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($PSVersionTable.PSVersion.Major -ge 6) { $PSDefaultParameterValues['*:Encoding'] = 'utf8' }

$BaseUrl = "http://localhost:8080"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Kafka 이벤트 테스트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 상품 클릭 이벤트 여러 건
Write-Host "[1] 상품 클릭 이벤트 발행 (product-click)..." -ForegroundColor Yellow
foreach ($i in 1..5) {
    try {
        $r = Invoke-RestMethod -Uri "$BaseUrl/api/streams/products/click?productId=$i&memberId=$((100+$i))" -Method Post
        Write-Host "  productId=$i -> $r" -ForegroundColor Green
    } catch {
        Write-Host "  productId=$i 실패: $_" -ForegroundColor Red
    }
}

# 2. 주문 이벤트 여러 건
Write-Host ""
Write-Host "[2] 주문 이벤트 발행 (order-created)..." -ForegroundColor Yellow
foreach ($i in 1..3) {
    try {
        $r = Invoke-RestMethod -Uri "$BaseUrl/api/streams/orders/avro/publish?customerId=CUST-$i&quantity=$i&price=$(10*$i).00" -Method Post
        Write-Host "  orderId=$($r.orderId) -> success" -ForegroundColor Green
    } catch {
        Write-Host "  주문 $i 실패: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "완료. 백엔드 로그에서 [DEBUG][Kafka] 또는 Kafka UI(http://localhost:8086)에서 토픽 메시지를 확인하세요." -ForegroundColor Cyan
