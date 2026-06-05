// 팝업은 UI만 담당한다. 실제 작업과 상태 보관은 background.js(service worker)가 한다.
// 핵심: 상태는 chrome.storage.local 에 저장되므로, 팝업은 storage를 "직접" 읽고
// storage 변화를 "직접" 감시한다. (background가 잠들어 있어도 안전 — 타이밍 문제 없음)

const STATE_KEY = 'jobState';

const urlInput       = document.getElementById('urlInput');
const urlBadge       = document.getElementById('urlBadge');
const btnStart       = document.getElementById('btnStart');
const progressBox    = document.getElementById('progressBox');
const resultBox      = document.getElementById('resultBox');
const stepTranscript = document.getElementById('stepTranscript');
const stepGenerate   = document.getElementById('stepGenerate');
const stepDraft      = document.getElementById('stepDraft');

const LABELS = {
  transcript: { busy: '자막 추출 중...', done: '자막 추출 완료', num: '1' },
  generate:   { busy: '블로그 초안 생성 중 (Claude → GPT 폴백)...', done: '블로그 초안 생성 완료', num: '2' },
  draft:      { busy: '네이버 임시저장 중...', done: '네이버 임시저장 완료', num: '3' }
};
const STEP_EL = { transcript: stepTranscript, generate: stepGenerate, draft: stepDraft };

// 서버가 10초마다 heartbeat를 보내 updatedAt를 갱신한다.
// 따라서 2분 넘게 갱신이 없으면 = 작업이 죽은 것 → 화면 초기화하고 다시 시작 가능하게.
const STALE_MS = 2 * 60 * 1000;

// ── 현재 탭 YouTube URL 자동 감지 ─────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab?.url?.includes('youtube.com/watch') && !urlInput.value) {
    urlInput.value = tab.url;
    urlBadge.classList.add('visible');
  }
});

urlInput.addEventListener('input', () => {
  if (!urlInput.value.includes('youtube.com/watch')) {
    urlBadge.classList.remove('visible');
  }
});

// ── 단계 한 칸 그리기 ─────────────────────────────────────────────────
function paintStep(key, stepState) {
  const el = STEP_EL[key];
  const label = LABELS[key];
  el.classList.remove('active', 'done', 'error');
  if (stepState) el.classList.add(stepState);

  const icon = el.querySelector('.step-icon');
  if (stepState === 'done') icon.textContent = '✓';
  else if (stepState === 'error') icon.textContent = '✗';
  else icon.textContent = label.num;

  el.querySelector('span:last-child').textContent =
    stepState === 'done' ? label.done : label.busy;
}

// ── 전체 상태로 UI 복원 ───────────────────────────────────────────────
function render(state) {
  const isStale = state && state.status === 'running'
    && state.updatedAt && (Date.now() - state.updatedAt > STALE_MS);

  if (!state || state.status === 'idle' || isStale) {
    progressBox.classList.remove('visible');
    resultBox.className = 'result-box';
    resultBox.textContent = '';
    paintStep('transcript', null);
    paintStep('generate', null);
    paintStep('draft', null);
    btnStart.disabled = false;
    return;
  }

  if (state.url && !urlInput.value) urlInput.value = state.url;
  progressBox.classList.add('visible');
  paintStep('transcript', state.steps.transcript);
  paintStep('generate', state.steps.generate);
  paintStep('draft', state.steps.draft);

  if (state.result) {
    resultBox.className = 'result-box ' + (state.result.ok ? 'success' : 'failure');
    resultBox.textContent = (state.result.ok ? '✓ ' : '✗ ') + state.result.message;
  } else {
    resultBox.className = 'result-box';
    resultBox.textContent = '';
  }

  btnStart.disabled = state.status === 'running';
}

// ── 팝업 열릴 때: storage에서 직접 읽어 복원 ─────────────────────────
chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: state }) => {
  render(state);
});

// ── storage 변화를 직접 감시(실시간 갱신) ─────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATE_KEY]) {
    render(changes[STATE_KEY].newValue);
  }
});

// ── 생성 시작 ─────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  const youtubeUrl = urlInput.value.trim();
  if (!youtubeUrl || !youtubeUrl.includes('youtube.com/watch')) {
    resultBox.className = 'result-box failure';
    resultBox.textContent = '✗ 유효한 유튜브 URL을 입력해주세요.';
    return;
  }
  btnStart.disabled = true;
  chrome.runtime.sendMessage({ type: 'start', url: youtubeUrl });
});
