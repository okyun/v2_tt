import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://host.docker.internal';

export function getTestToken() {
  console.log('🔑 테스트용 JWT 토큰 요청 중...');
  
  const response = http.get(`${BASE_URL}/api/member/test-token`);
  
  if (check(response, {
    '토큰 요청 성공': (r) => r.status === 200,
  })) {
    const data = response.json();
    console.log('✅ JWT 토큰 생성 성공');
    console.log(`📝 Access Token: ${data.accessToken.substring(0, 50)}...`);
    console.log(`⏰ 만료 시간: ${data.expiresIn}초 (${data.expiresIn / 3600}시간)`);
    return data.accessToken;
  } else {
    console.log('❌ JWT 토큰 생성 실패');
    return null;
  }
}

export default function() {
  const token = getTestToken();
  if (token) {
    console.log('🎉 테스트용 JWT 토큰을 성공적으로 받았습니다!');
  }
}
