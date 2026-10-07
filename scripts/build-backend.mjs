import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// 기존 외부 package는 bundle에 포함하지 않고 프로젝트 입력만 읽습니다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist/backend/server.cjs');
const result = await build({
  stdin: {
    contents: fs.readFileSync(path.join(root, 'server.ts'), 'utf8'),
    sourcefile: 'server.ts',
    loader: 'ts',
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: false,
  write: false,
  tsconfigRaw: JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8')),
  plugins: [{
    name: 'external-packages',
    setup(builder) {
      // 현재 server.ts의 import는 Node 내장 모듈과 외부 package로만 구성됩니다.
      builder.onResolve({ filter: /^[^./]|^\.[^./]/ }, ({ path: importedPath }) => ({ path: importedPath, external: true }));
    },
  }],
});
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, result.outputFiles[0].contents);
console.log(`backend build 완료: dist/backend/server.cjs (${result.outputFiles[0].contents.length} bytes)`);
