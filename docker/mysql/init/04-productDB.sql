-- 상품 MSA 전용 스키마. talktrip DB 의 product / product_option / product_image 와 동일 컬럼·타입.
-- productDB 에는 member·country 테이블이 없으므로 product 의 seller_id·country_id FK 는 생략하고 인덱스만 둔다.
-- (product_image·product_option → product FK 는 동일 DB 내이므로 유지)

CREATE DATABASE IF NOT EXISTS `productDB`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON `productDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;

USE `productDB`;

-- talktrip.product 와 동일 (FK to member, country 제외)
CREATE TABLE IF NOT EXISTS `product` (
  `created_at` datetime(6) NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `seller_id` bigint NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `description` varchar(1000) NOT NULL,
  `product_name` varchar(100) NOT NULL,
  `country_id` varchar(255) DEFAULT NULL,
  `thumbnail_image_hash` varchar(255) DEFAULT NULL,
  `thumbnail_image_url` varchar(255) DEFAULT NULL,
  `deleted` bit(1) NOT NULL,
  `deleted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_product_country_id` (`country_id`),
  KEY `idx_product_seller_id` (`seller_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- talktrip.product_image 와 동일
CREATE TABLE IF NOT EXISTS `product_image` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_product_image_product_id` (`product_id`),
  CONSTRAINT `fk_product_image_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- talktrip.product_option 과 동일
CREATE TABLE IF NOT EXISTS `product_option` (
  `discount_price` int NOT NULL,
  `price` int NOT NULL,
  `start_date` date DEFAULT NULL,
  `stock` int NOT NULL,
  `id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `option_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_product_option_product_id` (`product_id`),
  CONSTRAINT `fk_product_option_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
