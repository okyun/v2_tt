# MySQL 데이터 디렉터리에 저장된 root 비밀번호를 재설정하고 talktrip@'%' 권한을 복구합니다.
#
# 사용 예 (tt 폴더에서):
#   .\scripts\reset-mysql-root.ps1
#   .\scripts\reset-mysql-root.ps1 -RootPassword 'mySecret'
#   .\scripts\reset-mysql-root.ps1 -RootPassword 'p@ss' -TalktripPassword 'other'
#
# 주의: -RootPassword 는 tt/docker-compose.yml 의 MYSQL_ROOT_PASSWORD 와 동일하게 맞추세요.
#       healthcheck 가 컨테이너 환경 변수 MYSQL_ROOT_PASSWORD 로 ping 합니다.

param(
    [string] $RootPassword = '0000',
    [string] $TalktripPassword = 'talktrip123'
)

function Escape-MySqlLiteral([string] $Value) {
    if ($null -eq $Value) { return '' }
    return $Value.Replace("'", "''")
}

$rp = Escape-MySqlLiteral $RootPassword
$tp = Escape-MySqlLiteral $TalktripPassword

$resetSql = @"
FLUSH PRIVILEGES;

ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$rp';

CREATE USER IF NOT EXISTS 'talktrip'@'%' IDENTIFIED BY '$tp';
ALTER USER 'talktrip'@'%' IDENTIFIED WITH mysql_native_password BY '$tp';

GRANT ALL PRIVILEGES ON talktrip.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON chatDB.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON emailDB.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON orderDB.* TO 'talktrip'@'%';
GRANT ALL PRIVILEGES ON clickDB.* TO 'talktrip'@'%';

FLUSH PRIVILEGES;
"@

$TtRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $TtRoot "docker-compose.yml"
$DataDir = Join-Path $TtRoot "docker-data\mysql"

if (-not (Test-Path $ComposeFile)) { throw "docker-compose.yml 없음: $ComposeFile" }
if (-not (Test-Path $DataDir)) { throw "데이터 디렉터리 없음: $DataDir" }

Write-Host "1) Stopping mysql..."
docker stop mysql 2>&1 | Out-Null
docker compose -f $ComposeFile stop mysql 2>&1 | Out-Null

Write-Host "2) 임시 복구 컨테이너 기동 (skip-grant-tables)..."
docker rm -f mysql-recover 2>$null | Out-Null
$vol = "${DataDir}:/var/lib/mysql"
docker run -d --rm --name mysql-recover -v $vol mysql:8.0 mysqld --skip-grant-tables --skip-networking

Write-Host "3) Waiting for mysqld (skip-grant)..."
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    docker exec mysql-recover mysql -uroot -e "SELECT 1" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Host "mysqld did not become ready. Last logs:"
    docker logs mysql-recover --tail 40 2>&1
    docker stop mysql-recover 2>&1 | Out-Null
    throw "skip-grant mysqld failed to start; see logs above"
}

Write-Host "4) Running reset SQL..."
$resetSql | docker exec -i mysql-recover mysql -uroot

Write-Host "5) Stopping recover container..."
docker stop mysql-recover

Write-Host "6) Starting mysql via compose..."
Set-Location $TtRoot
docker compose up -d mysql

Write-Host "완료. compose 의 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD 와 방금 설정이 같은지 확인하세요."
Write-Host ('접속 확인: docker exec mysql mysql -uroot -p"' + $RootPassword + '" -e "SELECT 1"')
