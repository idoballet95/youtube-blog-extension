#!/bin/bash
# 네이버 세션 자동 갱신 — launchd가 매일 새벽 5시에 실행
# naver.env 환경변수 로드 후 relogin-robust.js 실행

set -e

NAVER_DIR="/Users/irenedo/Desktop/naver-blog-automation"
LOG_DIR="/Users/irenedo/Desktop/Blog Automation/youtube/bridge"
LOG_FILE="$LOG_DIR/session-refresh.log"

# PATH 설정 (launchd는 PATH가 제한적)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# 타임스탬프
echo "" >> "$LOG_FILE"
echo "========== $(date '+%Y-%m-%d %H:%M:%S') 세션 갱신 시작 ==========" >> "$LOG_FILE"

cd "$NAVER_DIR"

# naver.env 로드
if [ -f naver.env ]; then
  export $(grep -v '^#' naver.env | xargs)
fi

# 재로그인 실행 (실패해도 launchd가 계속 살아있도록 || true)
node core/relogin-robust.js >> "$LOG_FILE" 2>&1 || {
  echo "⚠️ 세션 갱신 실패 — 다음 일정에 재시도" >> "$LOG_FILE"
  exit 0
}

echo "✅ 세션 갱신 완료 $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
