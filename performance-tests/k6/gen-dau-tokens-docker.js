#!/usr/bin/env node
/**
 * Docker MySQL(`mysql` 컨테이너) talktrip DB에서 회원 이메일을 읽어 JWT 배열(JSON)을 stdout에 출력합니다.
 * k6 DAU 부하에서 100명 고유 비트를 쓰려면 결과를 파일로 저장하세요.
 *
 * 사용:
 *   cd tt/performance-tests/k6
 *   node gen-dau-tokens-docker.js > dau-100-tokens.json
 *
 * 환경변수:
 *   MYSQL_CONTAINER=mysql
 *   MEMBER_LIMIT=100
 *   JWT_SECRET_KEY=...  (미설정 시 앱 기본값과 동일하게 맞춤)
 *
 * 주의: DB 비밀번호가 스크립트에 박혀 있음(tt/docker-compose.yml 기본).
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');

const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || 'mysql';
const MEMBER_LIMIT = Math.min(500, Math.max(1, parseInt(process.env.MEMBER_LIMIT || '100', 10) || 100));
const SECRET =
  process.env.JWT_SECRET_KEY || 'TalkTrip0721SecretKeyUsingJWT1313goormiroom';

function mint(email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      email,
      sub: email,
      iat: now,
      exp: now + 86400,
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

const sql = `SELECT account_email FROM talktrip.member ORDER BY member_id ASC LIMIT ${MEMBER_LIMIT}`;

const docker = spawnSync(
  'docker',
  [
    'exec',
    MYSQL_CONTAINER,
    'mysql',
    '-utalktrip',
    '-ptalktrip123',
    '-N',
    '-B',
    '-e',
    sql,
  ],
  { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
);

if (docker.error) {
  console.error('docker 실행 실패:', docker.error.message);
  process.exit(1);
}
if (docker.status !== 0) {
  console.error('mysql 조회 실패 (exit ' + docker.status + '):', docker.stderr || '');
  process.exit(1);
}

const out = docker.stdout;

const emails = out
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

if (emails.length === 0) {
  console.error('회원 이메일이 0건입니다. mysql·DB·테이블을 확인하세요.');
  process.exit(1);
}

const tokens = emails.map((email) => mint(email));
process.stdout.write(JSON.stringify(tokens, null, 0));
