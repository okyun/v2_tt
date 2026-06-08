-- 좋아요 MSA 전용 스키마 (like-change 소비 서비스). MYSQL_DATABASE 와 무관하게 추가 생성·권한 부여.
CREATE DATABASE IF NOT EXISTS `likeDB`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `likeDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;

-- talktrip DB 의 likes 와 동일 컬럼·인덱스 의도. likeDB 에는 member/product 테이블이 없어 FK 는 생략.
-- talktrip-like-service 는 created_at/updated_at 을 매핑하지 않으므로 INSERT 시 DEFAULT 로 채움.
USE `likeDB`;

CREATE TABLE IF NOT EXISTS `likes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `member_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP(6)),
  `updated_at` datetime(6) NOT NULL DEFAULT (CURRENT_TIMESTAMP(6)) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_likes_product_member` (`product_id`, `member_id`),
  KEY `idx_likes_member_id` (`member_id`),
  KEY `idx_likes_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
