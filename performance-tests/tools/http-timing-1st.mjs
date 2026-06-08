import { runFromArgv } from './http-timing-compare.mjs';

/**
 * 1차(1-shot) 측정 전용 래퍼.
 * 내부적으로 `http-timing-compare.mjs --step 1` 과 동일합니다.
 *
 * 예)
 *   node http-timing-1st.mjs --url "http://localhost:8080/api/products?..." --state .\\bench.state.json
 */

function buildArgv() {
  const user = process.argv.slice(2);
  const hasStep = user.includes('--step');
  if (hasStep) return user;
  return ['--step', '1', ...user];
}

await runFromArgv(buildArgv());
