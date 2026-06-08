-- 이미 데이터가 있는 MySQL(기존 docker-data/mysql 등)에서 1회 실행.
-- 오류: Host '172.x.x.x' is not allowed to connect → talktrip@'%' 없음/권한 부족일 때.
--
-- docker exec -i mysql mysql -uroot -p"0000" < tt/sql/grant_talktrip_remote_host.sql

CREATE USER IF NOT EXISTS 'talktrip'@'%' IDENTIFIED BY 'talktrip123';
ALTER USER 'talktrip'@'%' IDENTIFIED WITH mysql_native_password BY 'talktrip123';

GRANT ALL PRIVILEGES ON `talktrip`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `chatDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `emailDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `orderDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `clickDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;
