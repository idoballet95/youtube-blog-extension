const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// SE3 API 직접 호출 — sports 자동화와 동일한 스타일 (인용구 서론 + VS 빨간색 처리)
const NAVER_DRAFT_PATH = '/Users/irenedo/Desktop/naver-blog-automation/core/naver-draft-api-blog-style.js';
const NAVER_DRAFT_CWD  = '/Users/irenedo/Desktop/naver-blog-automation/core';
const GUIDES_DIR       = '/Users/irenedo/Desktop/Blog Automation/youtube';
const SPORTS_SKILL_DIR = '/Users/irenedo/Desktop/Blog Automation/sports/.agents/skills';
const PORT = 3737;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── 가이드 파일 로드 ──────────────────────────────────────────────────
// 1차: 스포츠 블로그와 동일한 스킬 파일 사용 (포메팅·구조·VS질문·인용구 서론)
const SPORTS_WRITING_SKILL = fs.readFileSync(path.join(SPORTS_SKILL_DIR, 'sports-blog-writing/SKILL.md'), 'utf-8');
// 2차: 유튜브 전용 정책 (자막 출처, 출연자 언급 금지)
const YOUTUBE_POLICY = fs.readFileSync(path.join(GUIDES_DIR, 'socceryoutube-policy.md'), 'utf-8');

// ── 유튜브 video ID 추출 ─────────────────────────────────────────────
function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return shortMatch[1];
  throw new Error('유효한 유튜브 URL이 아닙니다: ' + url);
}

// ── YouTube 자막 추출 (타임아웃 + 로깅) ──────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms / 1000}초)`)), ms)
    )
  ]);
}

async function fetchTranscript(videoId) {
  const { YoutubeTranscript } = require('youtube-transcript');
  console.log(`[transcript] videoId=${videoId} 자막 추출 시작`);

  let segments;
  let triedLangs = [];
  for (const lang of ['ko', 'en', undefined]) {
    triedLangs.push(lang || 'default');
    try {
      console.log(`[transcript] try lang=${lang || 'default'}`);
      segments = await withTimeout(
        YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : {}),
        15000,
        `자막 추출 (lang=${lang || 'default'})`
      );
      console.log(`[transcript] ✓ lang=${lang || 'default'} 성공, ${segments.length} segments`);
      break;
    } catch (e) {
      console.log(`[transcript] ✗ lang=${lang || 'default'} 실패: ${e.message}`);
    }
  }

  if (!segments) {
    throw new Error(`자막을 찾을 수 없습니다 (시도한 언어: ${triedLangs.join(', ')}). 자동 생성 자막이 비활성화되었거나 YouTube가 차단했을 수 있습니다.`);
  }

  const text = segments
    .map(s => (s.text || '').replace(/\[.*?\]/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length < 100) {
    throw new Error(`자막이 너무 짧습니다 (${text.length}자).`);
  }
  console.log(`[transcript] ✓ 최종 ${text.length}자`);
  return text;
}

// ── 요청 JSON 스키마 (claude --json-schema 용) ────────────────────────
function blogSchema() {
  return JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: ['title','source_url','title_suggestions','intro','toc','sections','closing','hashtags','recent_posts'],
    properties: {
      title: { type: 'string' },
      source_url: { type: 'string' },
      title_suggestions: {
        type: 'object',
        additionalProperties: false,
        required: ['search1','search2','feed1','feed2'],
        properties: {
          search1: { type: 'string' },
          search2: { type: 'string' },
          feed1: { type: 'string' },
          feed2: { type: 'string' }
        }
      },
      intro: { type: 'string' },
      toc: { type: 'array', items: { type: 'string' } },
      sections: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['heading','content','images'],
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            images: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      },
      closing: { type: 'string' },
      hashtags: { type: 'string' },
      recent_posts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {}
        }
      }
    }
  });
}

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────
function buildPrompt(transcript, videoUrl) {
  return `당신은 네이버 홈피드와 AI 브리핑 노출을 목표로 하는 30년 차 스포츠 블로거입니다.
이 작업은 유튜브 자막을 기반으로 한 네이버 블로그 초안 작성이며, 아래 두 스킬을 엄격히 적용해야 합니다.

===== [SKILL 1] sports-blog-writing (필수 적용) =====
${SPORTS_WRITING_SKILL}

===== [SKILL 2] youtube-source-policy (필수 적용) =====
${YOUTUBE_POLICY}

===== [입력 메타데이터] =====
- source_url: ${videoUrl}
- 데이터 출처: YouTube 영상 자막 (RSS 기사 아님)

===== [유튜브 자막] =====
${transcript}

===== [출력 지시] =====
- 한국어로 작성.
- JSON만 반환. 마크다운 코드블록·설명문 금지.
- toc는 sections의 heading과 1:1 정확히 동일하게 3개.
- sections는 정확히 3개. 모든 heading 앞에 번호(1., 2., 3.)를 붙이고, 짧고 후킹된 질문형/긴장감 있는 문장형으로 작성 (예: "1. 전반 2분, 승부 가른 장면은?", "2. 캐릭이 바꾼 한 가지는?", "3. 이 승리가 남긴 의미는?").
- intro: 첫 줄은 짧은 질문형 인용구 1문장(따옴표 "" 포함). 그 뒤 반드시 빈 줄(\\n\\n) 한 개 후, 일반 서론 3줄. 인용구와 본문 절대 한 줄로 붙이지 말 것.
- closing: 핵심 요약 → 공감/감상 → vs 양자택일 질문(예: "이번 변화가 본격 도약의 신호다 vs 일회성 반등에 그친다, 어느 쪽이신가요?") → CTA → 자연스러운 마무리. 각 단계 사이 빈 줄(\\n\\n).
- source_url 필드는 ${videoUrl} 그대로 사용.
- 유튜브 출연진(패널/분석가/유튜버) 언급 절대 금지. 자막 내용을 블로거가 직접 풀어 설명하듯 재구성.
`;
}

// ── claude -p 출력 파싱 ───────────────────────────────────────────────
function parseClaudeOutput(stdout) {
  const raw = (stdout || '').trim();
  if (!raw) throw new Error('claude returned empty output');
  const parsed = JSON.parse(raw);
  // 명시적으로 is_error 체크 → 에러 메시지 그대로 throw (isAuthError에서 매칭됨)
  if (parsed.is_error) {
    const msg = parsed.result || `api_error_status: ${parsed.api_error_status || 'unknown'}`;
    throw new Error(`claude api error: ${msg}`);
  }
  if (parsed.structured_output) return parsed.structured_output;
  if (parsed.result && typeof parsed.result === 'string') return JSON.parse(parsed.result);
  return parsed;
}

// ── Claude CLI 실행 (비동기) ──────────────────────────────────────────
function runClaudeModel(prompt) {
  return new Promise((resolve, reject) => {
    const schema = blogSchema();
    const child = spawn('claude', [
      '-p',
      '--model', 'sonnet',
      '--output-format', 'json',
      '--json-schema', schema,
      prompt
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('claude cli timeout (60초)'));
    }, 60000);

    child.on('error', e => {
      clearTimeout(timeout);
      reject(new Error(`claude cli error: ${e.message}`));
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error((stderr || stdout || `claude exit ${code}`).trim()));
      }
      try {
        resolve(parseClaudeOutput(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ── Codex (GPT) 폴백 ──────────────────────────────────────────────────
function parseJsonObjectFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('gpt fallback returned empty output');
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('gpt fallback did not return valid JSON');
  }
}

function runGptFallback(prompt) {
  return new Promise((resolve, reject) => {
    const schemaPath = '/tmp/codex_youtube_schema.json';
    fs.writeFileSync(schemaPath, blogSchema(), 'utf8');

    const fullPrompt = `${prompt}

[중요]
- 이제부터는 GPT 5.4 CODEX CLI fallback 경로다.
- 출력은 반드시 JSON만 반환하라.
- 마크다운 코드블록, 설명문, 머리말/꼬리말 금지.
- 위 스키마를 만족해야 한다.`;

    const fallbackCmd = `PATH="$HOME/.local/bin:$PATH" codex exec --model gpt-5.4 --skip-git-repo-check --sandbox workspace-write --output-schema ${schemaPath} -`;

    const child = spawn('bash', ['-lc', fallbackCmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${process.env.HOME || ''}/.local/bin:${process.env.PATH || ''}`
      }
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('codex/gpt fallback timeout (240초)'));
    }, 240000);

    child.on('error', e => {
      clearTimeout(timeout);
      reject(new Error(`gpt fallback cli error: ${e.message}`));
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error((stderr || stdout || `gpt fallback exit ${code}`).trim()));
      }
      try {
        resolve(parseJsonObjectFromText(stdout));
      } catch (e) {
        reject(e);
      }
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

// ── 폴백 트리거 조건 ──────────────────────────────────────────────────
function shouldFallbackToGpt(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('overloaded') ||
    m.includes('529') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('etimedout') ||
    m.includes('econnreset') ||
    m.includes('econnrefused') ||
    m.includes('enotfound') ||
    m.includes('spawnsync') ||
    m.includes('usage limit') ||
    m.includes('out of extra usage') ||
    m.includes('rate limit') ||
    m.includes('api error') ||
    m.includes('body too short') ||
    m.includes('claude cli error') ||
    m.includes('cli timeout')
  );
}
function isAuthError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('failed to authenticate') ||
         m.includes('authentication_error') ||
         m.includes('invalid authentication credentials') ||
         m.includes('api error: 401');
}

// ── 메인: Claude 시도 → 실패 시 GPT ───────────────────────────────────
async function generateBlog(prompt) {
  try {
    console.log('[generate] trying claude sonnet...');
    return await runClaudeModel(prompt);
  } catch (e) {
    console.error(`[generate] claude failed: ${e.message}`);
    if (!shouldFallbackToGpt(e.message) && !isAuthError(e.message)) {
      console.log('[generate] 조건 안 맞지만 일단 codex 폴백 시도');
    }
    console.log(isAuthError(e.message)
      ? '[generate] claude authentication failed; falling back to gpt-5.4'
      : '[generate] falling back to gpt-5.4');
    return await runGptFallback(prompt);
  }
}

// ── naver-draft.js 실행 ───────────────────────────────────────────────
function runNaverDraft(blogData) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [NAVER_DRAFT_PATH, '--stdin'], {
      cwd: NAVER_DRAFT_CWD,
      env: process.env
    });
    let stdout = '', stderr = '';
    child.stdin.write(JSON.stringify(blogData));
    child.stdin.end();
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('naver-draft.js 타임아웃 (120초)'));
    }, 120000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || stdout.includes('임시저장이 완료되었습니다')) {
        resolve(stdout);
      } else {
        reject(new Error('네이버 임시저장 실패: ' + (stderr || stdout || `code ${code}`).slice(0, 200)));
      }
    });
  });
}

// ── SSE 헬퍼 ─────────────────────────────────────────────────────────
function sendEvent(res, step, extra = {}) {
  res.write(`data: ${JSON.stringify({ step, ...extra })}\n\n`);
}

// ── 엔드포인트 ────────────────────────────────────────────────────────
app.get('/ping', (_, res) => res.json({ ok: true }));

app.post('/process', async (req, res) => {
  const { youtube_url } = req.body || {};
  if (!youtube_url) return res.status(400).json({ error: 'youtube_url이 필요합니다.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // STEP 1: 자막
    sendEvent(res, 'transcript_start');
    const videoId = extractVideoId(youtube_url);
    const transcript = await fetchTranscript(videoId);
    sendEvent(res, 'transcript_done', { chars: transcript.length });

    // STEP 2: Claude → Codex(GPT) 폴백
    const prompt = buildPrompt(transcript, youtube_url);
    const blogData = await generateBlog(prompt);
    blogData.source_url = blogData.source_url || youtube_url;

    // 디버그용으로 생성된 데이터 저장
    const debugPath = `/tmp/youtube_blog_last_${Date.now()}.json`;
    fs.writeFileSync(debugPath, JSON.stringify(blogData, null, 2), 'utf-8');
    console.log(`[generate] ✓ 블로그 데이터 생성됨`);
    console.log(`[generate]    title: ${blogData.title}`);
    console.log(`[generate]    intro: ${(blogData.intro || '').length}자`);
    console.log(`[generate]    sections: ${(blogData.sections || []).length}개`);
    (blogData.sections || []).forEach((s, i) => {
      console.log(`[generate]      ${i+1}. ${s.heading} (${(s.content||'').length}자)`);
    });
    console.log(`[generate]    closing: ${(blogData.closing || '').length}자`);
    console.log(`[generate]    저장 경로: ${debugPath}`);

    sendEvent(res, 'generate_done', { title: blogData.title });

    // STEP 3: 네이버 임시저장
    console.log('[draft] naver-draft.js 실행 시작...');
    const draftOutput = await runNaverDraft(blogData);
    console.log('[draft] naver-draft.js 출력:');
    console.log(draftOutput);
    sendEvent(res, 'draft_done');

  } catch (err) {
    console.error('[ERROR]', err.message);
    sendEvent(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});

const server = app.listen(PORT, () => {
  console.log(`\n✅ 유튜브 블로그 브릿지 서버 실행 중`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ⛓ Claude CLI 우선 → 실패 시 Codex GPT 폴백 (API 비용 0원)\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 포트 ${PORT} 사용 중 — 종료: lsof -ti :${PORT} | xargs kill -9\n`);
  } else {
    console.error('서버 오류:', err.message);
  }
  process.exit(1);
});
