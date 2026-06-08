# Kafka Streams 결과 확인 스크립트

Kafka Streams로 처리된 결과를 확인하기 위한 스크립트 모음입니다.

## 사용 가능한 스크립트

### 1. `kafka-streams-view.sh` / `kafka-streams-view.bat`
특정 토픽의 메시지를 실시간으로 확인합니다.

**사용법:**
```bash
# Linux/Mac
chmod +x kafka-streams-view.sh
./kafka-streams-view.sh product-click-stats

# Windows
kafka-streams-view.bat product-click-stats
```

**예시:**
```bash
# 상품 클릭 통계 확인
./kafka-streams-view.sh product-click-stats

# 주문 구매 통계 확인
./kafka-streams-view.sh order-purchase-stats

# 원본 이벤트 확인
./kafka-streams-view.sh product-click
./kafka-streams-view.sh order-created
```

### 2. `kafka-streams-view-all.sh` / `kafka-streams-view-all.bat`
모든 Kafka Streams 관련 토픽 목록을 확인합니다.

**사용법:**
```bash
# Linux/Mac
chmod +x kafka-streams-view-all.sh
./kafka-streams-view-all.sh

# Windows
kafka-streams-view-all.bat
```

### 3. `kafka-streams-view-avro.sh` / `kafka-streams-view-avro.bat`
로컬 compose에는 Schema Registry가 없습니다. 실행 시 **JSON 뷰어(`kafka-streams-view`) 사용 안내**만 출력하고 종료합니다.

## Kafka Streams 토픽 정보

### 입력 토픽 (원본 이벤트)
- `product-click`: 상품 클릭 이벤트 (**JSON**, 애플리케이션 `JsonSerializer`)
- `order-created`: 주문 생성 이벤트 (**JSON**)

### 출력 토픽 (스트림 처리 결과)
- `product-click-stats`: 상품 클릭 통계 (**30분** 텀블링 윈도우, TOP 30) - **JSON 형식**
- `order-purchase-stats`: 주문 구매 통계 (**30분** 텀블링 윈도우, TOP 30) - **JSON 형식**

## 처리 로직

### ProductClickProcessor
- **윈도우 크기**: **30분** (`Duration.ofMinutes(30)`, `TimeWindows.ofSizeWithNoGrace`)
- **집계 방식**: 텀블링 윈도우마다 상품별 클릭 수 집계
- **결과**: TOP 30 상품 클릭 통계

### OrderPurchaseProcessor
- **윈도우 크기**: **30분** (동일)
- **집계 방식**: 텀블링 윈도우마다 주문 항목별 구매 수 집계
- **결과**: TOP 30 주문 구매 통계

## Docker 환경에서 사용

스크립트는 자동으로 Docker 환경을 감지하여 도커 컨테이너 내부에서 실행합니다.

애플리케이션(Spring 등)이 **호스트 PC·IDE**에서 브로커에 붙을 때는 **`localhost:9092`, `19092`, `19093`** 을 한 줄에 넣는 패턴입니다. 아래 `docker exec` 예시는 **브로커 컨테이너 내부**에서 `localhost:9092`만 지정해도 됩니다. 전체 설명은 **`tt/back_end/docs/LOCAL_DEV_COMMANDS.md`** 의 「Kafka 외부 bootstrap 포트」절을 참고하세요.

```bash
# 토픽 목록 확인
docker exec -it talktrip-kafka kafka-topics --bootstrap-server localhost:9092 --list

# JSON 형식 토픽 메시지 확인
docker exec -it talktrip-kafka kafka-console-consumer \
    --bootstrap-server localhost:9092 \
    --topic product-click-stats \
    --from-beginning \
    --property print.key=true \
    --property print.value=true
```

## 로컬 Kafka 환경에서 사용

로컬에 Kafka가 설치되어 있다면 스크립트가 자동으로 로컬 Kafka를 사용합니다.

```bash
# KAFKA_HOME 환경 변수 설정 (필요시)
export KAFKA_HOME=/path/to/kafka

# 또는 kafka-console-consumer가 PATH에 있는 경우 바로 실행
kafka-console-consumer --bootstrap-server localhost:9092 --topic product-click-stats --from-beginning
```

## 환경 변수

스크립트 실행 전 환경 변수를 설정하여 기본값을 변경할 수 있습니다:

```bash
# Linux/Mac
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Windows
set KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

## 문제 해결

### 스크립트가 실행되지 않는 경우
- Linux/Mac: `chmod +x kafka-streams-view.sh`로 실행 권한 부여
- Windows: PowerShell 또는 명령 프롬프트에서 실행

### Kafka를 찾을 수 없는 경우
- Docker 환경인지 확인: `docker ps | grep kafka`
- 로컬 Kafka 설치 확인: `kafka-topics --version`
- KAFKA_HOME 환경 변수 확인

### 메시지가 표시되지 않는 경우
- Kafka Streams 애플리케이션이 실행 중인지 확인
- 토픽에 메시지가 있는지 확인: `kafka-topics --describe --topic [토픽명]`
- `--from-beginning` 옵션으로 이전 메시지 확인
