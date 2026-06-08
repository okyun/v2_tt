import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * 상품 목록 API를 "정확히 1번만" 호출해서 응답시간을 측정합니다.
 *
 * 기본 실행은 shared-iterations: vus=1, iterations=1 이라서 요청은 1회만 나갑니다.
 *
 * 예)
 * - 로컬:
 *   k6 run -e BASE_URL=http://localhost:8080 product-list-once-bench.js
 * - docker k6:
 *   docker exec talktrip-k6 k6 run -e BASE_URL=http://talktrip-app:8080 /scripts/product-list-once-bench.js
 *
 * (참고) TPS는 iterations=1이면 의미가 거의 없고, 이번 스크립트는 "1-shot latency" 용도입니다.
 */

const mReqMs = new Trend('bench_product_list_once_ms', true);
const mOk = new Rate('bench_product_list_once_ok');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// CommerceList.getProductList()와 동일한 쿼리 생성 규칙
const PAGE = String(__ENV.PAGE || 0);
const SIZE = String(__ENV.SIZE || 9);
const KEYWORD = __ENV.KEYWORD != null ? String(__ENV.KEYWORD) : '';
const COUNTRY = __ENV.COUNTRY != null ? String(__ENV.COUNTRY) : '전체';
const SORT_FIELD = String(__ENV.SORT_FIELD || 'updatedAt');
const SORT_ORDER = String(__ENV.SORT_ORDER || 'desc');
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
  const h = { Accept: 'application/json' };
  if (AUTH) h.Authorization = AUTH;
  return h;
}

export const options = {
  scenarios: {
    once: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'min', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = `${BASE_URL}${buildProductListPath()}`;
  const res = http.get(url, {
    tags: { name: 'GET /api/products (once)' },
    headers: headers(),
  });

  const ok = check(res, { 'status 200': (r) => r.status === 200 });
  mOk.add(ok);

  if (res && res.timings && res.timings.duration != null) {
    mReqMs.add(res.timings.duration);
  }
}

export function handleSummary(data) {
  const d = data?.metrics?.bench_product_list_once_ms?.values;
  const ok = data?.metrics?.bench_product_list_once_ok?.values?.rate;
  return {
    stdout:
      '\n' +
      `[once] BASE_URL=${BASE_URL}\n` +
      `GET ${buildProductListPath()}\n` +
      `okRate=${ok}\n` +
      `client timings.duration: avg=${d?.avg ?? 'n/a'}ms p95=${d?.['p(95)'] ?? 'n/a'}ms min=${d?.min ?? 'n/a'}ms max=${d?.max ?? 'n/a'}ms\n` +
      '\n',
  };
}
