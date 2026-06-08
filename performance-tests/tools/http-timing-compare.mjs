/**
 * Postman "응답시간" 비슷한 체감: 같은 URL을 N번 호출하고, 특히 1번째 vs 2번째(또는 min/avg) 차이를 출력합니다.
 *
 * 사용 예:
 *   node http-timing-compare.mjs --url "http://localhost:8080/api/products?page=0&size=9&sort=updatedAt&sort=desc" --n 5
 *
 * Vite(5173)를 경유(프록시)해서 측정하려면:
 *   node http-timing-compare.mjs --url "http://localhost:5173/api/products?page=0&size=9&sort=updatedAt&sort=desc" --n 5
 *
 * options:
 *   --url <string>   (필수)
 *   --n <int>        반복 횟수 (기본 2)
 *   --method GET|HEAD (기본 GET)  // HEAD는 바디는 없고 TTFB/HTTP 오버헤드 위주
 *
 * "1st 실행 한 번" + "2nd 실행 한 번"을 분리해서 비교(요청):
 *   1) 1차(캐시 지우고/상황 준비한 뒤) 측정 + 상태 저장
 *      node http-timing-compare.mjs --step 1 --url "..." --state .\\bench.state.json
 *   2) 2차(다시 한 번만) 측정 + 1차 결과와 비교 출력
 *      node http-timing-compare.mjs --step 2 --url "..." --state .\\bench.state.json
 *
 *   - --state 를 생략하면 URL/ METHOD 기반으로 cwd에 자동 파일명을 씁니다.
 *   - --reset-state 로 step1 저장분을 지울 수 있습니다.
 */

import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function argValue(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function num(v, def) {
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function fmtMs(x) {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  return `${x.toFixed(2)}ms`;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const w = rank - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

function defaultStatePath(cwd, url, method) {
  const h = crypto.createHash('sha256').update(`${method}\n${url}`).digest('hex').slice(0, 16);
  return path.join(cwd, `.http-timing-compare.${h}.json`);
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(file, obj) {
  const raw = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(file, raw, 'utf8');
}

async function measureOnce(url, method) {
  const t0 = performance.now();
  const res = await fetch(url, { method, redirect: 'follow' });
  let bodyBytes = null;
  if (method === 'GET') {
    const ab = await res.arrayBuffer();
    bodyBytes = ab.byteLength;
  }
  const t1 = performance.now();
  return { totalMs: t1 - t0, status: res.status, bodyBytes };
}

export async function runFromArgv(argv) {
  if (hasFlag(argv, '-h') || hasFlag(argv, '--help')) {
    // eslint-disable-next-line no-console
    console.log(`
http-timing-compare.mjs

--url    요청 URL (필수)
--n      반복 횟수 (기본 2)
--method GET|HEAD (기본 GET)

분리 측정(1-shot * 2번 실행):
--step 1|2
--state <file>        (선택) 1차 결과 저장/2차에서 읽기
--reset-state         (선택) state 파일 삭제 후 종료
`);
    process.exit(0);
  }

  const url = argValue(argv, '--url');
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('ERROR: --url 이 필요합니다.');
    process.exit(2);
  }

  const n = Math.max(1, Math.min(10_000, num(argValue(argv, '--n'), 2)));
  const method = (argValue(argv, '--method') || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    // eslint-disable-next-line no-console
    console.error('ERROR: --method 는 GET 또는 HEAD만 지원합니다.');
    process.exit(2);
  }

  const cwd = process.cwd();
  const stepRaw = argValue(argv, '--step');
  const step = stepRaw == null ? null : String(stepRaw).trim();
  const stateFile =
    argValue(argv, '--state') || (step ? defaultStatePath(cwd, url, method) : null);

  if (hasFlag(argv, '--reset-state')) {
    if (!stateFile) {
      // eslint-disable-next-line no-console
      console.error('ERROR: --reset-state 는 --state (또는 --step 과 함께 자동 state 경로)가 필요합니다.');
      process.exit(2);
    }
    try {
      await fs.unlink(stateFile);
      // eslint-disable-next-line no-console
      console.log(`[http-timing-compare] state deleted: ${stateFile}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[http-timing-compare] state delete skipped: ${String(e?.message || e)}`);
    }
    process.exit(0);
  }

  // 분리 측정 모드: step1에서 1번, step2에서 1번 + 비교
  if (step) {
    if (step !== '1' && step !== '2') {
      // eslint-disable-next-line no-console
      console.error('ERROR: --step 는 1 또는 2만 가능합니다.');
      process.exit(2);
    }
    if (!stateFile) {
      // eslint-disable-next-line no-console
      console.error('ERROR: --step 모드에서는 state 경로를 결정할 수 없습니다. --state 를 명시하세요.');
      process.exit(2);
    }

    // eslint-disable-next-line no-console
    console.log(`[http-timing-compare][step ${step}] ${method} x1\n${url}\n`);
    // eslint-disable-next-line no-console
    console.log(`state: ${stateFile}\n`);

    const m = await measureOnce(url, method);
    // eslint-disable-next-line no-console
    console.log(`01/1  status=${m.status}  total=${fmtMs(m.totalMs)}${m.bodyBytes != null ? `  body=${m.bodyBytes}B` : ''}`);

    if (step === '1') {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        url,
        method,
        first: {
          totalMs: m.totalMs,
          status: m.status,
          bodyBytes: m.bodyBytes,
        },
      };
      await writeJson(stateFile, payload);
      // eslint-disable-next-line no-console
      console.log('\n== step1 saved ==');
      // eslint-disable-next-line no-console
      console.log(`1st=${fmtMs(m.totalMs)}`);
      // eslint-disable-next-line no-console
      console.log(`\n다음: redis key 삭제/준비 작업 후, 동일한 명령으로 --step 2 를 실행하세요.`);
      return;
    }

    // step === '2'
    let prev;
    try {
      prev = await readJson(stateFile);
    } catch {
      // eslint-disable-next-line no-console
      console.error(`ERROR: state 파일을 읽을 수 없습니다: ${stateFile}\n먼저 --step 1 로 1차 결과를 저장하세요.`);
      process.exit(2);
    }

    if (!prev || prev.url !== url || prev.method !== method) {
      // eslint-disable-next-line no-console
      console.error(
        'ERROR: state의 url/method와 현재 요청이 다릅니다.\n' +
          `state.url=${prev?.url}\nnow.url=${url}\nstate.method=${prev?.method}\nnow.method=${method}`
      );
      process.exit(2);
    }

    const a = prev.first?.totalMs;
    const b = m.totalMs;
    const delta = b - a;
    const pct = a > 0 ? (delta / a) * 100 : null;

    // eslint-disable-next-line no-console
    console.log('\n== step2 compare (2nd vs saved 1st) ==');
    // eslint-disable-next-line no-console
    console.log(`saved 1st(${prev.savedAt})=${fmtMs(a)}  status=${prev.first?.status}`);
    // eslint-disable-next-line no-console
    console.log(`now   2nd(${new Date().toISOString()})=${fmtMs(b)}  status=${m.status}`);
    // eslint-disable-next-line no-console
    console.log(
      `2nd-1st=${fmtMs(delta)}${pct == null || !Number.isFinite(pct) ? '' : `  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}`
    );

    if (delta < 0) {
      // eslint-disable-next-line no-console
      console.log('해석: 2번째(지금)가 더 빠름(캐시/웜업/연결재사용/DNS 캐시 등 가능)');
    } else if (delta > 0) {
      // eslint-disable-next-line no-console
      console.log('해석: 2번째(지금)가 더 느림(부하/환경 변동 등 가능)');
    } else {
      // eslint-disable-next-line no-console
      console.log('해석: 거의 동일');
    }

    return;
  }

  const times = [];
  let lastStatus = null;
  let lastContentLength = null;

  // eslint-disable-next-line no-console
  console.log(`[http-timing-compare] ${method} x${n}\n${url}\n`);

  for (let i = 1; i <= n; i++) {
    const t0 = performance.now();
    const res = await fetch(url, { method, redirect: 'follow' });
    // GET이면 body를 읽어서(다운로드까지) "왕복"을 끝까지 재는 편이 Postman에 더 가깝습니다.
    if (method === 'GET') {
      const ab = await res.arrayBuffer();
      lastContentLength = ab.byteLength;
    } else {
      // HEAD: body 없음
      lastContentLength = null;
    }
    const t1 = performance.now();

    const total = t1 - t0;
    times.push(total);
    lastStatus = res.status;

    // eslint-disable-next-line no-console
    console.log(
      `${String(i).padStart(2, '0')}/${n}  status=${res.status}  total=${fmtMs(total)}${
        method === 'GET' && lastContentLength != null ? `  body=${lastContentLength}B` : ''
      }`
    );
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  const p95 = percentile(sorted, 95);

  // eslint-disable-next-line no-console
  console.log('\n== summary ==');
  // eslint-disable-next-line no-console
  console.log(`status(last)=${lastStatus}`);
  // eslint-disable-next-line no-console
  console.log(`min=${fmtMs(sorted[0])}  max=${fmtMs(sorted[sorted.length - 1])}  avg=${fmtMs(avg)}  p95=${fmtMs(p95)}`);

  if (times.length >= 2) {
    const a = times[0];
    const b = times[1];
    const delta = b - a; // 2nd - 1st
    const pct = a > 0 ? (delta / a) * 100 : null; // 2nd가 1st 대비 % 변화(음수면 단축)

    // eslint-disable-next-line no-console
    console.log('\n== 1st vs 2nd (Postman에서 자주 보는 "두 번째는 빨라졌나?") ==');
    // eslint-disable-next-line no-console
    console.log(`1st=${fmtMs(a)}`);
    // eslint-disable-next-line no-console
    console.log(`2nd=${fmtMs(b)}`);
    // eslint-disable-next-line no-console
    console.log(
      `2nd-1st=${fmtMs(delta)}${
        pct == null || !Number.isFinite(pct) ? '' : `  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% )`
      }`
    );
    if (delta < 0) {
      // eslint-disable-next-line no-console
      console.log('해석: 2번째가 더 빠름(캐시/웜업/연결재사용/DNS 캐시 등 가능)');
    } else if (delta > 0) {
      // eslint-disable-next-line no-console
      console.log('해석: 2번째가 더 느림(서버/프록시/클라이언트 변동, GC 등 가능)');
    } else {
      // eslint-disable-next-line no-console
      console.log('해석: 거의 동일');
    }
  }
}

async function main() {
  await runFromArgv(process.argv.slice(2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', e);
  process.exit(1);
});
