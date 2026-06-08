#!/usr/bin/env node
/**
 * Redis DAU 저장 방식 비교 — 「피크 VU 기본 1000」 스테이지로 k6를 두 번 돌립니다.
 *   1) POST /api/me/dau/visit/bitmap
 *   2) POST /api/me/dau/visit/set
 *
 * 내부적으로 `dau-visit-100-users.js`(스테이지 시나리오)를 재사용하며, PEAK_VUS 기본값만 1000으로 둡니다.
 *
 * 사용 예시 (PowerShell)
 *   cd tt/performance-tests/k6
 *   $env:TOKENS_FILE = ".\dau-100-tokens.json"
 *   node compare-dau-bitmap-vs-set-1000-users.js
 *
 * 환경변수
 *   BASE_URL              기본 http://127.0.0.1:8080
 *   JWT | TOKENS_FILE     하나 필수
 *   PEAK_VUS              기본 1000
 *   RAMP_DURATION         기본 2m
 *   HOLD_DURATION         기본 5m
 *   RAMP_DOWN_DURATION    기본 2m
 *   SLEEP_SEC             기본 0.15
 *   K6_BIN                기본 k6
 *   KEEP_SUMMARY=1        .summary-dau-1000u-*.json 유지
 *   REDIS_DOCKER_CONTAINER  선택 — 실행 후 BITCOUNT / SCARD 출력
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const k6Bin = process.env.K6_BIN || 'k6';
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';
const peakVus = process.env.PEAK_VUS || '1000';
const rampDuration = process.env.RAMP_DURATION || '2m';
const holdDuration = process.env.HOLD_DURATION || '5m';
const rampDownDuration = process.env.RAMP_DOWN_DURATION || '2m';
const sleepSec = process.env.SLEEP_SEC || '0.15';

const summaryBitmap = path.join(dir, '.summary-dau-1000u-bitmap.json');
const summarySet = path.join(dir, '.summary-dau-1000u-set.json');

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
    PEAK_VUS: peakVus,
    RAMP_DURATION: rampDuration,
    HOLD_DURATION: holdDuration,
    RAMP_DOWN_DURATION: rampDownDuration,
    SLEEP_SEC: sleepSec,
  };
  const script = path.join(dir, 'dau-visit-100-users.js');
  const args = ['run', '--summary-export', summaryPath, script];
  console.log(`\n▶ ${k6Bin} ${args.join(' ')}`);
  console.log(`   VISIT_PATH=${visitPath} PEAK_VUS=${peakVus} ramp=${rampDuration} hold=${holdDuration} down=${rampDownDuration}\n`);
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

function pick(summary, metric, field) {
  const v = summary?.metrics?.[metric]?.values?.[field];
  return v !== undefined && v !== null ? v : null;
}

function fmt(x, field) {
  if (x === null || Number.isNaN(x)) return '—';
  const digits = field === 'count' ? 0 : 4;
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
  const rows = [
    ['http_req_duration avg (ms)', 'http_req_duration', 'avg'],
    ['http_req_duration med (ms)', 'http_req_duration', 'med'],
    ['http_req_duration p(95) (ms)', 'http_req_duration', 'p(95)'],
    ['http_reqs (건)', 'http_reqs', 'count'],
    ['http_reqs rate (/s)', 'http_reqs', 'rate'],
    ['http_req_failed rate', 'http_req_failed', 'rate'],
    ['checks 성공률', 'checks', 'rate'],
    ['dau_visit_fail rate', 'dau_visit_fail', 'rate'],
  ];

  console.log('\n========== 요약 비교 (피크 VU 스테이지 · 동일 스테이지·토큰) ==========');
  console.log(`${'지표'.padEnd(36)} | bitmap (/visit/bitmap) | set (/visit/set)`);
  console.log('-'.repeat(85));

  for (const [label, m, f] of rows) {
    const b = fmt(pick(bitmapSummary, m, f), f);
    const s = fmt(pick(setSummary, m, f), f);
    console.log(`${label.padEnd(36)} | ${String(b).padStart(22)} | ${String(s).padStart(20)}`);
  }
  console.log('-'.repeat(85));
  console.log(
    `설정: BASE_URL=${baseUrl} PEAK_VUS=${peakVus} ${rampDuration}/${holdDuration}/${rampDownDuration} SLEEP_SEC=${sleepSec}`,
  );
  console.log(
    '\n※ bitmap 실행 후 set 실행 순이라, 같은 계정이면 그날 두 구조 모두 이미 기록된 상태일 수 있습니다.',
  );
  console.log('   HTTP 지표로 저장/API 부하를 비교하고, Redis 수치는 TOKENS_FILE로 사용자를 나눠 재실행하는 편이 좋습니다.');
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
    console.log(`BITCOUNT ${bitmapKey} => ${runCli(['BITCOUNT', bitmapKey])}`);
    console.log(`SCARD    ${setKey} => ${runCli(['SCARD', setKey])}`);
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

  printTable(loadSummary(summaryBitmap), loadSummary(summarySet));
  maybeRedisCli();
  cleanupSummaries();
}

main();

