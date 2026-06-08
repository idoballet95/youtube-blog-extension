#!/usr/bin/env node
/**
 * formation-board.js — 축구 전술 보드(포메이션) 이미지 생성기
 *
 * 유튜브 자막에서 추출한 포메이션·선수 데이터로
 * 저작권 깨끗한 전술 보드 SVG/PNG를 직접 렌더링한다.
 *
 * 입력 (stdin JSON):
 * {
 *   "title": "첼시 예상 선발 (사비 알론소 체제)",   // 선택
 *   "teamColor": "#1b3a8f",                       // 선택 (마커 색)
 *   "formation": "3-4-2-1",                        // 필수
 *   "players": ["Sanchez","Hato","Colwill","James","Enzo","Caicedo","Neto","Gusto","Palmer","Estevao","Jackson"],
 *                                                  // GK부터 순서대로 (수비→미드→공격)
 *   "numbers": [1,3,6,24,8,25,7,27,10,...]          // 선택 (등번호, 없으면 이니셜)
 * }
 *
 * 사용:
 *   echo '{...}' | node formation-board.js                 # SVG를 stdout으로
 *   echo '{...}' | node formation-board.js --png out.png   # PNG 파일 생성
 */
'use strict';

const fs = require('fs');

// playwright는 naver-blog-automation 쪽 설치본을 재사용
const PLAYWRIGHT_PATH = '/Users/irenedo/Desktop/naver-blog-automation/node_modules/playwright';

// ── 캔버스/스타일 토큰 (16:9 가로) ───────────────────────────────────
const W = 1600;
const H = 900;
const BG = '#0d0d0d';
const DOT = '#2b2b2b';
const LINE = '#ffffff';
const LINE_OP = 0.85;
const MARKER_R = 44;
const DEFAULT_TEAM = '#1b3a8f';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initials(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  // 영문이면 첫 글자, 한글이면 첫 글자
  return n[0].toUpperCase();
}

// ── 포메이션 파싱 → 라인별 선수 분배 ─────────────────────────────────
function parseLines(formation, players) {
  const groups = String(formation).split(/[-\s]+/).map(n => parseInt(n, 10)).filter(Boolean);
  // groups = [DF, MF, (AM), FW] (수비→공격 순)
  const sections = [];
  let idx = 1; // players[0] = GK
  for (const g of groups) {
    sections.push(players.slice(idx, idx + g).map((name, i) => ({ name, gi: idx + i })));
    idx += g;
  }
  const gk = { name: players[0], gi: 0 };
  // 화면 위(공격) → 아래(수비) 순서로 뒤집고 맨 아래 GK 추가
  const topToBottom = [...sections].reverse();
  topToBottom.push([gk]);
  return topToBottom;
}

// ── 점 그리드 ─────────────────────────────────────────────────────────
function dotGrid() {
  const step = 36, r = 1.6;
  let d = '';
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      d += `<circle cx="${x}" cy="${y}" r="${r}" fill="${DOT}"/>`;
    }
  }
  return d;
}

// ── 필드 라인 (가로 배치, 골대 좌우) ─────────────────────────────────
function fieldLines() {
  const left = 70, right = W - 70;
  const top = 80, bottom = H - 80;
  const cx = W / 2, cy = H / 2;
  const s = `stroke="${LINE}" stroke-width="2.5" fill="none" opacity="${LINE_OP}"`;
  let d = '';
  // 외곽
  d += `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="6" ${s}/>`;
  // 센터라인(세로) + 센터서클
  d += `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}" ${s}/>`;
  d += `<circle cx="${cx}" cy="${cy}" r="100" ${s}/>`;
  d += `<circle cx="${cx}" cy="${cy}" r="5" fill="${LINE}" opacity="${LINE_OP}"/>`;
  // 페널티/골 박스 세로 길이
  const boxH = 360, boxW = 150, gH = 180, gW = 60;
  // 왼쪽(우리 골) 박스
  d += `<rect x="${left}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" ${s}/>`;
  d += `<rect x="${left}" y="${cy - gH / 2}" width="${gW}" height="${gH}" ${s}/>`;
  // 오른쪽(상대 골) 박스
  d += `<rect x="${right - boxW}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" ${s}/>`;
  d += `<rect x="${right - gW}" y="${cy - gH / 2}" width="${gW}" height="${gH}" ${s}/>`;
  return d;
}

// ── 선수 마커 ─────────────────────────────────────────────────────────
function marker(x, y, name, number, teamColor) {
  const inner = number != null ? String(number) : initials(name);
  let g = '';
  // 그림자
  g += `<circle cx="${x}" cy="${y + 3}" r="${MARKER_R}" fill="#000000" opacity="0.45"/>`;
  // 원
  g += `<circle cx="${x}" cy="${y}" r="${MARKER_R}" fill="${teamColor}" stroke="#ffffff" stroke-width="3.5"/>`;
  // 안쪽 텍스트(번호/이니셜)
  g += `<text x="${x}" y="${y}" fill="#ffffff" font-family="'Helvetica Neue',Arial,sans-serif" font-size="38" font-weight="800" text-anchor="middle" dominant-baseline="central">${esc(inner)}</text>`;
  // 이름 (원 아래)
  g += `<text x="${x}" y="${y + MARKER_R + 30}" fill="#ffffff" font-family="'Helvetica Neue',Arial,sans-serif" font-size="27" font-weight="700" text-anchor="middle">${esc(name)}</text>`;
  return g;
}

// ── SVG 빌드 ──────────────────────────────────────────────────────────
function buildSVG(data) {
  const formation = data.formation || '4-3-3';
  const players = Array.isArray(data.players) ? data.players : [];
  const numbers = Array.isArray(data.numbers) ? data.numbers : null;
  const teamColor = data.teamColor || DEFAULT_TEAM;
  const title = data.title || '';

  // 가로 배치: 왼쪽(GK) → 오른쪽(FW)
  const lines = parseLines(formation, players).reverse(); // [GK, DF, MF, AM, FW]

  const xLeft = 175, xRight = W - 145;
  const yTop = 165, yBottom = H - 120;
  const n = lines.length;

  // 모든 라인을 동일 간격 + 세로 중앙 정렬 (지그재그 방지)
  const maxM = Math.max(...lines.map(l => l.length));
  const slot = Math.min(195, (yBottom - yTop) / Math.max(1, maxM - 1));

  let markers = '';
  const posByGi = {};   // 선수 인덱스(gi) → 화면 좌표 (화살표용)
  lines.forEach((line, li) => {
    const x = xLeft + (xRight - xLeft) * (li / (n - 1));
    const m = line.length;
    const startY = H / 2 - slot * (m - 1) / 2;
    line.forEach((p, pi) => {
      const y = m === 1 ? H / 2 : startY + slot * pi;
      posByGi[p.gi] = { x, y };
      const num = numbers && p.gi != null ? numbers[p.gi] : null;
      markers += marker(x, y, p.name, num, teamColor);
    });
  });

  // ── 화살표 (패스/움직임 경로) ──────────────────────────────────────
  // arrows: [{ from, to, color, dashed, label, curve }]
  //   from/to: 선수 인덱스(0~10) 또는 정규화 좌표 [nx, ny] (0~1)
  const arrows = Array.isArray(data.arrows) ? data.arrows : [];
  const resolvePt = (ref) => {
    if (Array.isArray(ref)) return { x: ref[0] * W, y: ref[1] * H };
    if (typeof ref === 'number' && posByGi[ref]) return posByGi[ref];
    return null;
  };
  let arrowSvg = '';
  arrows.forEach((a, ai) => {
    const p1 = resolvePt(a.from), p2 = resolvePt(a.to);
    if (!p1 || !p2) return;
    const col = a.color || '#f5c518';
    const mid = `arrowhead${ai}`;
    // 마커 가장자리에서 시작/끝 (원 반지름만큼 안쪽으로)
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const sx = p1.x + Math.cos(ang) * (MARKER_R + 6);
    const sy = p1.y + Math.sin(ang) * (MARKER_R + 6);
    const ex = p2.x - Math.cos(ang) * (MARKER_R + 14);
    const ey = p2.y - Math.sin(ang) * (MARKER_R + 14);
    const dash = a.dashed ? `stroke-dasharray="14 10"` : '';
    arrowSvg += `<defs><marker id="${mid}" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto"><path d="M0,0 L11,5 L0,10 z" fill="${col}"/></marker></defs>`;
    if (a.curve) {
      const mx = (sx + ex) / 2 + Math.cos(ang + Math.PI / 2) * 80;
      const my = (sy + ey) / 2 + Math.sin(ang + Math.PI / 2) * 80;
      arrowSvg += `<path d="M${sx},${sy} Q${mx},${my} ${ex},${ey}" stroke="${col}" stroke-width="5" fill="none" ${dash} marker-end="url(#${mid})"/>`;
    } else {
      arrowSvg += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="5" ${dash} marker-end="url(#${mid})"/>`;
    }
    if (a.label) {
      const lx = (sx + ex) / 2, ly = (sy + ey) / 2 - 14;
      arrowSvg += `<text x="${lx}" y="${ly}" fill="${col}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="24" font-weight="800" text-anchor="middle">${esc(a.label)}</text>`;
    }
  });

  const titleEl = `
    ${title ? `<text x="${W / 2}" y="56" fill="#ffffff" font-family="'Helvetica Neue',Arial,sans-serif" font-size="36" font-weight="800" text-anchor="middle">${esc(title)}</text>` : ''}
    <text x="${W - 36}" y="56" fill="#888888" font-family="'Helvetica Neue',Arial,sans-serif" font-size="26" font-weight="800" text-anchor="end">${esc(formation)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dotGrid()}
  ${fieldLines()}
  ${markers}
  ${arrowSvg}
  ${titleEl}
</svg>`;
}

// ── SVG → PNG (playwright) ────────────────────────────────────────────
async function toPNG(svg, outPath) {
  const { chromium } = require(PLAYWRIGHT_PATH);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2
  });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0;background:${BG}">${svg}</body></html>`,
    { waitUntil: 'load' }
  );
  await page.locator('svg').screenshot({ path: outPath });
  await browser.close();
}

// ── CLI ───────────────────────────────────────────────────────────────
function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', d => { buf += d; });
    process.stdin.on('end', () => resolve(buf));
  });
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const pngIdx = args.indexOf('--png');
    const raw = await readStdin();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('❌ stdin JSON 파싱 실패:', e.message);
      process.exit(1);
    }
    const svg = buildSVG(data);

    if (pngIdx !== -1) {
      const out = args[pngIdx + 1] || '/tmp/formation-board.png';
      await toPNG(svg, out);
      console.log(out);
    } else {
      process.stdout.write(svg);
    }
  })();
}

module.exports = { buildSVG };
