// Service worker - 최소한의 역할만 수행
// popup.js가 직접 브릿지 서버와 통신하므로 여기는 비워둡니다.

chrome.runtime.onInstalled.addListener(() => {
  console.log('유튜브 → 네이버 블로그 확장프로그램 설치됨');
});
