import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * 상품 목록 조회 TPS 측정 (WARM: 캐시 히트 유도)
 *
 * 목적
 * - 동일 파라미터로 반복 조회해서 Redis/Spring Cache 히트 TPS 측정
 *
 * 동작 방식
 * - setup()에서 한 번 호출해 캐시를 "미리 채움(priming)"
 * - 본 테스트는 동일 URL만 호출 → 대부분 캐시 히트(또는 캐시 TTL 동안 히트)
 *
 * 실행 예시 (docker-compose의 k6 컨테이너 기준)
 * - docker exec talktrip-k6 k6 run /scripts/product-list-warm-cache-tps.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://nginx';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '2m';

const PRODUCT_LIST_URL =
  `${BASE_URL}/api/products` +
  `?countryName=${encodeURIComponent('전체')}` +
  `&page=0&size=10&sort=updatedAt,desc`;

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'min', 'max'],
};

export function setup() {
  // 프라이밍: 캐시 채우기
  const primingRes = http.get(PRODUCT_LIST_URL, { tags: { name: 'GET /api/products (prime)' } });
  check(primingRes, { 'priming status is 200': (r) => r.status === 200 });

  // 캐시 write 직후 경쟁을 조금 줄이려면 아주 짧게 대기(옵션)
  const primeSleepMs = Number(__ENV.PRIME_SLEEP_MS || 100);
  if (primeSleepMs > 0) sleep(primeSleepMs / 1000);

  return { url: PRODUCT_LIST_URL };
}

export default function (data) {
  const res = http.get(data.url, { tags: { name: 'GET /api/products (warm)' } });
  check(res, { 'status is 200': (r) => r.status === 200 });

  const thinkMs = Number(__ENV.THINK_MS || 0);
  if (thinkMs > 0) sleep(thinkMs / 1000);
}

export function handleSummary(data) {
  const tps = data?.metrics?.http_reqs?.values?.rate;
  const out = {
    mode: 'warm-cache-hit',
    baseUrl: BASE_URL,
    vus: VUS,
    duration: DURATION,
    url: PRODUCT_LIST_URL,
    tps: tps ?? null,
    metrics: {
      http_reqs: data.metrics.http_reqs,
      http_req_duration: data.metrics.http_req_duration,
      http_req_failed: data.metrics.http_req_failed,
    },
  };

  return {
    stdout: `\n[product-list][WARM] TPS(http_reqs/s) = ${tps}\n`,
    'product-list-warm-summary.json': JSON.stringify(out, null, 2),
  };
}

