/**
 * DAU — 피크 VU 기본 100명 스테이지 부하 (/visit/bitmap | /visit/set 는 VISIT_PATH로 선택)
 *
 * - 램프업 → 유지 → 램프다운 구간으로 Redis·앱 부하와 HTTP 204 비율을 봅니다.
 * - 여러 계정을 쓰려면 TOKENS_FILE(JSON JWT 배열). 한 계정만 쓰면 고유 DAU(Set/비트맵)는 1명으로 유지되지만 RPS 부하는 동일하게 올립니다.
 *
 * 토큰 파일 (Docker mysql → talktrip.member, 기본 JWT 시크릿):
 *   cd tt/performance-tests/k6
 *   node gen-dau-tokens-docker.js > dau-100-tokens.json
 *
 * 실행 예시
 *   cd tt/performance-tests/k6
 *
 *   # 비트맵 전용 엔드포인트 (기본 VISIT_PATH)
 *   k6 run -e BASE_URL=http://127.0.0.1:8080 -e TOKENS_FILE=./dau-100-tokens.json dau-visit-100-users.js
 *
 *   # Set 전용 엔드포인트 (용량 비교)
 *   k6 run -e BASE_URL=http://127.0.0.1:8080 -e TOKENS_FILE=./dau-100-tokens.json -e VISIT_PATH=/api/me/dau/visit/set dau-visit-100-users.js
 *
 *   # 단일 JWT
 *   k6 run -e BASE_URL=http://127.0.0.1:8080 -e JWT="<token>" -e VISIT_PATH=/api/me/dau/visit/bitmap dau-visit-100-users.js
 *
 * 스테이지·VU 조절:
 *   -e PEAK_VUS=100 -e RAMP_DURATION=45s -e HOLD_DURATION=3m -e RAMP_DOWN_DURATION=20s -e SLEEP_SEC=0.15
 *
 * 검증 (k6 외 Redis)
 *   BITCOUNT talktrip:dau:bitmap:YYYYMMDD
 *   SCARD   talktrip:dau:set:YYYYMMDD
 *
 * 문서: DOC/DAU_BITMAP.md
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const dauVisitFail = new Rate('dau_visit_fail');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
/** 기본: 비트맵. Set만: -e VISIT_PATH=/api/me/dau/visit/set */
const VISIT_PATH = __ENV.VISIT_PATH || '/api/me/dau/visit/bitmap';
const PEAK_VUS = Number(__ENV.PEAK_VUS || 100);

const sharedTokens = __ENV.TOKENS_FILE
  ? new SharedArray('dau_jwt_tokens_100', function () {
      const raw = open(__ENV.TOKENS_FILE);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('TOKENS_FILE must be a non-empty JSON array of JWT strings');
      }
      return parsed;
    })
  : null;

/** k6 결과/대시보드에서 엔드포인트 구분용 */
const visitTag =
  VISIT_PATH.indexOf('/visit/set') !== -1 ? 'DAUVisit100_set' : 'DAUVisit100_bitmap';

export const options = {
  stages: [
    { duration: __ENV.RAMP_DURATION || '30s', target: PEAK_VUS },
    { duration: __ENV.HOLD_DURATION || '2m', target: PEAK_VUS },
    { duration: __ENV.RAMP_DOWN_DURATION || '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.15'],
    dau_visit_fail: ['rate<0.15'],
    http_req_duration: ['p(95)<5000'],
  },
};

export function setup() {
  if (__ENV.JWT) {
    return { mode: 'single', jwt: __ENV.JWT };
  }
  if (sharedTokens && sharedTokens.length > 0) {
    return { mode: 'multi' };
  }

  const res = http.get(`${BASE_URL}/api/member/test-token`, { tags: { name: 'TestToken' } });
  if (res.status !== 200) {
    throw new Error(
      'JWT 또는 TOKENS_FILE 필요. 예: node gen-dau-tokens-docker.js > dau-100-tokens.json 후 ' +
        '-e TOKENS_FILE=./dau-100-tokens.json. (test-token 응답 ' +
        res.status +
        ')'
    );
  }
  const body = res.json();
  if (!body.accessToken) {
    throw new Error('test-token JSON에 accessToken 없음');
  }
  return { mode: 'single', jwt: body.accessToken };
}

export default function (data) {
  let token;
  if (data.mode === 'multi') {
    token = sharedTokens[(__VU - 1) % sharedTokens.length];
  } else {
    token = data.jwt;
  }

  const res = http.post(`${BASE_URL}${VISIT_PATH}`, null, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    tags: { name: visitTag },
  });

  const ok = check(res, {
    'status is 204': (r) => r.status === 204,
  });
  dauVisitFail.add(!ok);

  sleep(Number(__ENV.SLEEP_SEC || 0.15));
}
