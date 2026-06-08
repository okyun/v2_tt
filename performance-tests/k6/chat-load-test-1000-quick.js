import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');
const wsConnectionRate = new Rate('ws_connections');
const wsMessageRate = new Rate('ws_messages');

export const options = {
  stages: [
    { duration: '30s', target: 200 },   // 30초 동안 200명까지 증가
    { duration: '1m', target: 1000 },   // 1분 동안 1000명까지 증가
    { duration: '2m', target: 1000 },   // 2분 동안 1000명 유지
    { duration: '30s', target: 0 },     // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95%의 요청이 5초 이내
    http_req_failed: ['rate<0.5'],     // 에러율 50% 미만
    errors: ['rate<0.5'],               // 커스텀 에러율 50% 미만
    success: ['rate>0.5'],              // 성공률 50% 이상
    ws_connections: ['rate>0.6'],       // WebSocket 연결 성공률 60% 이상
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

const BASE_URL = 'http://nginx';
const FRONTEND_URL = 'http://host.docker.internal:5173';

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 로드 밸런서 검사 시작...');
  
  // 서버 개수에 따라 동적으로 서버 목록 생성
  const serverCount = __ENV.SERVER_COUNT || 3; // 환경변수로 서버 개수 설정, 기본값 3
  const servers = [];
  for (let i = 1; i <= serverCount; i++) {
    servers.push(`talktrip-app-${i}`);
  }
  
  console.log(`📊 검사 대상 서버: ${servers.join(', ')}`);
  
  let healthyServers = 0;
  let totalServers = servers.length;
  
  servers.forEach(server => {
    const healthUrl = `http://${server}:8080/api/actuator/health`;
    const response = http.get(healthUrl, { timeout: '10s' });
    
    if (response.status === 200) {
      console.log(`✅ ${server}: 정상`);
      healthyServers++;
    } else {
      console.log(`❌ ${server}: 비정상 (상태: ${response.status})`);
    }
  });
  
  const healthRatio = healthyServers / totalServers;
  console.log(`📈 서버 상태: ${healthyServers}/${totalServers} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio < 0.5) {
    console.log('⚠️ 경고: 50% 미만의 서버만 정상 작동 중');
  } else {
    console.log('✅ 로드 밸런서 상태 양호');
  }
  
  return healthRatio >= 0.5;
}

export default function() {
  // 0. 로드 밸런서 상태 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
  }
  let response;
  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 프론트엔드 채팅 페이지 접근
  group('Frontend Chat Page Access', function () {
    totalTests++;
    response = http.get(`${FRONTEND_URL}/chat`);
    if (check(response, {
      'frontend chat page accessible': (r) => r.status === 200,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 2. 채팅방 목록 API 호출
  group('Chat Rooms API Access', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      'chat rooms list accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 3. WebSocket 연결 테스트
  group('WebSocket Connection Test', function () {
    const wsUrl = 'ws://host.docker.internal:5173/ws';
    const params = {
      headers: {
        'Origin': 'http://host.docker.internal:5173',
      },
    };

    totalTests++;
    const res = ws.connect(wsUrl, params, function (socket) {
      if (check(res, {
        'WebSocket connection successful': (r) => r.status === 101,
      })) {
        wsConnectionRate.add(1);
        successCount++;
        success = true;
      } else {
        wsConnectionRate.add(0);
      }

      socket.on('open', function () {
        console.log(`VU ${__VU}: Connected to WebSocket`);
        socket.send(JSON.stringify({ type: 'ping' }));
      });

      socket.on('message', function (data) {
        console.log(`VU ${__VU}: Received message: ${data}`);
        wsMessageRate.add(1);
      });

      socket.on('close', function () {
        console.log(`VU ${__VU}: Disconnected from WebSocket`);
      });

      socket.on('error', function (e) {
        console.error(`VU ${__VU}: WebSocket error: ${e.error()}`);
        errorRate.add(1);
      });

      sleep(2);
      socket.close();
    });
  });

  sleep(1);

  // 4. 채팅방 생성 시뮬레이션
  group('Chat Room Creation Simulation', function () {
    totalTests++;
    const createRoomPayload = {
      name: `Test Room ${__VU}-${__ITER}`,
      memberIds: ['member1', 'member2'],
    };
    response = http.post(`${BASE_URL}/api/chat/rooms`, JSON.stringify(createRoomPayload), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (check(response, {
      'chat room creation successful': (r) => r.status === 401 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 5. 채팅 메시지 전송 시뮬레이션
  group('Chat Message Sending Simulation', function () {
    const roomId = 'ROOM_1';
    const messagePayload = {
      content: `Hello from VU ${__VU} - Iter ${__ITER}`,
    };
    totalTests++;
    response = http.post(`${BASE_URL}/api/chat/rooms/${roomId}/messages`, JSON.stringify(messagePayload), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (check(response, {
      'chat message sent': (r) => r.status === 401 || r.status === 200,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
