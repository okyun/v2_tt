import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// 로컬(Windows) 기본: http://localhost:8090
// 필요 시: PowerShell에서 $env:BASE_URL="http://localhost:8090"
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8090';
let testToken = null;

const roomsRdb = new Trend('rooms_rdb');
const roomsRedis = new Trend('rooms_redis');

export const options = {
  vus: 10,
  duration: '30s',
};

// JWT 토큰을 받는 함수
function getTestToken() {
  console.log('🔑 테스트용 JWT 토큰 요청 중...');
  
  const response = http.get(`${BASE_URL}/api/member/test-token`);
  
  if (check(response, {
    '토큰 요청 성공': (r) => r.status === 200,
  })) {
    const data = response.json();
    console.log('✅ JWT 토큰 생성 성공');
    return data.accessToken;
  } else {
    console.log('❌ JWT 토큰 생성 실패');
    return null;
  }
}

export default function() {
  // 첫 번째 VU에서만 토큰을 받아옴
  if (__VU === 1 && !testToken) {
    testToken = getTestToken();
  }
  
  // 토큰이 없으면 대기
  if (!testToken) {
    sleep(1);
    return;
  }

  const headers = {
    'Authorization': `Bearer ${testToken}`,
    'Content-Type': 'application/json'
  };

  // 1) 내 채팅방 목록 조회: RDB vs Redis(overlay)
  group('내 채팅방 목록 조회 - RDB', function () {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=50`, { headers, tags: { source: 'rdb' } });
    roomsRdb.add(response.timings.duration);
    check(response, {
      '채팅방 목록 조회 성공': (r) => r.status === 200,
    });
  });

  group('내 채팅방 목록 조회 - Redis(overlay)', function () {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/redis?limit=50`, { headers, tags: { source: 'redis' } });
    roomsRedis.add(response.timings.duration);
    check(response, {
      '채팅방 목록 조회 성공': (r) => r.status === 200,
    });
  });

  sleep(0.3);

  sleep(1);
}
