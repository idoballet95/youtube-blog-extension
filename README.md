# 유튜브 → 네이버 블로그 자동화 확장프로그램

유튜브 영상을 띄운 상태에서 Chrome 확장프로그램 클릭 한 번으로 자막 추출 → 블로그 생성 → 네이버 임시저장까지 자동화하는 도구.

## 파이프라인

```
유튜브 URL 입력 (또는 현재 탭 자동 감지)
   ↓
자막 추출 (youtube-transcript, 한→영 폴백)
   ↓
Claude CLI (claude -p) 시도
   ↓ 실패(401/timeout 등)
Codex CLI (codex exec --model gpt-5.4) 자동 폴백
   ↓
네이버 SE3 API 직접 호출 (naver-draft-api-blog-style.js)
   ↓
임시저장 완료
```

CLI 구독을 사용하므로 **API 추가 비용 없음**.

## 구성 요소

```
youtube/
├── extension/                ← Chrome 확장프로그램 (MV3)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── background.js
│   └── content.js
├── bridge/                   ← 로컬 Node.js 브릿지 서버 (port 3737)
│   ├── server.js
│   ├── package.json
│   └── start.sh
├── socceryoutube-policy.md   ← 유튜브 전용 정책 (자막·출연자 금지)
├── SKILL-MAPPING.md          ← 사용하는 스킬 파일 매핑
└── README.md
```

## 글쓰기 규칙

스포츠 블로그와 **동일한 스킬 파일** 참조:
- `sports/.agents/skills/sports-blog-writing/SKILL.md`
- 첫 줄 질문형 인용구 + 빈 줄 + 본문 3줄
- 소제목 3개, 번호 붙임, 후킹 질문형
- closing 마지막에 `vs` 양자택일 질문 → 자동 빨간색 강조

유튜브 전용 규칙은 `socceryoutube-policy.md`:
- 자막 출처 명시, 자막 외 사실 추가 금지
- 패널·유튜버 등 출연자 언급 금지

## 사전 준비

### 외부 의존성

- macOS
- Node.js 18+
- Claude CLI (`claude`) — Claude Code 구독
- Codex CLI (`codex`) — ChatGPT 구독 (폴백용)
- `/Users/irenedo/Desktop/naver-blog-automation/core/naver-draft-api-blog-style.js` 사용 가능 상태
- `data/raw/session.json` 네이버 로그인 세션 (`save-session.js` 로 갱신)

### 브릿지 서버 의존성

```bash
cd bridge && npm install
```

### 자동 시작 설정

`~/.zshrc` 에 다음이 자동 추가됨 (터미널 열 때 서버 자동 시작):
```bash
if ! lsof -i :3737 -t > /dev/null 2>&1; then
  nohup node "/Users/irenedo/Desktop/Blog Automation/youtube/bridge/server.js" \
    > "/Users/irenedo/Desktop/Blog Automation/youtube/bridge/bridge.log" 2>&1 &
  disown
fi
```

## Chrome 확장프로그램 설치

1. Chrome → `chrome://extensions`
2. 우측 상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램 로드** → `extension/` 폴더 선택

## 사용

1. 브릿지 서버 실행 중 확인 (터미널 열려있으면 자동 시작됨)
2. 유튜브 영상 열기 (또는 확장 팝업에 URL 직접 입력)
3. 확장 아이콘 클릭 → **블로그 글 생성 시작**
4. 자막 추출 → 글 생성 → 임시저장까지 자동 진행
5. 네이버 블로그 → 임시저장된 글에서 확인

## 디버그

서버 로그:
```bash
tail -f "/Users/irenedo/Desktop/Blog Automation/youtube/bridge/bridge.log"
```

생성된 블로그 데이터:
```bash
ls -lt /tmp/youtube_blog_last_*.json | head -3
```

세션 만료 시:
```bash
cd /Users/irenedo/Desktop/naver-blog-automation
export $(grep -v '^#' naver.env | xargs)
node core/save-session.js
cp core/session.json data/raw/session.json
```

포트 충돌:
```bash
lsof -ti :3737 | xargs kill -9
```
