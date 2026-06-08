import { performance } from 'node:perf_hooks';

function argValue(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

async function main() {
  const argv = process.argv.slice(2);

  if (hasFlag(argv, '-h') || hasFlag(argv, '--help')) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage:\n' +
        '  node http-once-ms.mjs --url "<URL>"\n\n' +
        'Examples:\n' +
        '  node http-once-ms.mjs --url "http://localhost:8080/api/products?page=0&size=9&keyword=&sort=updatedAt&sort=desc"\n' +
        '  node http-once-ms.mjs --url "http://localhost:5173/api/products?page=0&size=9&keyword=&sort=updatedAt&sort=desc"\n'
    );
    process.exit(2);
  }

  const url = argValue(argv, '--url');
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('ERROR: --url is required');
    process.exit(2);
  }

  const t0 = performance.now();
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  // 응답 바디까지 읽고 나서까지를 "한 번의 왕복"으로 측정(Postman과 유사)
  await res.arrayBuffer();
  const t1 = performance.now();

  const ms = t1 - t0;
  // 출력은 "시간만" (숫자)
  // eslint-disable-next-line no-console
  process.stdout.write(`${ms.toFixed(2)}\n`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String(e?.message || e));
  process.exit(1);
});
