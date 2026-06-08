-- 신규 데이터 디렉터리 최초 기동 시에만 실행됨 (/docker-entrypoint-initdb.d).
-- Docker 브리지 IP(예: 172.x)에서 접속하려면 talktrip@'%' + mysql_native_password 필요.

CREATE USER IF NOT EXISTS 'talktrip'@'%' IDENTIFIED BY 'talktrip123';
ALTER USER 'talktrip'@'%' IDENTIFIED WITH mysql_native_password BY 'talktrip123';

GRANT ALL PRIVILEGES ON `talktrip`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `chatDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `emailDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `orderDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `clickDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `likeDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;
