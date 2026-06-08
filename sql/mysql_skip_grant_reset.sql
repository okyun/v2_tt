-- 수동 실행용 참고 스크립트 (비밀번호 바꾸려면 아래 문자열 수정).
-- 자동화는 tt/scripts/reset-mysql-root.ps1 (-RootPassword, -TalktripPassword) 사용.
-- skip-grant-tables 로 기동한 임시 mysqld 에서만 실행합니다.

FLUSH PRIVILEGES;

ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '0000';

CREATE USER IF NOT EXISTS 'talktrip'@'%' IDENTIFIED BY 'talktrip123';
ALTER USER 'talktrip'@'%' IDENTIFIED WITH mysql_native_password BY 'talktrip123';

GRANT ALL PRIVILEGES ON `talktrip`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `chatDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `emailDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `orderDB`.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON `clickDB`.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;
