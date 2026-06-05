// Service worker — 실제 처리(자막→생성→임시저장)를 여기서 담당한다.
// 팝업은 탭 전환 시 닫히면서 상태가 사라지므로, 진행 상태를 storage에 저장하고
// 팝업이 다시 열리면 storage를 직접 읽어 복원한다.

const BRIDGE_URL = 'http://localhost:3737';
const STATE_KEY = 'jobState';

function freshState(url = '', jobId = 0) {
  return {
    jobId,
    status: 'idle',                 // idle | running | done | error
    steps: { transcript: null, generate: null, draft: null }, // null|active|done|error
    result: null,                   // { ok, message }
    url,
    title: null,
    updatedAt: Date.now()
  };
}

let state = freshState();
let currentController = null;   // 진행 중 fetch 취소용
let jobSeq = 0;                 // 작업마다 증가 (옛 작업이 새 작업을 덮어쓰지 않게)

chrome.runtime.onInstalled.addListener(() => {
  console.log('유튜브 → 네이버 블로그 확장프로그램 설치됨');
});

async function persist() {
  state.updatedAt = Date.now();
  await chrome.storage.local.set({ [STATE_KEY]: state });
  chrome.runtime.sendMessage({ type: 'stateUpdate', state }).catch(() => {});
}

function applyEvent(msg) {
  switch (msg.step) {
    case 'transcript_start':
      state.steps.transcript = 'active'; break;
    case 'transcript_done':
      state.steps.transcript = 'done';
      state.steps.generate = 'active'; break;
    case 'generate_done':
      state.steps.generate = 'done';
      state.steps.draft = 'active';
      if (msg.title) state.title = msg.title; break;
    case 'draft_done':
      state.steps.draft = 'done';
      state.status = 'done';
      state.result = { ok: true, message: '완료! 네이버 블로그 임시저장에서 확인하세요.' }; break;
    case 'error':
      for (const k of ['transcript', 'generate', 'draft']) {
        if (state.steps[k] === 'active') state.steps[k] = 'error';
      }
      state.status = 'error';
      state.result = { ok: false, message: msg.message || '오류가 발생했습니다.' }; break;
  }
}

async function startJob(youtubeUrl) {
  // 이전 작업이 있으면 취소하고 무조건 새로 시작 (멈춤 방지)
  if (currentController) { try { currentController.abort(); } catch {} }
  const myId = ++jobSeq;
  currentController = new AbortController();
  const signal = currentController.signal;
  const timer = setTimeout(() => { try { currentController.abort(); } catch {} }, 360000); // 6분

  // 이 작업이 아직 최신인지 확인 후에만 상태를 반영/저장
  const mine = () => myId === jobSeq;
  const save = async () => { if (mine()) await persist(); };

  state = freshState(youtubeUrl, myId);
  state.status = 'running';
  state.steps.transcript = 'active';
  await save();

  try {
    const ping = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error();
  } catch {
    if (mine()) {
      state.steps.transcript = 'error';
      state.status = 'error';
      state.result = { ok: false, message: '브릿지 서버가 꺼져있습니다. 잠시 후 다시 시도해주세요.' };
      await save();
    }
    clearTimeout(timer);
    return;
  }

  try {
    const response = await fetch(`${BRIDGE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: youtubeUrl }),
      signal
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!mine()) return; // 새 작업이 시작됨 → 이 작업은 조용히 종료
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith(':')) { await save(); continue; } // heartbeat → '살아있음' 시각만 갱신
        if (!line.startsWith('data: ')) continue;
        try { applyEvent(JSON.parse(line.slice(6))); await save(); } catch {}
      }
    }

    if (mine() && state.status === 'running') {
      state.status = 'error';
      for (const k of ['transcript', 'generate', 'draft']) {
        if (state.steps[k] === 'active') state.steps[k] = 'error';
      }
      state.result = { ok: false, message: '서버 연결이 끊겼습니다. 다시 시도해주세요.' };
      await save();
    }
  } catch (err) {
    if (mine()) {
      state.status = 'error';
      for (const k of ['transcript', 'generate', 'draft']) {
        if (state.steps[k] === 'active') state.steps[k] = 'error';
      }
      state.result = {
        ok: false,
        message: (err && err.name === 'TimeoutError') ? '시간 초과 (6분). 다시 시도해주세요.'
               : (err && err.name === 'AbortError') ? '취소됨'
               : (err?.message || '오류가 발생했습니다.')
      };
      await save();
    }
  } finally {
    clearTimeout(timer);
    if (mine()) currentController = null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getState') { sendResponse({ state }); return; }
  if (msg.type === 'start') { startJob(msg.url); sendResponse({ ok: true }); return; }
});
