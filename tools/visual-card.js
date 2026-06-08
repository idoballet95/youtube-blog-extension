#!/usr/bin/env node
/**
 * visual-card.js — 블로그 콘텐츠 반영 비주얼 카드 생성기 (16:9 가로)
 *
 * 코드 기반 SVG 렌더링 → 무료·자동·저작권 깨끗·정확.
 * 전술 보드 + 4종 데이터 카드를 같은 다크 스타일로 통합.
 *
 * 카드 타입(type):
 *   - formation   : 포메이션 전술 보드 (formation-board.js 위임)
 *   - highlight    : 핵심 수치 하이라이트 (큰 숫자)
 *   - compare      : 스탯 비교 (A vs B 막대)
 *   - ranking      : 순위 / 리스트
 *   - timeline     : 타임라인 (경기 흐름·이적 일지)
 *
 * 사용:
 *   echo '{"type":"highlight", ...}' | node visual-card.js --png out.png
 *   echo '{"type":"compare",   ...}' | node visual-card.js          # SVG stdout
 */
'use strict';

const fs = require('fs');
const { buildSVG: buildFormation } = require('./formation-board');

const PLAYWRIGHT_PATH = '/Users/irenedo/Desktop/naver-blog-automation/node_modules/playwright';

// ── 공통 스타일 토큰 ──────────────────────────────────────────────────
const W = 1600, H = 900;
const BG = '#0d0d0d';
const DOT = '#2b2b2b';
const FONT = "'Helvetica Neue',Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const ACCENT = '#3b82f6';
const WHITE = '#ffffff';
const GRAY = '#9aa0a6';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dotGrid() {
  const step = 36, r = 1.6;
  let d = '';
  for (let y = step; y < H; y += step)
    for (let x = step; x < W; x += step)
      d += `<circle cx="${x}" cy="${y}" r="${r}" fill="${DOT}"/>`;
  return d;
}

function txt(x, y, s, { size = 32, color = WHITE, weight = 700, anchor = 'middle', baseline = 'alphabetic' } = {}) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${baseline}">${esc(s)}</text>`;
}

function frame(inner, title, accent) {
  const titleEl = title
    ? txt(80, 78, title, { size: 42, weight: 800, anchor: 'start' }) +
      `<rect x="80" y="98" width="120" height="6" rx="3" fill="${accent}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dotGrid()}
  ${titleEl}
  ${inner}
</svg>`;
}

// ── 1. 핵심 수치 하이라이트 ───────────────────────────────────────────
// { title, accent, stats:[{value, unit, label}, ...] }  (2~4개 권장)
function buildHighlight(d) {
  const accent = d.accent || ACCENT;
  const stats = (d.stats || []).slice(0, 4);
  const n = stats.length || 1;
  const top = 150, areaH = H - top - 60;
  const cy = top + areaH / 2;
  const cellW = W / n;
  let inner = '';
  stats.forEach((s, i) => {
    const cx = cellW * i + cellW / 2;
    const value = String(s.value ?? '');
    const unit = s.unit ? `<tspan font-size="60" font-weight="800" dx="6">${esc(s.unit)}</tspan>` : '';
    inner += `<text x="${cx}" y="${cy - 10}" fill="${accent}" font-family="${FONT}" font-size="150" font-weight="900" text-anchor="middle" dominant-baseline="central">${esc(value)}${unit}</text>`;
    inner += txt(cx, cy + 110, s.label || '', { size: 38, color: GRAY, weight: 700 });
    if (i < n - 1) inner += `<line x1="${cellW * (i + 1)}" y1="${top + 40}" x2="${cellW * (i + 1)}" y2="${H - 100}" stroke="#262626" stroke-width="2"/>`;
  });
  return frame(inner, d.title, accent);
}

// ── 2. 스탯 비교 (A vs B) ─────────────────────────────────────────────
// { title, left:{name,color}, right:{name,color}, rows:[{label,a,b}, ...] }
function buildCompare(d) {
  const accent = d.accent || ACCENT;
  const L = d.left || { name: 'A', color: accent };
  const R = d.right || { name: 'B', color: '#ef4444' };
  const rows = (d.rows || []).slice(0, 6);
  const cx = W / 2;
  const top = 200;
  const rowH = Math.min(110, (H - top - 60) / Math.max(1, rows.length));
  const maxBar = 480, labelGap = 90;

  let inner = '';
  // 헤더 (좌/우 이름)
  inner += txt(cx - 360, 150, L.name, { size: 46, color: L.color || accent, weight: 800 });
  inner += txt(cx + 360, 150, R.name, { size: 46, color: R.color || '#ef4444', weight: 800 });
  inner += txt(cx, 150, 'VS', { size: 40, color: GRAY, weight: 900 });

  rows.forEach((r, i) => {
    const y = top + rowH * i + rowH / 2;
    const a = Number(r.a) || 0, b = Number(r.b) || 0;
    const mx = Math.max(a, b, 1);
    const aw = (a / mx) * maxBar, bw = (b / mx) * maxBar;
    // 중앙 라벨
    inner += txt(cx, y - 34, r.label || '', { size: 28, color: GRAY, weight: 700 });
    // 좌측 막대 (오른→왼)
    inner += `<rect x="${cx - labelGap - aw}" y="${y - 16}" width="${aw}" height="32" rx="6" fill="${L.color || accent}"/>`;
    inner += txt(cx - labelGap - aw - 16, y + 10, a, { size: 34, color: WHITE, weight: 800, anchor: 'end' });
    // 우측 막대 (왼→오)
    inner += `<rect x="${cx + labelGap}" y="${y - 16}" width="${bw}" height="32" rx="6" fill="${R.color || '#ef4444'}"/>`;
    inner += txt(cx + labelGap + bw + 16, y + 10, b, { size: 34, color: WHITE, weight: 800, anchor: 'start' });
  });
  // 중앙 세로선
  inner += `<line x1="${cx}" y1="${top - 10}" x2="${cx}" y2="${top + rowH * rows.length}" stroke="#262626" stroke-width="2"/>`;
  return frame(inner, d.title, accent);
}

// ── 3. 순위 / 리스트 ──────────────────────────────────────────────────
// { title, accent, items:[{name,value}] 또는 ["손흥민 12골", ...] }
function buildRanking(d) {
  const accent = d.accent || ACCENT;
  const raw = (d.items || []).slice(0, 7);
  const items = raw.map(it => typeof it === 'string' ? { name: it, value: '' } : it);
  const top = 160, areaH = H - top - 50;
  const rowH = areaH / Math.max(1, items.length);
  const xNum = 130, xName = 230, xVal = W - 120;
  let inner = '';
  items.forEach((it, i) => {
    const y = top + rowH * i + rowH / 2;
    const medal = i === 0 ? '#f5c518' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : accent;
    inner += `<circle cx="${xNum}" cy="${y}" r="34" fill="${medal}"/>`;
    inner += txt(xNum, y, i + 1, { size: 38, color: '#0d0d0d', weight: 900, baseline: 'central' });
    inner += txt(xName, y, it.name || '', { size: 44, color: WHITE, weight: 700, anchor: 'start', baseline: 'central' });
    if (it.value !== '' && it.value != null)
      inner += txt(xVal, y, it.value, { size: 42, color: accent, weight: 800, anchor: 'end', baseline: 'central' });
    if (i < items.length - 1)
      inner += `<line x1="${xName}" y1="${y + rowH / 2}" x2="${xVal}" y2="${y + rowH / 2}" stroke="#1e1e1e" stroke-width="2"/>`;
  });
  return frame(inner, d.title, accent);
}

// ── 4. 타임라인 ───────────────────────────────────────────────────────
// { title, accent, events:[{time, text}, ...] }
function buildTimeline(d) {
  const accent = d.accent || ACCENT;
  const events = (d.events || []).slice(0, 6);
  const axisX = 360, top = 175, bottom = H - 70;
  const span = bottom - top;
  const stepY = events.length > 1 ? span / (events.length - 1) : 0;
  let inner = '';
  // 세로 축
  inner += `<line x1="${axisX}" y1="${top}" x2="${axisX}" y2="${events.length > 1 ? top + stepY * (events.length - 1) : bottom}" stroke="#333" stroke-width="4"/>`;
  events.forEach((e, i) => {
    const y = top + stepY * i;
    inner += `<circle cx="${axisX}" cy="${y}" r="16" fill="${accent}" stroke="#0d0d0d" stroke-width="4"/>`;
    inner += txt(axisX - 50, y, e.time || '', { size: 42, color: accent, weight: 900, anchor: 'end', baseline: 'central' });
    inner += txt(axisX + 56, y, e.text || '', { size: 38, color: WHITE, weight: 700, anchor: 'start', baseline: 'central' });
  });
  return frame(inner, d.title, accent);
}

// ── 디스패치 ──────────────────────────────────────────────────────────
function buildCard(d) {
  switch (d.type) {
    case 'formation': return buildFormation(d);
    case 'highlight': return buildHighlight(d);
    case 'compare':   return buildCompare(d);
    case 'ranking':   return buildRanking(d);
    case 'timeline':  return buildTimeline(d);
    default: throw new Error(`알 수 없는 카드 type: ${d.type}`);
  }
}

// ── SVG → PNG ─────────────────────────────────────────────────────────
async function toPNG(svg, outPath) {
  const { chromium } = require(PLAYWRIGHT_PATH);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${BG}">${svg}</body></html>`, { waitUntil: 'load' });
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
    try { data = JSON.parse(raw); }
    catch (e) { console.error('❌ stdin JSON 파싱 실패:', e.message); process.exit(1); }

    const svg = buildCard(data);
    if (pngIdx !== -1) {
      const out = args[pngIdx + 1] || '/tmp/visual-card.png';
      await toPNG(svg, out);
      console.log(out);
    } else {
      process.stdout.write(svg);
    }
  })();
}

module.exports = { buildCard, buildHighlight, buildCompare, buildRanking, buildTimeline };
