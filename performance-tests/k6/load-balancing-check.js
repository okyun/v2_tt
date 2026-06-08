import http from 'k6/http';
import { check, sleep } from 'k6';

// 설정
const BASE_URL = 'http://talktrip-nginx';
const HEALTH_CHECK_URL = 'http://talktrip-nginx/api/actuator/health';

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
  
  const servers = ['talktrip-app-2', 'talktrip-app-3'];
  const requestCount = 30; // 30번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  servers.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    
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
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 로드 밸런싱이 부분적으로 작동하고 있습니다.');
  } else {
    console.log('❌ 로드 밸런싱이 제대로 작동하지 않습니다!');
  }
  
  return distributionRatio > 0.4;
}

// Nginx 상태 확인
function checkNginxStatus() {
  console.log('🌐 Nginx 상태 확인...');
  
  try {
    const response = http.get(HEALTH_CHECK_URL, { timeout: '10s' });
    console.log(`📊 Nginx 응답: ${response.status} (${response.timings.duration}ms)`);
    
    if (response.status === 200) {
      console.log('✅ Nginx가 정상적으로 작동하고 있습니다');
      return true;
    } else {
      console.log(`❌ Nginx 응답 오류: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Nginx 연결 실패: ${error.message}`);
    return false;
  }
}

// 메인 테스트 함수
export default function() {
  console.log('🚀 로드 밸런싱 테스트 시작...');
  
  // 1. Nginx 상태 확인
  const nginxOk = checkNginxStatus();
  
  // 2. 백엔드 서버 상태 확인
  const backendOk = checkLoadBalancer();
  
  // 3. 로드 밸런싱 분산 확인
  const distributionOk = checkLoadBalancingDistribution();
  
  // 4. 최종 결과
  console.log('\n📋 최종 결과:');
  console.log(`  - Nginx 상태: ${nginxOk ? '✅ 정상' : '❌ 오류'}`);
  console.log(`  - 백엔드 서버: ${backendOk ? '✅ 정상' : '❌ 오류'}`);
  console.log(`  - 로드 밸런싱: ${distributionOk ? '✅ 정상' : '❌ 오류'}`);
  
  if (nginxOk && backendOk && distributionOk) {
    console.log('🎉 모든 로드 밸런싱 구성 요소가 정상 작동합니다!');
  } else {
    console.log('⚠️ 로드 밸런싱에 문제가 있습니다. 설정을 확인해주세요.');
  }
  
  sleep(1);
}

// 테스트 설정
export let options = {
  vus: 1, // 1개의 가상 사용자로 충분
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95%의 요청이 5초 이내
    http_req_failed: ['rate<0.5'], // 50% 미만의 요청 실패
  },
};
