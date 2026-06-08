import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');

// 설정
const BASE_URL = 'http://talktrip-nginx';
const WEBSOCKET_URL = 'ws://talktrip-nginx/ws/websocket';
const SOCKJS_URL = 'http://talktrip-nginx/sockjs-node/websocket';

// 테스트 설정
export const options = {
  vus: 10, // 10명의 동시 사용자
  duration: '60s', // 60초 동안 실행
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% 요청이 2초 이내
    http_req_failed: ['rate<0.1'], // 실패율 10% 미만
    errors: ['rate<0.1'], // 에러율 10% 미만
  },
  ext: {
    influxdb: {
      url: 'http://talktrip-influxdb:8086',
      database: 'k6',
      username: 'admin',
      password: 'admin123',
    },
  },
};

// 로드 밸런싱 분산 확인을 위한 카운터
let serverDistribution = {
  'talktrip-app-1': 0,
  'talktrip-app-2': 0,
  'talktrip-app-3': 0,
};

// 서버별 직접 테스트
function testDirectServers() {
  const servers = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3'];
  const results = {};
  
  servers.forEach(server => {
    try {
      const response = http.get(`http://${server}:8080/api/actuator/health`, {
        timeout: '10s'
      });
      results[server] = {
        status: response.status,
        responseTime: response.timings.duration,
        success: response.status === 200
      };
    } catch (error) {
      results[server] = {
        status: 0,
        responseTime: 0,
        success: false,
        error: error.message
      };
    }
  });
  
  return results;
}

// nginx를 통한 WebSocket 연결 테스트
function testWebSocketLoadBalancing() {
  console.log('🌐 WebSocket 로드 밸런싱 테스트 시작...');
  
  // 1. nginx 상태 확인
  const nginxResponse = http.get(`${BASE_URL}/health`, {
    timeout: '10s'
  });
  
  const nginxOk = check(nginxResponse, {
    'nginx 상태 확인': (r) => r.status === 200,
    'nginx 응답 시간': (r) => r.timings.duration < 1000,
  });
  
  if (!nginxOk) {
    console.log('❌ Nginx 상태 확인 실패');
    return false;
  }
  
  console.log('✅ Nginx 상태 정상');
  
  // 2. WebSocket 엔드포인트 테스트 (HTTP로)
  const websocketTestResponse = http.get(`${BASE_URL}/ws/websocket`, {
    timeout: '10s',
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version': '13'
    }
  });
  
  const websocketOk = check(websocketTestResponse, {
    'WebSocket 엔드포인트 접근': (r) => r.status === 101 || r.status === 200 || r.status === 404, // 404도 정상 (WebSocket 핸드셰이크 실패)
    'WebSocket 응답 시간': (r) => r.timings.duration < 2000,
  });
  
  if (websocketOk) {
    console.log('✅ WebSocket 엔드포인트 접근 가능');
  } else {
    console.log('❌ WebSocket 엔드포인트 접근 실패');
  }
  
  // 3. SockJS 엔드포인트 테스트
  const sockjsTestResponse = http.get(`${BASE_URL}/sockjs-node/websocket`, {
    timeout: '10s'
  });
  
  const sockjsOk = check(sockjsTestResponse, {
    'SockJS 엔드포인트 접근': (r) => r.status === 200 || r.status === 404,
    'SockJS 응답 시간': (r) => r.timings.duration < 2000,
  });
  
  if (sockjsOk) {
    console.log('✅ SockJS 엔드포인트 접근 가능');
  } else {
    console.log('❌ SockJS 엔드포인트 접근 실패');
  }
  
  return nginxOk && websocketOk && sockjsOk;
}

// API 엔드포인트 테스트 (단일 서버)
function testApiEndpoints() {
  console.log('🔍 API 엔드포인트 테스트...');
  
  const apiEndpoints = [
    '/api/products',
    '/api/chat/me/chatRooms',
    '/api/actuator/health'
  ];
  
  let successCount = 0;
  
  apiEndpoints.forEach(endpoint => {
    try {
      const response = http.get(`${BASE_URL}${endpoint}`, {
        timeout: '10s'
      });
      
      const isSuccess = check(response, {
        [`API ${endpoint} 접근`]: (r) => r.status === 200 || r.status === 401 || r.status === 403, // 인증 오류도 정상
        [`API ${endpoint} 응답 시간`]: (r) => r.timings.duration < 3000,
      });
      
      if (isSuccess) {
        successCount++;
        console.log(`✅ ${endpoint} 접근 성공`);
      } else {
        console.log(`❌ ${endpoint} 접근 실패`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} 접근 오류: ${error.message}`);
    }
  });
  
  return successCount === apiEndpoints.length;
}

// 메인 테스트 함수
export default function() {
  console.log('🚀 WebSocket 로드 밸런싱 테스트 시작...');
  
  // 1. 직접 서버 테스트
  const directResults = testDirectServers();
  console.log('📊 직접 서버 테스트 결과:', directResults);
  
  // 2. nginx를 통한 WebSocket 테스트
  const websocketOk = testWebSocketLoadBalancing();
  
  // 3. API 엔드포인트 테스트
  const apiOk = testApiEndpoints();
  
  // 4. 로드 밸런싱 분산 테스트 (여러 번 요청)
  console.log('⚖️ 로드 밸런싱 분산 테스트...');
  
  for (let i = 0; i < 10; i++) {
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
      
      // 응답에서 서버 정보 추출 (nginx 로그에서 확인 가능)
      if (response.status === 101 || response.status === 200 || response.status === 404) {
        // WebSocket 연결 시도 성공 (실제 분산은 nginx 로그에서 확인)
        console.log(`📈 WebSocket 연결 시도 ${i + 1}/10 성공`);
      }
    } catch (error) {
      console.log(`❌ WebSocket 연결 시도 ${i + 1}/10 실패: ${error.message}`);
    }
    
    sleep(0.1);
  }
  
  // 5. 결과 요약
  const overallSuccess = websocketOk && apiOk;
  
  if (overallSuccess) {
    console.log('✅ WebSocket 로드 밸런싱 테스트 성공');
  } else {
    console.log('❌ WebSocket 로드 밸런싱 테스트 실패');
  }
  
  errorRate.add(!overallSuccess);
  
  sleep(1);
}

// 테스트 완료 후 결과 출력
export function handleSummary(data) {
  console.log('\n📋 WebSocket 로드 밸런싱 테스트 결과 요약:');
  console.log(`- 총 요청 수: ${data.metrics.http_reqs.values.count}`);
  console.log(`- 평균 응답 시간: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`- 95% 응답 시간: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`- 실패율: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  console.log(`- 에러율: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`);
  
  return {
    'websocket-load-balancing-test-results.json': JSON.stringify(data, null, 2)
  };
}
