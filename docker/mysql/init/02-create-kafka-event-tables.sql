-- 신규 데이터 디렉터리 최초 기동 시에만 실행됨 (/docker-entrypoint-initdb.d).
-- Kafka 컨슈머의 중복 처리 방지/감사/재처리용 최소 테이블 세트.

USE `orderDB`;

-- 컨슈머 처리 이력(중복 방지용). topic+partition+offset 유니크로 exactly-once에 가까운 처리를 지원.
CREATE TABLE IF NOT EXISTS `processed_event` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `topic` VARCHAR(255) NOT NULL,
  `partition_id` INT NOT NULL,
  `offset_id` BIGINT NOT NULL,
  `consumer_group` VARCHAR(255) NULL,
  `event_key` VARCHAR(255) NULL,
  `event_type` VARCHAR(64) NULL,          -- 예: ORDER_CREATED, PAYMENT_SUCCESS
  `status` VARCHAR(32) NOT NULL DEFAULT 'PROCESSED', -- PROCESSED/FAILED/SKIPPED 등
  `error_message` TEXT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_processed_event_tpo` (`topic`, `partition_id`, `offset_id`),
  KEY `idx_processed_event_group_time` (`consumer_group`, `received_at`),
  KEY `idx_processed_event_type_time` (`event_type`, `received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 도메인 이벤트 감사 로그(필요 필드만 정규화 + 원문 payload 선택 저장).
CREATE TABLE IF NOT EXISTS `purchase_event` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_type` VARCHAR(64) NOT NULL,      -- ORDER_CREATED / PAYMENT_SUCCESS 등
  `order_id` VARCHAR(64) NULL,
  `member_id` BIGINT NULL,
  `order_code` VARCHAR(64) NULL,
  `topic` VARCHAR(255) NOT NULL,
  `partition_id` INT NOT NULL,
  `offset_id` BIGINT NOT NULL,
  `event_key` VARCHAR(255) NULL,
  `payload_json` JSON NULL,
  `event_time` DATETIME(3) NULL,          -- payload 내 timestamp가 있으면 매핑, 없으면 null
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchase_event_tpo` (`topic`, `partition_id`, `offset_id`),
  KEY `idx_purchase_event_order` (`order_id`),
  KEY `idx_purchase_event_member_time` (`member_id`, `received_at`),
  KEY `idx_purchase_event_type_time` (`event_type`, `received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

