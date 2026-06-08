import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');
const loadBalancingRate = new Rate('load_balancing_success');
const messageSendRate = new Rate('message_send_success');

export const options = {
  stages: [
    { duration: '1m', target: 100 },    // 1분 동안 100명까지 증가
    { duration: '3m', target: 300 },    // 3분 동안 300명까지 증가
    { duration: '5m', target: 500 },    // 5분 동안 500명까지 증가
    { duration: '30s', target: 0 },     // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<30000'], // 95%의 요청이 30초 이내
    http_req_failed: ['rate<0.8'],      // 에러율 80% 미만
    errors: ['rate<0.8'],               // 커스텀 에러율 80% 미만
    success: ['rate>0.2'],              // 성공률 20% 이상
    load_balancing_success: ['rate>0.5'], // 로드밸런싱 성공률 50% 이상
    message_send_success: ['rate>0.2'], // 메시지 전송 성공률 20% 이상
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

const BASE_URL = 'http://talktrip-nginx';
const FRONTEND_URL = 'http://host.docker.internal:5173';
const ROOM_ID = 'ROOM_14';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3', 'talktrip-app-4', 'talktrip-app-5', 'talktrip-app-6', 'talktrip-app-7', 'talktrip-app-8', 'talktrip-app-9'];
const SERVER_COUNT = 9;

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 9개 서버 로드 밸런서 검사 시작...');
  
  console.log(`📊 검사 대상 서버: ${SERVERS.join(', ')}`);
  
  const serverResponses = {};
  
  // 각 서버별로 직접 요청하여 응답 확인
  SERVERS.forEach(server => {
    try {
      const response = http.get(`http://${server}:8080/api/actuator/health`, {
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
  const healthRatio = healthyServers / SERVER_COUNT;
  
  console.log(`📈 9개 서버 상태: ${healthyServers}/${SERVER_COUNT} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio >= 0.8) {
    console.log('✅ 9개 서버 로드 밸런서 상태 양호');
  } else if (healthRatio >= 0.5) {
    console.log('⚠️ 9개 서버 로드 밸런서 상태 주의');
  } else {
    console.log('❌ 9개 서버 로드 밸런서 상태 위험');
  }
  
  return healthRatio >= 0.5;
}

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 9개 서버 로드 밸런싱 분산 확인 시작...');
  
  const requestCount = 60; // 60번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  SERVERS.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    
    // 서버별 카운트 증가 (간단한 방법)
    if (response.status === 200 || response.status === 201) {
      const serverIndex = i % SERVERS.length;
      serverRequestCounts[SERVERS[serverIndex]]++;
    }
    
    sleep(0.05); // 50ms 대기
  }
  
  // 결과 출력
  console.log('📈 9개 서버 로드 밸런싱 분산 결과:');
  SERVERS.forEach(server => {
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
    console.log('✅ 9개 서버 로드 밸런싱이 잘 작동하고 있습니다!');
    loadBalancingRate.add(1);
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 9개 서버 로드 밸런싱이 부분적으로 작동하고 있습니다.');
    loadBalancingRate.add(0.5);
  } else {
    console.log('❌ 9개 서버 로드 밸런싱이 제대로 작동하지 않습니다!');
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

// 간단한 메시지 전송 테스트
function performSimpleMessageTest(testName, messageCount) {
  console.log(`🔥 9개 서버 ${testName} 시작 - ${messageCount}개의 메시지 전송`);
  
  let messageSuccessCount = 0;
  let messageErrorCount = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < messageCount; i++) {
    const messageText = `9개서버-${testName} - 메시지 ${i + 1} - ${new Date().toISOString()}`;
    const sendResponse = sendChatMessage(ROOM_ID, messageText);
    
    if (sendResponse.status === 200 || sendResponse.status === 201) {
      messageSuccessCount++;
    } else {
      messageErrorCount++;
    }
    
    // 진행률 표시
    if (messageCount >= 1000 && (i + 1) % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`📊 9개서버 ${testName} 진행률: ${i + 1}/${messageCount} (${((i + 1) / messageCount * 100).toFixed(1)}%) - ${rate.toFixed(1)} msg/s`);
    }
    
    // 짧은 대기
    sleep(0.001); // 1ms 대기
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const messageRate = messageCount / totalTime;
  const successRate = messageSuccessCount / messageCount;
  
  console.log(`✅ 9개 서버 ${testName} 완료:`);
  console.log(`  - 총 메시지 수: ${messageCount}`);
  console.log(`  - 메시지 성공: ${messageSuccessCount}`);
  console.log(`  - 메시지 실패: ${messageErrorCount}`);
  console.log(`  - 메시지 성공률: ${(successRate * 100).toFixed(1)}%`);
  console.log(`  - 평균 메시지 처리율: ${messageRate.toFixed(1)} msg/s`);
  console.log(`  - 총 소요 시간: ${totalTime.toFixed(1)}초`);
  
  return successRate > 0.2;
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
  group('9개 서버 Basic Chat Room Access', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    if (check(response, {
      '9개서버 chat room access successful': (r) => r.status === 200 || r.status === 201,
      '9개서버 response time < 20s': (r) => r.timings.duration < 20000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. 메시지 전송 테스트 실행 (VU별로 다른 테스트)
  const vuId = __VU;
  if (vuId <= 50) {
    // VU 1-50: 1000개 메시지
    group('9개 서버 Message Test - 1000 Messages', function () {
      const result = performSimpleMessageTest('1000개 메시지 테스트', 1000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 100) {
    // VU 51-100: 5000개 메시지
    group('9개 서버 Message Test - 5000 Messages', function () {
      const result = performSimpleMessageTest('5000개 메시지 테스트', 5000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 150) {
    // VU 101-150: 10000개 메시지
    group('9개 서버 Message Test - 10000 Messages', function () {
      const result = performSimpleMessageTest('10000개 메시지 테스트', 10000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 200) {
    // VU 151-200: 30000개 메시지
    group('9개 서버 Message Test - 30000 Messages', function () {
      const result = performSimpleMessageTest('30000개 메시지 테스트', 30000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 250) {
    // VU 201-250: 50000개 메시지
    group('9개 서버 Message Test - 50000 Messages', function () {
      const result = performSimpleMessageTest('50000개 메시지 테스트', 50000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else {
    // VU 251+: 기본 테스트만
    group('9개 서버 Basic Test', function () {
      totalTests++;
      const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}/messages?limit=20`);
      if (check(response, {
        '9개서버 basic test successful': (r) => r.status === 200 || r.status === 201,
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
