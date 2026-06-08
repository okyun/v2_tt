-- =============================================================================
-- MSA 로컬·Docker 공용 MySQL 스키마 생성 (email / order / click / chat)
-- root 로 한 번만 실행한 뒤 talktrip 계정으로 각 서비스가 접속합니다.
--
-- 실행 예 (tt/docker-compose 의 mysql 컨테이너, root 비밀번호는 compose 의 MYSQL_ROOT_PASSWORD):
--   docker exec -i mysql mysql -uroot -p"0000" < tt/sql/create_msa_service_databases.sql
-- 이전에 YAML 따옴표 없이 올린 볼륨이면 root 비밀번호가 한 자리 "0" 일 수 있음:
--   docker exec -i mysql mysql -uroot -p0 < tt/sql/create_msa_service_databases.sql
--
-- 호스트에 mysql 클라이언트만 있을 때:
--   mysql -h 127.0.0.1 -P 3306 -uroot -p < tt/sql/create_msa_service_databases.sql
-- =============================================================================

/*!40101 SET NAMES utf8mb4 */;
/*!40101 SET CHARACTER SET utf8mb4 */;

CREATE DATABASE IF NOT EXISTS `emailDB` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `orderDB` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `clickDB` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `chatDB` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Docker 네트워크(172.x) 접속: localhost 전용 talktrip 계정만 있으면 컨테이너에서 거부됨
CREATE USER IF NOT EXISTS 'talktrip'@'%' IDENTIFIED BY 'talktrip123';
ALTER USER 'talktrip'@'%' IDENTIFIED WITH mysql_native_password BY 'talktrip123';

GRANT ALL PRIVILEGES ON `talktrip`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `chatDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `emailDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `orderDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `clickDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;
