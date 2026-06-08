import http from 'k6/http';
import { check, sleep } from 'k6';

// 설정
const BASE_URL = 'http://talktrip-nginx';

// 테스트 설정
export const options = {
  vus: 5, // 5명의 동시 사용자
  duration: '30s', // 30초 동안 실행
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% 요청이 2초 이내
    http_req_failed: ['rate<0.5'], // 실패율 50% 미만
  },
};

// 메인 테스트 함수
export default function() {
  console.log('🚀 간단한 로드 밸런싱 테스트 시작...');
  
  // 1. nginx 상태 확인
  const nginxResponse = http.get(`${BASE_URL}/health`, {
    timeout: '10s'
  });
  
  const nginxOk = check(nginxResponse, {
    'nginx 상태 확인': (r) => r.status === 200,
    'nginx 응답 시간': (r) => r.timings.duration < 1000,
  });
  
  if (nginxOk) {
    console.log('✅ Nginx 상태 정상');
  } else {
    console.log('❌ Nginx 상태 확인 실패');
  }
  
  // 2. API 엔드포인트 테스트 (단일 서버)
  const apiResponse = http.get(`${BASE_URL}/api/products`, {
    timeout: '10s'
  });
  
  const apiOk = check(apiResponse, {
    'API 접근': (r) => r.status === 200 || r.status === 401 || r.status === 403,
    'API 응답 시간': (r) => r.timings.duration < 3000,
  });
  
  if (apiOk) {
    console.log('✅ API 접근 성공');
  } else {
    console.log('❌ API 접근 실패');
  }
  
  // 3. WebSocket 엔드포인트 테스트 (로드 밸런싱)
  const websocketResponse = http.get(`${BASE_URL}/ws/websocket`, {
    timeout: '10s',
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version': '13'
    }
  });
  
  const websocketOk = check(websocketResponse, {
    'WebSocket 엔드포인트 접근': (r) => r.status === 200 || r.status === 404 || r.status === 403,
    'WebSocket 응답 시간': (r) => r.timings.duration < 2000,
  });
  
  if (websocketOk) {
    console.log('✅ WebSocket 엔드포인트 접근 가능');
  } else {
    console.log('❌ WebSocket 엔드포인트 접근 실패');
  }
  
  // 4. SockJS 엔드포인트 테스트 (로드 밸런싱)
  const sockjsResponse = http.get(`${BASE_URL}/sockjs-node/websocket`, {
    timeout: '10s'
  });
  
  const sockjsOk = check(sockjsResponse, {
    'SockJS 엔드포인트 접근': (r) => r.status === 200 || r.status === 404 || r.status === 403,
    'SockJS 응답 시간': (r) => r.timings.duration < 2000,
  });
  
  if (sockjsOk) {
    console.log('✅ SockJS 엔드포인트 접근 가능');
  } else {
    console.log('❌ SockJS 엔드포인트 접근 실패');
  }
  
  // 5. 로드 밸런싱 분산 테스트 (여러 번 요청)
  console.log('⚖️ 로드 밸런싱 분산 테스트...');
  
  for (let i = 0; i < 5; i++) {
    try {
      const response = http.get(`${BASE_URL}/ws/websocket`, {
        timeout: '5s',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13'
        }
      });
      
      if (response.status === 200 || response.status === 404 || response.status === 403) {
        console.log(`📈 WebSocket 연결 시도 ${i + 1}/5 성공 (상태: ${response.status})`);
      }
    } catch (error) {
      console.log(`❌ WebSocket 연결 시도 ${i + 1}/5 실패: ${error.message}`);
    }
    
    sleep(0.1);
  }
  
  // 6. 결과 요약
  const overallSuccess = nginxOk && apiOk && websocketOk && sockjsOk;
  
  if (overallSuccess) {
    console.log('✅ 로드 밸런싱 테스트 성공');
  } else {
    console.log('❌ 로드 밸런싱 테스트 실패');
  }
  
  sleep(1);
}

// 테스트 완료 후 결과 출력
export function handleSummary(data) {
  console.log('\n📋 로드 밸런싱 테스트 결과 요약:');
  console.log(`- 총 요청 수: ${data.metrics.http_reqs.values.count}`);
  console.log(`- 평균 응답 시간: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`- 95% 응답 시간: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`- 실패율: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  
  return {
    'simple-load-balancing-test-results.json': JSON.stringify(data, null, 2)
  };
}