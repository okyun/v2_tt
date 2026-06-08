/**
 * DAU — POST /api/me/dau/visit/bitmap | /api/me/dau/visit/set 부하·스모크 (VISIT_PATH로 선택)
 *
 * 사전 준비
 * - back_end 기동 (기본 http://localhost:8080)
 * - 유효한 JWT 필요 (회원 DB에 존재하는 이메일 클레임)
 *
 * 실행 예시
 *   cd tt/performance-tests/k6
 *
 *   # 스모크 (1회)
 *   k6 run -e BASE_URL=http://localhost:8080 -e JWT="<access_token>" -e SMOKE=1 dau-visit.js
 *
 *   # 부하 (VU·기간 조절)
 *   k6 run -e BASE_URL=http://localhost:8080 -e JWT="<access_token>" -e VUS=50 -e DURATION=1m dau-visit.js
 *
 *   # Set만 칠 때 (용량 비교)
 *   k6 run -e BASE_URL=http://localhost:8080 -e JWT="<token>" -e VISIT_PATH=/api/me/dau/visit/set -e SMOKE=1 dau-visit.js
 *
 *   # 여러 계정으로 서로 다른 비트 오프셋 시뮬레이션 (JSON 배열)
 *   k6 run -e BASE_URL=http://localhost:8080 -e TOKENS_FILE=./dau-test-tokens.json -e VUS=20 -e DURATION=30s dau-visit.js
 *
 *   # (옵션) 레거시 스크립트와 같이 /api/member/test-token 이 열려 있으면 JWT 생략 가능
 *   k6 run -e BASE_URL=http://localhost:8080 dau-visit.js
 *
 * 검증
 * - k6: http 204 비율·에러율
 * - Redis: BITCOUNT talktrip:dau:bitmap:YYYYMMDD (문서 DOC/DAU_BITMAP.md 참고)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const dauVisitFail = new Rate('dau_visit_fail');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
/** 기본 비트맵. Set만 치려면 -e VISIT_PATH=/api/me/dau/visit/set */
const VISIT_PATH = __ENV.VISIT_PATH || '/api/me/dau/visit/bitmap';
const SMOKE = __ENV.SMOKE === '1' || __ENV.SMOKE === 'true';

const sharedTokens = __ENV.TOKENS_FILE
  ? new SharedArray('dau_jwt_tokens', function () {
      const raw = open(__ENV.TOKENS_FILE);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('TOKENS_FILE must be a non-empty JSON array of JWT strings');
      }
      return parsed;
    })
  : null;

export const options = SMOKE
  ? {
      vus: 1,
      iterations: 1,
      thresholds: {
        http_req_failed: ['rate<0.01'],
        dau_visit_fail: ['rate<0.01'],
      },
    }
  : {
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '30s',
      thresholds: {
        http_req_failed: ['rate<0.05'],
        dau_visit_fail: ['rate<0.05'],
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
      'JWT 없음: -e JWT=... 또는 -e TOKENS_FILE=./tokens.json 을 주거나, /api/member/test-token(200)을 노출하세요. ' +
        `마지막 응답 status=${res.status} body=${String(res.body).slice(0, 120)}`
    );
  }
  let body;
  try {
    body = res.json();
  } catch (e) {
    throw new Error('test-token 응답 JSON 파싱 실패');
  }
  if (!body.accessToken) {
    throw new Error('test-token JSON에 accessToken 필드가 없습니다');
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
    tags: { name: 'DAUVisit' },
  });

  const ok = check(res, {
    'status is 204': (r) => r.status === 204,
  });
  dauVisitFail.add(!ok);

  sleep(Number(__ENV.SLEEP_SEC || 0.05));
}
