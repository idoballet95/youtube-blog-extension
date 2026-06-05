#!/bin/bash
# 유튜브→네이버 블로그 브릿지 서버 자동 시작 런처
# 터미널(전체 디스크 접근 권한 보유)에서 실행되므로 node가 데스크탑을 읽을 수 있음.
# 포트가 비어있을 때만 서버를 띄우고, 죽으면 자동으로 다시 살림.

cd "/Users/irenedo/Desktop/Blog Automation/youtube/bridge" || exit 1

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

clear
echo "────────────────────────────────────────────"
echo "  📺  유튜브 → 네이버 블로그 브릿지 서버"
echo "  이 창은 켜두기만 하면 됩니다 (최소화 가능)"
echo "  닫으면 자동화가 멈춥니다."
echo "────────────────────────────────────────────"

while true; do
  # 이미 떠 있으면(다른 인스턴스) 그냥 대기
  if curl -s -m 3 http://localhost:3737/ping >/dev/null 2>&1; then
    sleep 10
    continue
  fi
  echo ""
  echo "[$(date '+%H:%M:%S')] 서버 시작..."
  node server.js 2>&1 | tee -a bridge.log
  echo "[$(date '+%H:%M:%S')] 서버가 종료됨 — 3초 후 재시작"
  sleep 3
done
