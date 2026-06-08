# Kafka 이벤트 테스트 가이드

Kafka 이벤트가 정상 발행·소비되는지 확인하는 방법입니다.

---

## 1. 사전 준비

### Kafka 실행 (Docker)

```powershell
# 프로젝트 루트에서 실행 (한글 경로면 아래 "한글 깨짐" 참고)
cd tt
docker compose up -d kafka kafka-ui
```

- **Kafka**: 호스트 PC에서 앱이 붙을 때는 **`localhost:9092`, `19092`, `19093`** 세 엔드포인트를 `bootstrap.servers`에 함께 쓰는 패턴입니다(로컬 compose·AWS와 동일). 컨테이너 **안에서** `kafka-topics` 등을 돌릴 때는 `localhost:9092` 한 줄로도 됩니다.
- **Kafka UI**: http://localhost:8086 (토픽/메시지 확인용)
- 부트스트랩·`KAFKA_HOST`·MSK 요약: **`tt/back_end/docs/LOCAL_DEV_COMMANDS.md`** → 「Kafka 외부 bootstrap 포트」

### 백엔드 실행

백엔드를 띄워 두면 `KafkaEventConsumer`가 토픽을 구독하고, 로그에 `[DEBUG][Kafka]`로 수신 내용이 찍힙니다.

```powershell
cd back_end
./gradlew bootRun
# 또는 IDE에서 TalkTripApplication 실행 (profile: local)
```

---

## 2. 이벤트 발행 API로 테스트

### 상품 클릭 이벤트 (product-click)

**API:** `POST /api/streams/products/click`

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:8080/api/streams/products/click?productId=1&memberId=100" -Method Post
```

```bash
# curl
curl -X POST "http://localhost:8080/api/streams/products/click?productId=1&memberId=100"
```

- 성공 시: `"Product click event published"`
- 백엔드 로그: `JSON 상품 클릭 이벤트 발행 성공`, `[DEBUG][Kafka] product-click 수신`

### 주문 이벤트 (order-created) – Kafka로 보내는 API

**API:** `POST /api/streams/orders/avro/publish`

```powershell
# 기본값 (customerId=CUST-123, quantity=5, price=99.99)
Invoke-RestMethod -Uri "http://localhost:8080/api/streams/orders/avro/publish" -Method Post

# 파라미터 지정
Invoke-RestMethod -Uri "http://localhost:8080/api/streams/orders/avro/publish?customerId=200&quantity=2&price=50.00" -Method Post
```

```bash
curl -X POST "http://localhost:8080/api/streams/orders/avro/publish?customerId=200&quantity=2&price=50.00"
```

- 성공 시: `{"success":true,"orderId":"...","message":"Avro order event published successfully"}`
- 백엔드 로그: `JSON 주문 이벤트 발행 성공`, `[DEBUG][Kafka] order-created 수신`

---

## 3. 발행 결과 확인 방법

### (1) 백엔드 로그

- Producer: `JSON 상품 클릭 이벤트 발행 성공`, `JSON 주문 이벤트 발행 성공` 등
- Consumer: `[DEBUG][Kafka] product-click 수신`, `[DEBUG][Kafka] order-created 수신` (topic, partition, offset, payload)

### (2) Kafka UI

1. 브라우저에서 http://localhost:8086 접속
2. **Topics** → `product-click` 또는 `order-created` 선택
3. **Messages** 탭에서 최근 메시지 확인

### (3) 콘솔 컨슈머 스크립트 (프로젝트 포함)

Docker로 Kafka가 떠 있을 때:

```powershell
# 상품 클릭 원본 이벤트
.\scripts\kafka-streams-view.bat product-click

# 주문 생성 원본 이벤트
.\scripts\kafka-streams-view.bat order-created

# 스트림 집계 결과 (30분 텀블링 윈도우 TOP 30)
.\scripts\kafka-streams-view.bat product-click-stats
.\scripts\kafka-streams-view.bat order-purchase-stats
```

---

## 4. 한 번에 여러 이벤트 보내기 (Windows)

`scripts/send-kafka-test-events.ps1` 실행:

```powershell
cd c:\Users\김옥윤\IdeaProjects\tt
.\scripts\send-kafka-test-events.ps1
```

상품 클릭·주문 이벤트를 여러 건 보내고, 로그/토픽에서 수신 여부를 확인할 수 있습니다.

---

## 5. 토픽 정리

| 토픽 | 용도 |
|------|------|
| `product-click` | 상품 클릭 원본 이벤트 (입력) |
| `order-created` | 주문 생성 원본 이벤트 (입력) |
| `product-click-stats` | 상품 클릭 **30분** 텀블링 집계 TOP 30 (출력) |
| `order-purchase-stats` | 주문 구매 **30분** 텀블링 집계 TOP 30 (출력) |

---

## 6. 한글 깨짐 (Windows 터미널)

PowerShell에서 한글이 깨지면:

```powershell
# UTF-8 코드 페이지로 변경
chcp 65001
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

**경로에 한글이 있을 때** (예: `C:\Users\홍길동\...`):

- **방법 1**: Cursor/VS Code 터미널에서 실행 (기본이 UTF-8인 경우 많음)
- **방법 2**: 프로젝트 폴더에서 우클릭 → "터미널에서 열기" 후 `docker compose ...` 실행
- **방법 3**: 프로젝트 루트로 이동 시 `cd tt` 처럼 **상대 경로**만 사용

`send-kafka-test-events.ps1`은 스크립트 상단에 UTF-8 설정이 들어 있어서, 스크립트 안 한글 출력은 상대적으로 덜 깨집니다.

---

## 7. 자주 나오는 문제

- **연결 실패**: Kafka가 떠 있는지 확인 (`docker ps \| findstr kafka`). 호스트에서 앱이 붙을 때는 **9092·19092·19093** 부트스트랩과 `KAFKA_HOST`를 확인하세요(**LOCAL_DEV_COMMANDS.md** 「Kafka 외부 bootstrap 포트」).
- **로그에 Consumer 수신이 안 보임**: `KafkaEventConsumer`는 `product-click`, `order-created`를 구독하므로, 위 API로 이벤트를 보낸 뒤 로그 레벨이 INFO 이상인지 확인.
- **스트림 집계 결과가 비어 있음**: **30분** 텀블링 윈도우 단위로 집계되므로, 같은 윈도우 구간 안에 이벤트를 여러 번 보낸 뒤 `product-click-stats` / `order-purchase-stats`를 조회해 보세요.
