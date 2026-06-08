import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * 상품 목록 조회 TPS 측정 (COLD: 캐시 미스 유도)
 *
 * 목적
 * - Redis/Spring Cache에 "없는 키"로 계속 조회해서(DB 조회 + 캐시 저장 경로) TPS 측정
 *
 * 동작 방식
 * - ProductSearchCacheService의 캐시 키는 keyword/country/page/size/sort에 의해 결정됨
 * - 매 요청마다 keyword를 바꿔서 cache key를 매번 새로 만들면 "항상 캐시 미스"가 됨
 *
 * 실행 예시 (docker-compose의 k6 컨테이너 기준)
 * - docker exec talktrip-k6 k6 run /scripts/product-list-cold-cache-tps.js
 *
 * 커스텀
 * - BASE_URL: 기본 http://nginx
 * - VUS / DURATION: 환경 변수로 조절 가능
 */

const BASE_URL = __ENV.BASE_URL || 'http://nginx';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '2m';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'min', 'max'],
};

function randomKeyword() {
  // 캐시 키 충돌 최소화를 위해 Iter/VU 기반 + 시간 조합
  return `k6-${__VU}-${__ITER}-${Date.now()}`;
}

export default function () {
  const keyword = randomKeyword();

  const url =
    `${BASE_URL}/api/products` +
    `?keyword=${encodeURIComponent(keyword)}` +
    `&countryName=${encodeURIComponent('전체')}` +
    `&page=0&size=10&sort=updatedAt,desc`;

  const res = http.get(url, { tags: { name: 'GET /api/products (cold)' } });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // 너무 빡세게만 때리면 앱/DB가 병목일 때 왜곡될 수 있어 아주 짧은 think time 옵션 제공
  const thinkMs = Number(__ENV.THINK_MS || 0);
  if (thinkMs > 0) sleep(thinkMs / 1000);
}

export function handleSummary(data) {
  const tps = data?.metrics?.http_reqs?.values?.rate;
  const out = {
    mode: 'cold-cache-miss',
    baseUrl: BASE_URL,
    vus: VUS,
    duration: DURATION,
    tps: tps ?? null,
    metrics: {
      http_reqs: data.metrics.http_reqs,
      http_req_duration: data.metrics.http_req_duration,
      http_req_failed: data.metrics.http_req_failed,
    },
  };

  // stdout 요약 + json 파일 저장(원하면 비교용으로 diff 가능)
  return {
    stdout: `\n[product-list][COLD] TPS(http_reqs/s) = ${tps}\n`,
    'product-list-cold-summary.json': JSON.stringify(out, null, 2),
  };
}

