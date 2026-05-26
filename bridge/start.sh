#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

# node_modules 없으면 설치
if [ ! -d "node_modules" ]; then
  echo "📦 패키지 설치 중..."
  npm install
fi

echo "🚀 브릿지 서버 시작..."
node server.js
