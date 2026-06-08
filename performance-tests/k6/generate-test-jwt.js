import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://host.docker.internal';

export function generateTestJWT() {
  console.log('🔑 테스트용 JWT 토큰 생성 중...');
  
  // 카카오 로그인 URL 요청
  const loginUrlResponse = http.get(`${BASE_URL}/api/member/kakao-login-url`);
  
  if (loginUrlResponse.status !== 200) {
    console.log('❌ 카카오 로그인 URL 요청 실패');
    return null;
  }
  
  const loginUrl = loginUrlResponse.json().loginUrl;
  console.log(`📱 카카오 로그인 URL: ${loginUrl}`);
  
  // 실제로는 카카오 OAuth를 거쳐야 하지만, 테스트용으로 간단한 토큰 생성
  // 또는 기존에 생성된 테스트 토큰을 사용
  
  // 테스트용 더미 JWT 토큰 (실제로는 서버에서 생성해야 함)
  const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzM3MTI0MDAwLCJleHAiOjE3MzcyMTA0MDB9.test-signature';
  
  console.log('✅ 테스트용 JWT 토큰 생성 완료');
  return testToken;
}

export default function() {
  const token = generateTestJWT();
  if (token) {
    console.log(`🔑 생성된 토큰: ${token.substring(0, 50)}...`);
  }
}

