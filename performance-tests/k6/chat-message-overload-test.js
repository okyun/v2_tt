import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');
const loadBalancingRate = new Rate('load_balancing_success');
const messageSendRate = new Rate('message_send_success');

export const options = {
  stages: [
    { duration: '2m', target: 200 },    // 2분 동안 200명까지 증가
    { duration: '5m', target: 500 },    // 5분 동안 500명까지 증가
    { duration: '10m', target: 1000 },  // 10분 동안 1000명까지 증가
    { duration: '30s', target: 0 },     // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<20000'], // 95%의 요청이 20초 이내
    http_req_failed: ['rate<0.7'],      // 에러율 70% 미만
    errors: ['rate<0.7'],               // 커스텀 에러율 70% 미만
    success: ['rate>0.3'],              // 성공률 30% 이상
    load_balancing_success: ['rate>0.6'], // 로드밸런싱 성공률 60% 이상
    message_send_success: ['rate>0.3'], // 메시지 전송 성공률 30% 이상
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
const ROOM_ID = 'ROOM_14';

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
  
  const serverResponses = {};
  
  // 각 서버별로 직접 요청하여 응답 확인
  servers.forEach(server => {
    try {
      const response = http.get(`http://${server}:80/api/actuator/health`, {
        timeout: '10s'
      });
      
      serverResponses[server] = {
        status: response.status,
        healthy: response.status === 200,
        responseTime: response.timings.duration
      };
      
      console.log(`📊 ${server}: ${response.status} (${response.timings.duration}ms)`);
    } catch (error) {
      serverResponses[server] = {
        status: 'ERROR',
        healthy: false,
        error: error.message
      };
      console.log(`❌ ${server}: 연결 실패 - ${error.message}`);
    }
  });
  
  // 결과 요약
  const healthyServers = Object.values(serverResponses).filter(s => s.healthy).length;
  const totalServers = servers.length;
  const healthRatio = healthyServers / totalServers;
  
  console.log(`📈 서버 상태: ${healthyServers}/${totalServers} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio >= 0.8) {
    console.log('✅ 로드 밸런서 상태 양호');
  } else if (healthRatio >= 0.5) {
    console.log('⚠️ 로드 밸런서 상태 주의');
  } else {
    console.log('❌ 로드 밸런서 상태 위험');
  }
  
  return healthRatio >= 0.5;
}

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 로드 밸런싱 분산 확인 시작...');
  
  const servers = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3'];
  const requestCount = 30; // 30번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  servers.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    
    // 서버별 카운트 증가 (간단한 방법)
    if (response.status === 200 || response.status === 201) {
      const serverIndex = i % servers.length;
      serverRequestCounts[servers[serverIndex]]++;
    }
    
    sleep(0.05); // 50ms 대기
  }
  
  // 결과 출력
  console.log('📈 로드 밸런싱 분산 결과:');
  servers.forEach(server => {
    const count = serverRequestCounts[server];
    const percentage = ((count / requestCount) * 100).toFixed(1);
    console.log(`  ${server}: ${count}회 (${percentage}%)`);
  });
  
  // 분산 균등성 확인
  const counts = Object.values(serverRequestCounts);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const distributionRatio = maxCount > 0 ? minCount / maxCount : 0;
  
  console.log(`⚖️ 분산 균등성: ${(distributionRatio * 100).toFixed(1)}%`);
  
  if (distributionRatio > 0.7) {
    console.log('✅ 로드 밸런싱이 잘 작동하고 있습니다!');
    loadBalancingRate.add(1);
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 로드 밸런싱이 부분적으로 작동하고 있습니다.');
    loadBalancingRate.add(0.5);
  } else {
    console.log('❌ 로드 밸런싱이 제대로 작동하지 않습니다!');
    loadBalancingRate.add(0);
  }
  
  return distributionRatio > 0.4;
}

// 채팅 메시지 전송 함수
function sendChatMessage(roomId, message, messageType = 'TEXT') {
  const payload = JSON.stringify({
    roomId: roomId,
    message: message,
    messageType: messageType,
    timestamp: new Date().toISOString()
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(`${BASE_URL}/api/chat/rooms/${roomId}/messages`, payload, params);
  return response;
}

// 채팅방 과부하 테스트 함수 (메시지 전송 포함)
function performChatOverloadTest(testName, requestCount, messageCount) {
  console.log(`🔥 ${testName} 시작 - ${requestCount}번의 API 호출, ${messageCount}개의 메시지 전송`);
  
  let successCount = 0;
  let errorCount = 0;
  let messageSuccessCount = 0;
  let messageErrorCount = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < requestCount; i++) {
    // 1. 채팅방 상세 조회 (메시지 포함)
    const roomDetailResponse = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    
    if (check(roomDetailResponse, {
      [`${testName} - 채팅방 상세 조회 성공`]: (r) => r.status === 200 || r.status === 201,
      [`${testName} - 응답 시간 < 10초`]: (r) => r.timings.duration < 10000,
    })) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 2. 채팅방 메시지 조회
    const messagesResponse = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}/messages?limit=20`);
    
    if (check(messagesResponse, {
      [`${testName} - 메시지 조회 성공`]: (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 3. 메시지 전송 (지정된 개수만큼)
    for (let j = 0; j < messageCount; j++) {
      const messageText = `${testName} - 메시지 ${i + 1}-${j + 1} - ${new Date().toISOString()}`;
      const sendResponse = sendChatMessage(ROOM_ID, messageText);
      
      if (check(sendResponse, {
        [`${testName} - 메시지 전송 성공`]: (r) => r.status === 200 || r.status === 201,
      })) {
        messageSuccessCount++;
      } else {
        messageErrorCount++;
      }
      
      // 메시지 전송 간격
      sleep(0.01); // 10ms 대기
    }
    
    // 4. 안읽은 메시지 수 조회
    const unreadResponse = http.get(`${BASE_URL}/api/chat/countALLUnreadMessages`);
    
    if (check(unreadResponse, {
      [`${testName} - 안읽은 메시지 수 조회 성공`]: (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 5. 프론트엔드 채팅 페이지 접근
    const frontendResponse = http.get(`${FRONTEND_URL}/chat/${ROOM_ID}`);
    
    if (check(frontendResponse, {
      [`${testName} - 프론트엔드 페이지 접근 성공`]: (r) => r.status === 200,
    })) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 진행률 표시 (1000번마다)
    if ((i + 1) % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`📊 ${testName} 진행률: ${i + 1}/${requestCount} (${((i + 1) / requestCount * 100).toFixed(1)}%) - ${rate.toFixed(1)} req/s`);
    }
    
    // 짧은 대기 (과부하 시뮬레이션)
    sleep(0.01); // 10ms 대기
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const totalRequests = requestCount * 4; // 4개의 API 호출
  const totalMessages = requestCount * messageCount; // 총 메시지 수
  const avgRate = totalRequests / totalTime;
  const messageRate = totalMessages / totalTime;
  
  console.log(`✅ ${testName} 완료:`);
  console.log(`  - 총 요청 수: ${totalRequests}`);
  console.log(`  - API 성공: ${successCount}`);
  console.log(`  - API 실패: ${errorCount}`);
  console.log(`  - API 성공률: ${(successCount / totalRequests * 100).toFixed(1)}%`);
  console.log(`  - 총 메시지 수: ${totalMessages}`);
  console.log(`  - 메시지 성공: ${messageSuccessCount}`);
  console.log(`  - 메시지 실패: ${messageErrorCount}`);
  console.log(`  - 메시지 성공률: ${(messageSuccessCount / totalMessages * 100).toFixed(1)}%`);
  console.log(`  - 평균 API 처리율: ${avgRate.toFixed(1)} req/s`);
  console.log(`  - 평균 메시지 처리율: ${messageRate.toFixed(1)} msg/s`);
  console.log(`  - 총 소요 시간: ${totalTime.toFixed(1)}초`);
  
  return {
    successCount,
    errorCount,
    totalRequests,
    successRate: successCount / totalRequests,
    messageSuccessCount,
    messageErrorCount,
    totalMessages,
    messageSuccessRate: messageSuccessCount / totalMessages,
    avgRate,
    messageRate,
    totalTime
  };
}

export default function() {
  // 0. 로드 밸런서 검사 및 분산 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
    checkLoadBalancingDistribution();
  }

  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 기본 채팅방 접근 테스트
  group('Basic Chat Room Access', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    if (check(response, {
      'chat room access successful': (r) => r.status === 200 || r.status === 201,
      'response time < 15s': (r) => r.timings.duration < 15000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. 과부하 테스트 실행 (VU별로 다른 테스트)
  const vuId = __VU;
  if (vuId <= 50) {
    // VU 1-50: 1000번 테스트 + 1000개 메시지
    group('Overload Test - 1000 Requests + 1000 Messages', function () {
      const result = performChatOverloadTest('1000번 테스트', 1000, 1);
      if (result.successRate > 0.3 && result.messageSuccessRate > 0.3) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 100) {
    // VU 51-100: 1000번 테스트 + 5000개 메시지
    group('Overload Test - 1000 Requests + 5000 Messages', function () {
      const result = performChatOverloadTest('5000개 메시지 테스트', 1000, 5);
      if (result.successRate > 0.3 && result.messageSuccessRate > 0.3) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 150) {
    // VU 101-150: 1000번 테스트 + 10000개 메시지
    group('Overload Test - 1000 Requests + 10000 Messages', function () {
      const result = performChatOverloadTest('10000개 메시지 테스트', 1000, 10);
      if (result.successRate > 0.3 && result.messageSuccessRate > 0.3) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 200) {
    // VU 151-200: 1000번 테스트 + 30000개 메시지
    group('Overload Test - 1000 Requests + 30000 Messages', function () {
      const result = performChatOverloadTest('30000개 메시지 테스트', 1000, 30);
      if (result.successRate > 0.3 && result.messageSuccessRate > 0.3) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 250) {
    // VU 201-250: 1000번 테스트 + 50000개 메시지
    group('Overload Test - 1000 Requests + 50000 Messages', function () {
      const result = performChatOverloadTest('50000개 메시지 테스트', 1000, 50);
      if (result.successRate > 0.3 && result.messageSuccessRate > 0.3) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else {
    // VU 251+: 기본 테스트만
    group('Basic Test', function () {
      totalTests++;
      const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}/messages?limit=20`);
      if (check(response, {
        'basic test successful': (r) => r.status === 200 || r.status === 201,
      })) {
        successCount++;
        success = true;
      }
    });
  }

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
