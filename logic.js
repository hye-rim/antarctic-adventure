'use strict';

// 남극 탐험: 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 펭귄이 기지까지 달린다. 좌우로 피하고, 크레바스·바다표범은 점프로 넘는다(부딪히면 목숨 하나, -100점)
// - 🚩 깃발은 +200. 시간 안에 기지에 닿으면 (남은 초 × 50 + 1000) 보너스, 시간이 다 되면 목숨 하나 잃고 그 스테이지를 다시
// - 단계가 오를수록 길이 길어지고(1200 + 300×단계), 최고 속도가 빨라진다
// 소리·글씨·번쩍임은 index.html 이 st.events 를 보고 만든다.
const LOGIC_ANTARCTIC = (() => {
const HIT_RANGE = 0.6;            // 물체와 이만큼 가까워지면(앞뒤 거리) 부딪힌 것
const JUMP_V = 9, GRAVITY = 24, JUMP_CLEAR = 0.5;   // 점프 높이가 JUMP_CLEAR 넘으면 넘어간다
const HIT_TIME = 1.2;
const FLAG_SCORE = 200, HIT_PENALTY = 100;

const goalFor = (stage) => 1200 + stage * 300;
const timeFor = (stage) => 45 + stage * 5;
const maxSpeedFor = (stage) => 55 + stage * 3;

function newGame(rand = Math.random) {
  const st = { rand, stage: 1, score: 0, lives: 3, phase: 'play', events: [] };
  startStage(st);
  return st;
}

// 스테이지 시작: 길 위에 크레바스(45%)·바다표범(30%)·깃발(25%)을 흩어 놓는다
function startStage(st) {
  Object.assign(st, { dist: 0, speed: 0, px: 0, jy: 0, jv: 0, hitT: 0, hintT: st.stage === 1 ? 4 : 0 });
  st.goal = goalFor(st.stage);
  st.time = timeFor(st.stage);
  st.objs = [];
  for (let z = 60; z < st.goal - 60; z += 12 + st.rand() * 25) {
    const r = st.rand();
    const type = r < 0.45 ? 'crack' : r < 0.75 ? 'seal' : 'flag';
    st.objs.push({ type, z, x: (st.rand() * 1.8 - 0.9), w: type === 'crack' ? 0.22 + st.rand() * 0.2 : 0.18, got: false });
  }
  st.phase = 'play';
}
function nextStage(st) { st.stage++; startStage(st); }

// 점프 (땅에 있고 부딪혀 비틀거리는 중이 아닐 때만). 뛰었으면 true
function jump(st) {
  if (st.phase !== 'play' || st.jy !== 0 || st.hitT > 0) return false;
  st.jv = JUMP_V;
  st.events.push({ type: 'jump' });
  return true;
}

// input: { up(가속), down(감속), left, right, target(드래그로 가려는 좌우 위치 -1~1, 없으면 null) }
function update(st, dt, input = {}) {
  if (st.phase !== 'play') return;
  const prevSec = Math.ceil(st.time);
  st.time -= dt;
  if (st.time < 10 && Math.ceil(st.time) < prevSec && st.time > 0) st.events.push({ type: 'tick' });
  const maxV = maxSpeedFor(st.stage);
  if (input.up) st.speed += 30 * dt; else if (input.down) st.speed -= 45 * dt; else st.speed += 8 * dt;
  st.speed = Math.max(12, Math.min(maxV, st.speed));
  if (st.hitT > 0) { st.hitT -= dt; st.speed = Math.min(st.speed, 12); }
  if (input.target !== null && input.target !== undefined) {
    st.px += (input.target - st.px) * Math.min(1, dt * 16); // 드래그 목표로 부드럽게 추적
  } else {
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    st.px = Math.max(-1, Math.min(1, st.px + steer * 1.4 * dt));
  }
  if (st.jy > 0 || st.jv > 0) { st.jy += st.jv * dt; st.jv -= GRAVITY * dt; if (st.jy <= 0) { st.jy = 0; st.jv = 0; } }
  const prevDist = st.dist;
  st.dist += st.speed * dt;
  if (st.hintT > 0) st.hintT -= dt;

  // 이번 프레임에 지나온 구간 전체로 판정한다. 예전엔 지금 위치 ±0.6 만 봐서, 한 프레임에 1.2 넘게 달리면
  // (느린 폰이나 빠른 스테이지) 크레바스·바다표범·깃발을 그냥 지나쳤다.
  for (const o of st.objs) {
    if (o.got || o.z - st.dist > HIT_RANGE || o.z - prevDist < -HIT_RANGE) continue;
    if (Math.abs(o.x - st.px) > o.w) continue;
    if (o.type === 'flag') { o.got = true; st.score += FLAG_SCORE; st.events.push({ type: 'flag' }); }
    else if (st.jy < JUMP_CLEAR && st.hitT <= 0) {
      o.got = true; st.hitT = HIT_TIME; st.score = Math.max(0, st.score - HIT_PENALTY); st.lives--;
      st.events.push({ type: 'hit', kind: o.type });
      if (st.lives <= 0) { st.phase = 'over'; st.events.push({ type: 'over' }); return; }
    }
  }
  if (st.time <= 0) {
    st.lives--;
    st.events.push({ type: 'timeout' });
    if (st.lives <= 0) { st.phase = 'over'; st.events.push({ type: 'over' }); }
    else startStage(st);
  } else if (st.dist >= st.goal) {
    const bonus = Math.floor(st.time) * 50 + 1000;
    st.score += bonus;
    st.phase = 'clear';
    st.events.push({ type: 'clear', bonus });
  }
}

return { HIT_RANGE, JUMP_V, GRAVITY, JUMP_CLEAR, HIT_TIME, FLAG_SCORE, HIT_PENALTY, goalFor, timeFor, maxSpeedFor, newGame, startStage, nextStage, jump, update };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_ANTARCTIC;
