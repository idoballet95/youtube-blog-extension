const BRIDGE_URL = 'http://localhost:3737';

const urlInput       = document.getElementById('urlInput');
const urlBadge       = document.getElementById('urlBadge');
const btnStart       = document.getElementById('btnStart');
const progressBox    = document.getElementById('progressBox');
const resultBox      = document.getElementById('resultBox');
const stepTranscript = document.getElementById('stepTranscript');
const stepGenerate   = document.getElementById('stepGenerate');
const stepDraft      = document.getElementById('stepDraft');

// ── 현재 탭 YouTube URL 자동 감지 ─────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab?.url?.includes('youtube.com/watch')) {
    urlInput.value = tab.url;
    urlBadge.classList.add('visible');
  }
});

urlInput.addEventListener('input', () => {
  if (!urlInput.value.includes('youtube.com/watch')) {
    urlBadge.classList.remove('visible');
  }
});

// ── 단계 상태 업데이트 ────────────────────────────────────────────────
function setStep(el, state) {
  el.classList.remove('active', 'done', 'error');
  if (state) el.classList.add(state);
  const icon = el.querySelector('.step-icon');
  if (state === 'done') icon.textContent = '✓';
  else if (state === 'error') icon.textContent = '✗';
  else icon.textContent = el === stepTranscript ? '1' : el === stepGenerate ? '2' : '3';
}

function showResult(ok, message) {
  resultBox.className = 'result-box ' + (ok ? 'success' : 'failure');
  resultBox.textContent = ok ? ('✓ ' + message) : ('✗ ' + message);
}

function resetUI() {
  progressBox.classList.remove('visible');
  resultBox.className = 'result-box';
  resultBox.textContent = '';
  setStep(stepTranscript, null);
  setStep(stepGenerate, null);
  setStep(stepDraft, null);
  stepTranscript.querySelector('span:last-child').textContent = '자막 추출 중...';
  stepGenerate.querySelector('span:last-child').textContent = '블로그 초안 생성 중 (Claude → GPT 폴백)...';
  stepDraft.querySelector('span:last-child').textContent = '네이버 임시저장 중...';
}

// ── 생성 시작 ─────────────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const youtubeUrl = urlInput.value.trim();
  if (!youtubeUrl || !youtubeUrl.includes('youtube.com/watch')) {
    showResult(false, '유효한 유튜브 URL을 입력해주세요.');
    return;
  }

  try {
    const ping = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(2000) });
    if (!ping.ok) throw new Error();
  } catch {
    showResult(false, '브릿지 서버가 꺼져있습니다.\n터미널에서 bridge/start.sh를 실행해주세요.');
    return;
  }

  resetUI();
  btnStart.disabled = true;
  progressBox.classList.add('visible');
  setStep(stepTranscript, 'active');

  try {
    const response = await fetch(`${BRIDGE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: youtubeUrl }),
      signal: AbortSignal.timeout(360000) // 6분
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try { handleEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  } catch (err) {
    setStep(stepTranscript, 'error');
    showResult(false, err.name === 'TimeoutError' ? '시간 초과 (6분). 다시 시도해주세요.' : err.message);
  } finally {
    btnStart.disabled = false;
  }
});

function handleEvent(msg) {
  switch (msg.step) {
    case 'transcript_start':
      setStep(stepTranscript, 'active'); break;
    case 'transcript_done':
      setStep(stepTranscript, 'done');
      stepTranscript.querySelector('span:last-child').textContent = '자막 추출 완료';
      setStep(stepGenerate, 'active'); break;
    case 'generate_done':
      setStep(stepGenerate, 'done');
      stepGenerate.querySelector('span:last-child').textContent = '블로그 초안 생성 완료';
      setStep(stepDraft, 'active'); break;
    case 'draft_done':
      setStep(stepDraft, 'done');
      stepDraft.querySelector('span:last-child').textContent = '네이버 임시저장 완료';
      showResult(true, '완료! 네이버 블로그 임시저장에서 확인하세요.'); break;
    case 'error':
      [stepTranscript, stepGenerate, stepDraft].forEach(el => {
        if (el.classList.contains('active')) setStep(el, 'error');
      });
      showResult(false, msg.message || '오류가 발생했습니다.'); break;
  }
}
