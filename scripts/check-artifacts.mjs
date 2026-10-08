import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 실제 credential을 출력하지 않고 종류와 위치만 보고합니다.
const credentialPatterns = [
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['OpenAI 계열 API key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['Groq API key', /\bgsk_[A-Za-z0-9_-]{20,}\b/],
  ['xAI API key', /\bxai-[A-Za-z0-9_-]{20,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['개인키', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

export function checkArtifacts({
  frontendDir = path.resolve('dist/frontend'),
  backendFile = path.resolve('dist/backend/server.cjs'),
  requireBackend = true,
} = {}) {
  const issues = [];
  let files = 0;
  const report = (file, reason) => issues.push({ file, reason });
  const regularFile = (file) => fs.existsSync(file) && fs.lstatSync(file).isFile();

  if (!fs.existsSync(frontendDir) || !fs.lstatSync(frontendDir).isDirectory()) {
    report('dist/frontend', 'frontend 출력 폴더 없음');
  } else {
    function visit(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const relative = path.relative(frontendDir, absolute).split(path.sep).join('/');
        if (entry.isSymbolicLink()) {
          report(relative, '외부 산출물을 참조할 수 있는 symlink');
          continue;
        }
        if (/^(?:\.env(?:\..*)?|server\.(?:ts|js|cjs|mjs)(?:\.map)?|package(?:-lock)?\.json)$/i.test(entry.name)
          || /\.(?:map|ts|tsx|cjs)$/i.test(entry.name)
          || /^(?:backend|node_modules)$/i.test(entry.name)) {
          report(relative, '서버·환경설정·source map·dependency 산출물');
        }
        if (entry.isDirectory()) {
          visit(absolute);
        } else if (entry.isFile()) {
          files += 1;
          const contents = fs.readFileSync(absolute).toString('utf8');
          if (/\/\/[#@]\s*sourceMappingURL\s*=|\/\*[#@]\s*sourceMappingURL\s*=/.test(contents)) {
            report(relative, '외부 또는 inline source map 참조');
          }
          if (/https?:\/\/(?:generativelanguage\.googleapis\.com|api\.openai\.com|api\.groq\.com|api\.x\.ai)\b/i.test(contents)) {
            report(relative, 'frontend에 AI provider 직접 호출 URL 포함');
          }
          if (/\b(?:getItem|setItem)\s*\(\s*['"]USER_(?:(?:GEMINI|OPENAI|GROQ|XAI)_API_KEY|ACCESS_CODE)['"]/.test(contents)) {
            report(relative, 'credential을 브라우저 저장소에서 읽거나 저장하는 코드 포함');
          }
          for (const [label, pattern] of credentialPatterns) {
            if (pattern.test(contents)) report(relative, `${label} 패턴 [REDACTED]`);
          }
          if (/\b(?:require\s*\(|from\s*)['"](?:express|dotenv|@google\/genai)(?:\/[^'"]*)?['"]/.test(contents)
            || /\bprocess\.env\.(?:ACCESS_CODE|GEMINI_API_KEY|OPENAI_API_KEY|GROQ_API_KEY|XAI_API_KEY|GROK_API_KEY)\b/.test(contents)) {
            report(relative, 'backend 전용 코드 포함');
          }
        } else {
          report(relative, '일반 파일이 아닌 산출물');
        }
      }
    }
    visit(frontendDir);
    if (!regularFile(path.join(frontendDir, 'index.html'))) report('index.html', 'frontend 진입 파일 없음');
    const assets = path.join(frontendDir, 'assets');
    const assetNames = fs.existsSync(assets) && fs.lstatSync(assets).isDirectory() ? fs.readdirSync(assets) : [];
    for (const extension of ['.js', '.css']) {
      if (!assetNames.some((file) => file.endsWith(extension) && regularFile(path.join(assets, file)))) {
        report('assets', `${extension} frontend asset 없음`);
      }
    }
  }

  if (requireBackend && (!regularFile(backendFile) || fs.statSync(backendFile).size === 0)) {
    report('dist/backend/server.cjs', 'backend bundle 없음 또는 빈 파일');
  }
  return { files, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkArtifacts({ requireBackend: !process.argv.includes('--frontend-only') });
  if (result.issues.length) {
    for (const issue of result.issues) console.error(`FAIL ${issue.file}: ${issue.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: frontend ${result.files}개 파일 검사 완료${process.argv.includes('--frontend-only') ? '' : ', backend bundle 확인'}`);
  }
}
