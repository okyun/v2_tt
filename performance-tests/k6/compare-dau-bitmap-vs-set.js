#!/usr/bin/env node
/**
 * Redis DAU 저장 방식 비교 — 같은 부하 설정으로 k6를 두 번 돌립니다.
 *   1) POST /api/me/dau/visit/bitmap
 *   2) POST /api/me/dau/visit/set
 *
 * 사용 (JWT 단일 계정 예시)
 *   cd tt/performance-tests/k6
 *   set JWT=eyJ...
 *   node compare-dau-bitmap-vs-set.js
 *
 * 토큰 파일 사용
 *   set TOKENS_FILE=./dau-100-tokens.json
 *   node compare-dau-bitmap-vs-set.js
 *
 * 환경변수
 *   BASE_URL       기본 http://127.0.0.1:8080
 *   JWT | TOKENS_FILE  (하나 필수)
 *   VUS            기본 50
 *   DURATION       기본 30s
 *   K6_BIN         기본 k6
 *   KEEP_SUMMARY=1 요약 JSON 파일 유지 (.summary-dau-bitmap.json, .summary-dau-set.json)
 *   REDIS_DOCKER_CONTAINER=talktrip-redis  설정 시 실행 후 BITCOUNT / SCARD 출력 (선택)
 *
 * 피크 VU(기본 100) 스테이지 비교는 compare-dau-bitmap-vs-set-100-users.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const k6Bin = process.env.K6_BIN || 'k6';
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';
const vus = process.env.VUS || '50';
const duration = process.env.DURATION || '30s';

const summaryBitmap = path.join(dir, '.summary-dau-bitmap.json');
const summarySet = path.join(dir, '.summary-dau-set.json');

function requireAuthEnv() {
  if (!process.env.JWT && !process.env.TOKENS_FILE) {
    console.error('환경변수 JWT 또는 TOKENS_FILE 이 필요합니다.');
    process.exit(1);
  }
}

function runK6(visitPath, summaryPath) {
  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    VISIT_PATH: visitPath,
    VUS: vus,
    DURATION: duration,
  };
  const script = path.join(dir, 'dau-visit.js');
  const args = ['run', '--summary-export', summaryPath, script];
  console.log(`\n▶ ${k6Bin} ${args.join(' ')} (VISIT_PATH=${visitPath})\n`);
  const r = spawnSync(k6Bin, args, {
    env,
    cwd: dir,
    stdio: 'inherit',
  });
  return r.status === 0;
}

function loadSummary(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function val(summary, metric, field) {
  const v = summary?.metrics?.[metric]?.values?.[field];
  return v !== undefined && v !== null ? v : null;
}

function fmt(x, digits = 2) {
  if (x === null || Number.isNaN(x)) return '—';
  if (typeof x === 'number') return Number(x.toFixed(digits));
  return String(x);
}

function todayBasicIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function printTable(bitmapSummary, setSummary) {
  const metrics = [
    ['http_req_duration avg (ms)', 'http_req_duration', 'avg'],
    ['http_req_duration med (ms)', 'http_req_duration', 'med'],
    ['http_req_duration p(95) (ms)', 'http_req_duration', 'p(95)'],
    ['http_reqs (건)', 'http_reqs', 'count'],
    ['http_reqs rate (/s)', 'http_reqs', 'rate'],
    ['http_req_failed rate', 'http_req_failed', 'rate'],
    ['checks 성공률', 'checks', 'rate'],
    ['dau_visit_fail rate', 'dau_visit_fail', 'rate'],
  ];

  console.log('\n========== 요약 비교 (같은 VUS·DURATION·토큰) ==========');
  console.log(`${'지표'.padEnd(36)} | bitmap (/visit/bitmap) | set (/visit/set)`);
  console.log('-'.repeat(85));

  for (const [label, m, f] of metrics) {
    const b = fmt(val(bitmapSummary, m, f), f === 'count' ? 0 : 4);
    const s = fmt(val(setSummary, m, f), f === 'count' ? 0 : 4);
    console.log(`${label.padEnd(36)} | ${String(b).padStart(22)} | ${String(s).padStart(20)}`);
  }
  console.log('-'.repeat(85));
  console.log(`설정: BASE_URL=${baseUrl} VUS=${vus} DURATION=${duration}`);
  console.log(
    '\n※ 같은 사용자가 두 번째 테스트에서 이미 방문 처리되어 Redis 카운트가 한쪽만 크게 안 나올 수 있습니다.',
  );
  console.log(
    '   순수 저장 부하는 위 지표(http_req_duration, rate) 위주로 비교하고, 카운트 검증은 다른 일자 키 또는 초기화 후 단일 시나리오로 확인하세요.',
  );
}

function maybeRedisCli() {
  const container = process.env.REDIS_DOCKER_CONTAINER;
  if (!container) return;

  const day = todayBasicIso();
  const bitmapKey = `talktrip:dau:bitmap:${day}`;
  const setKey = `talktrip:dau:set:${day}`;

  const runCli = (args) => {
    const r = spawnSync('docker', ['exec', container, 'redis-cli', ...args], {
      encoding: 'utf8',
    });
    return (r.stdout || '').trim();
  };

  console.log(`\n========== Redis (${container}) 당일 키 (${day}) ==========`);
  try {
    const bc = runCli(['BITCOUNT', bitmapKey]);
    const sc = runCli(['SCARD', setKey]);
    console.log(`BITCOUNT ${bitmapKey} => ${bc}`);
    console.log(`SCARD    ${setKey} => ${sc}`);
  } catch (e) {
    console.error('redis-cli 조회 실패:', e.message);
  }
}

function cleanupSummaries() {
  if (process.env.KEEP_SUMMARY === '1') return;
  try {
    fs.unlinkSync(summaryBitmap);
  } catch (_) {}
  try {
    fs.unlinkSync(summarySet);
  } catch (_) {}
}

function main() {
  requireAuthEnv();

  try {
    fs.unlinkSync(summaryBitmap);
  } catch (_) {}
  try {
    fs.unlinkSync(summarySet);
  } catch (_) {}

  if (!runK6('/api/me/dau/visit/bitmap', summaryBitmap)) {
    console.error('bitmap 시나리오 k6 실패');
    process.exit(1);
  }
  if (!runK6('/api/me/dau/visit/set', summarySet)) {
    console.error('set 시나리오 k6 실패');
    process.exit(1);
  }

  const jb = loadSummary(summaryBitmap);
  const js = loadSummary(summarySet);
  printTable(jb, js);
  maybeRedisCli();
  cleanupSummaries();
}

main();
