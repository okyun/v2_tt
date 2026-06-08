import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * /commerce 첫 진입과 유사한 "상품 목록" API를 연속 3회 호출합니다.
 *
 * 의도(개념)
 * - 1회차: Spring Cache(= Redis) miss → base 목록이 DB에서 만들어짐(그리고 캐시에 저장)
 * - 2회차: 동일 쿼리 → base 목록이 Redis(캐시) hit 가능
 * - 3회차: 동일 쿼리 → 캐시 히트 안정성(노이즈/경쟁 조건) 확인용
 *
 * 주의(중요)
 * - "완전 동일"은 아님: 로그인 JWT가 있으면 2~3회차에도 '좋아요'를 위해 DB를 추가로 볼 수 있습니다.
 *   (그래서 기본은 Authorization 없이(비로그인) 측정하는 걸 권장)
 * - 또한 결과가 "빈 목록"이면 @Cacheable unless 때문에 캐시가 안 남을 수 있어 2~3회차가 기대대로 안 빨라질 수 있습니다.
 *
 * 사용 예
 * - 로컬 백엔드 직접:
 *   k6 run -e BASE_URL=http://localhost:8080 commerce-products-1st-db-2nd-redis.js
 * - docker compose(백엔드 컨테이너명 talktrip-app):
 *   k6 run -e BASE_URL=http://talktrip-app:8080 commerce-products-1st-db-2nd-redis.js
 */

const mFirst = new Trend('bench_commerce_products_1st_ms', true);
const mSecond = new Trend('bench_commerce_products_2nd_ms', true);
const mThird = new Trend('bench_commerce_products_3rd_ms', true);
const mRatio = new Trend('bench_commerce_products_2nd_div_1st', true);
const mRatio31 = new Trend('bench_commerce_products_3rd_div_1st', true);
const mOk = new Rate('bench_commerce_products_checks_ok');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || '1m';
const SLEEP_MS = Number(__ENV.SLEEP_MS || 0);

// /commerce(CommerceList)의 getProductList()와 동일한 쿼리 생성 규칙을 흉내냅니다.
const PAGE = String(__ENV.PAGE || 0);
const SIZE = String(__ENV.SIZE || 9);
const KEYWORD = __ENV.KEYWORD != null ? String(__ENV.KEYWORD) : '';
const COUNTRY = __ENV.COUNTRY != null ? String(__ENV.COUNTRY) : '전체';
const SORT_FIELD = String(__ENV.SORT_FIELD || 'updatedAt');
const SORT_ORDER = String(__ENV.SORT_ORDER || 'desc');

// 필요하면: -e AUTH="Bearer <JWT>"
const AUTH = __ENV.AUTH || '';

function buildProductListPath() {
  const sp = new URLSearchParams();
  sp.append('page', PAGE);
  sp.append('size', SIZE);
  sp.append('keyword', KEYWORD);
  sp.append('sort', SORT_FIELD);
  sp.append('sort', SORT_ORDER);
  if (COUNTRY && COUNTRY !== '전체') {
    sp.append('countryName', COUNTRY);
  }
  return `/api/products?${sp.toString()}`;
}

function headers() {
  const h = { 'Accept': 'application/json' };
  if (AUTH) {
    h.Authorization = AUTH;
  }
  return h;
}

export const options = {
  vus: VUS,
  duration: DURATION,
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'min', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = `${BASE_URL}${buildProductListPath()}`;
  const hdrs = headers();

  const r1 = http.get(url, {
    tags: { name: 'GET /api/products#1 (1st, expect miss)' },
    headers: hdrs,
  });
  const ok1 = check(r1, { '1st: status 200': (r) => r.status === 200 });
  if (r1 && r1.timings && r1.timings.duration != null) {
    mFirst.add(r1.timings.duration);
  }

  if (SLEEP_MS > 0) sleep(SLEEP_MS / 1000);

  const r2 = http.get(url, {
    tags: { name: 'GET /api/products#2 (2nd, expect hit)' },
    headers: hdrs,
  });
  const ok2 = check(r2, { '2nd: status 200': (r) => r.status === 200 });
  if (r2 && r2.timings && r2.timings.duration != null) {
    mSecond.add(r2.timings.duration);
  }

  if (SLEEP_MS > 0) sleep(SLEEP_MS / 1000);

  const r3 = http.get(url, {
    tags: { name: 'GET /api/products#3 (3rd, expect hit stable)' },
    headers: hdrs,
  });
  const ok3 = check(r3, { '3rd: status 200': (r) => r.status === 200 });
  if (r3 && r3.timings && r3.timings.duration != null) {
    mThird.add(r3.timings.duration);
  }

  if (r1 && r2 && r1.timings && r2.timings && r1.timings.duration > 0 && r2.timings.duration != null) {
    mRatio.add(r2.timings.duration / r1.timings.duration);
  }

  if (r1 && r3 && r1.timings && r3.timings && r1.timings.duration > 0 && r3.timings.duration != null) {
    mRatio31.add(r3.timings.duration / r1.timings.duration);
  }

  mOk.add(ok1 && ok2 && ok3);
}

export function handleSummary(data) {
  const tps = data?.metrics?.http_reqs?.values?.rate;
  const okRate = data?.metrics?.bench_commerce_products_checks_ok?.values?.rate;

  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // k6 Trend metric: values usually contains avg/min/med/max/p(90)/p(95)/p(99) depending on options.summaryTrendStats
  const trendAvgP95 = (metricName) => {
    const vals = data?.metrics?.[metricName]?.values;
    if (!vals) return { avg: null, p95: null };
    return {
      avg: n(vals.avg),
      p95: n(vals['p(95)']),
    };
  };

  const a1 = trendAvgP95('bench_commerce_products_1st_ms');
  const a2 = trendAvgP95('bench_commerce_products_2nd_ms');
  const a3 = trendAvgP95('bench_commerce_products_3rd_ms');

  const div = (x, y) => (x != null && y != null && y > 0 ? x / y : null);

  const r21_avg = div(a2.avg, a1.avg);
  const r31_avg = div(a3.avg, a1.avg);
  const r32_avg = div(a3.avg, a2.avg);

  const r21_p95 = div(a2.p95, a1.p95);
  const r31_p95 = div(a3.p95, a1.p95);
  const r32_p95 = div(a3.p95, a2.p95);

  const fmt = (v, digits = 2) => (v == null ? 'n/a' : v.toFixed(digits));
  const fmtMs = (v) => (v == null ? 'n/a' : `${fmt(v, 2)} ms`);
  const fmtRatio = (v) => (v == null ? 'n/a' : `${fmt(v, 3)}x`); // 2nd가 1st 대비 몇 배 빠른지(시간 비율)

  // NOTE: ratio는 "시간(ms) 비"입니다. 0.2x면 1st 대비 2nd가 5배 빠른 셈.
  // stdout 표에서는 읽기 쉽게 "1st_time / nth_time" 배속(처리시간 감소 배수)도 같이 표기합니다.
  const speedup = (rTimeRatio) => (rTimeRatio == null || rTimeRatio <= 0 ? null : 1 / rTimeRatio);

  const lines = [];
  lines.push('');
  lines.push(`[commerce] BASE_URL=${BASE_URL}`);
  lines.push(`query: ${buildProductListPath()}`);
  lines.push(`http_reqs/s (k6) = ${tps}  (참고: 1 VU iter당 /api/products를 3번 치므로, "목록 1회" 기준 대략 TPS ≈ http_reqs/s / 3)`);
  lines.push(`check OK rate: ${okRate}`);
  lines.push('');
  lines.push('== 3-샷 비교(서버 왕복 시간, k6 Trend) ==');
  lines.push(`#1(기대: miss/DB) avg=${fmtMs(a1.avg)}  p95=${fmtMs(a1.p95)}`);
  lines.push(`#2(기대: hit)   avg=${fmtMs(a2.avg)}  p95=${fmtMs(a2.p95)}`);
  lines.push(`#3(기대: hit)   avg=${fmtMs(a3.avg)}  p95=${fmtMs(a3.p95)}`);
  lines.push('');
  lines.push('== 상대 비교(시간 비율: nth / 1st) ==');
  lines.push(`avg:  #2/#1=${fmtRatio(r21_avg)}  #3/#1=${fmtRatio(r31_avg)}  #3/#2=${fmtRatio(r32_avg)}`);
  lines.push(`p95:  #2/#1=${fmtRatio(r21_p95)}  #3/#1=${fmtRatio(r31_p95)}  #3/#2=${fmtRatio(r32_p95)}`);
  lines.push('(해석) 비율이 1.00에 가까울수록 시간이 비슷. 0.20이면 2nd가 1st 대략 5배 빠른 편(처리시간 1/5).');
  lines.push('');
  lines.push('== 체감 "배속"(1st_time / nth_time) ==');
  lines.push(`avg:  #2=${fmtRatio(speedup(r21_avg))}x  #3=${fmtRatio(speedup(r31_avg))}x`);
  lines.push(`p95:  #2=${fmtRatio(speedup(r21_p95))}x  #3=${fmtRatio(speedup(r31_p95))}x`);
  lines.push('');

  return {
    stdout: lines.join('\n') + '\n',
    'commerce-bench-3way-summary.json': JSON.stringify(
      {
        baseUrl: BASE_URL,
        path: buildProductListPath(),
        vus: VUS,
        duration: DURATION,
        sleepMs: SLEEP_MS,
        tps: tps ?? null,
        checkOkRate: okRate ?? null,
        ms: { a1, a2, a3 },
        ratios: {
          avg: { r21: r21_avg, r31: r31_avg, r32: r32_avg },
          p95: { r21: r21_p95, r31: r31_p95, r32: r32_p95 },
        },
      },
      null,
      2
    ),
  };
}
