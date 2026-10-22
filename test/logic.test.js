'use strict';
// 남극 탐험 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 물체 하나만 놓인 빈 길
function lane(objs, stage = 1) {
  const st = L.newGame(rng(1));
  st.stage = stage; L.startStage(st);
  st.objs = objs.map((o) => ({ got: false, w: 0.3, x: 0, ...o }));
  return st;
}
const runTo = (st, z, dt, input = {}) => { while (st.phase === 'play' && st.dist < z) L.update(st, dt, input); };

test('stages get longer and faster; objects stay on the ice between start and base', () => {
  for (let s = 1; s <= 10; s++) {
    const st = L.newGame(rng(s)); st.stage = s; L.startStage(st);
    assert.strictEqual(st.goal, 1200 + 300 * s);
    assert.strictEqual(st.time, 45 + 5 * s);
    for (const o of st.objs) {
      assert.ok(o.z >= 60 && o.z < st.goal - 60);
      assert.ok(Math.abs(o.x) <= 0.9);
      assert.ok(['crack', 'seal', 'flag'].includes(o.type));
    }
    assert.ok(st.objs.length > 30);
  }
  assert.ok(L.maxSpeedFor(10) > L.maxSpeedFor(1));
});

test('running into a crevasse costs a life and 100 points; jumping over it is safe', () => {
  let st = lane([{ type: 'crack', z: 30 }]);
  st.score = 500;
  runTo(st, 40, 1 / 60);
  assert.strictEqual(st.lives, 2);
  assert.strictEqual(st.score, 400);
  assert.ok(st.events.some((e) => e.type === 'hit' && e.kind === 'crack'));
  st = lane([{ type: 'seal', z: 30 }]);
  runTo(st, 26, 1 / 60);
  assert.ok(L.jump(st));
  L.update(st, 1 / 60);
  assert.ok(!L.jump(st), 'no jumping again in the air');
  runTo(st, 40, 1 / 60);
  assert.strictEqual(st.lives, 3, 'cleared the seal');
});

test('steering around an obstacle is safe; flags are collected for 200', () => {
  const st = lane([{ type: 'crack', z: 30, x: 0.8 }, { type: 'flag', z: 50, x: 0 }]);
  runTo(st, 60, 1 / 60);
  assert.strictEqual(st.lives, 3);
  assert.strictEqual(st.score, 200);
});

test('fast running on a slow phone still hits obstacles and flags (no skipping through them)', () => {
  // 예전엔 한 프레임에 1.2 넘게 달리면 물체를 그냥 지나쳤다
  for (const fps of [60, 30, 20]) {
    for (let k = 0; k < 20; k++) {
      const z = 100 + k * 3.7;
      const st = lane([{ type: 'flag', z }], 10);
      st.speed = L.maxSpeedFor(10);
      runTo(st, z + 5, 1 / fps, { up: true });
      assert.strictEqual(st.score, 200, `fps ${fps} flag at ${z}`);
      const s2 = lane([{ type: 'crack', z }], 10);
      s2.speed = L.maxSpeedFor(10);
      runTo(s2, z + 5, 1 / fps, { up: true });
      assert.strictEqual(s2.lives, 2, `fps ${fps} crack at ${z}`);
    }
  }
});

test('after a hit you stumble: slowed down, no jumping, no second hit for a moment', () => {
  const st = lane([{ type: 'crack', z: 20 }, { type: 'seal', z: 22 }]);
  runTo(st, 21, 1 / 60);
  assert.strictEqual(st.lives, 2);
  assert.ok(!L.jump(st));
  runTo(st, 24, 1 / 60);
  assert.strictEqual(st.lives, 2, 'the seal right after does not count');
  assert.ok(st.speed <= 12);
});

test('speed: accelerate, brake, and stay between 12 and the stage maximum; steering stays on the ice', () => {
  const st = lane([]);
  for (let k = 0; k < 600; k++) L.update(st, 1 / 60, { up: true, right: true });
  assert.strictEqual(st.speed, L.maxSpeedFor(1));
  assert.strictEqual(st.px, 1);
  for (let k = 0; k < 600; k++) L.update(st, 1 / 60, { down: true, left: true });
  assert.strictEqual(st.speed, 12);
  assert.strictEqual(st.px, -1);
  L.update(st, 1 / 60, { target: 0.5 });
  assert.ok(st.px > -1, 'dragging pulls toward the finger');
});

test('reaching the base pays a time bonus; running out of time costs a life and restarts the stage', () => {
  const st = lane([]);
  st.dist = st.goal - 1;
  st.time = 20.5;
  L.update(st, 0.1, {});
  assert.strictEqual(st.phase, 'clear');
  assert.strictEqual(st.score, 20 * 50 + 1000);
  L.nextStage(st);
  assert.strictEqual(st.stage, 2);
  const s2 = lane([]);
  s2.time = 0.05;
  L.update(s2, 0.1, {});
  assert.strictEqual(s2.lives, 2);
  assert.strictEqual(s2.dist, 0, 'stage restarted');
  assert.strictEqual(s2.time, L.timeFor(1));
  s2.lives = 1; s2.time = 0.05;
  L.update(s2, 0.1, {});
  assert.strictEqual(s2.phase, 'over');
});

test('a careful runner (steers around, jumps what it cannot avoid, grabs flags) clears five stages', () => {
  for (const seed of [1, 2, 3]) {
    const st = L.newGame(rng(seed));
    for (let stage = 1; stage <= 5; stage++) {
      while (st.phase === 'play') {
        const ahead = st.objs.filter((o) => !o.got && o.z > st.dist && o.z - st.dist < 12).sort((a, b) => a.z - b.z);
        const danger = ahead.find((o) => o.type !== 'flag' && Math.abs(o.x - st.px) < o.w + 0.15);
        const flag = ahead.find((o) => o.type === 'flag');
        let target = st.px;
        if (danger) target = danger.x > 0 ? danger.x - danger.w - 0.3 : danger.x + danger.w + 0.3;
        else if (flag) target = flag.x;
        if (danger && danger.z - st.dist < 3) L.jump(st);
        L.update(st, 1 / 30, { up: true, target: Math.max(-1, Math.min(1, target)) });
        st.events.length = 0;
      }
      assert.strictEqual(st.phase, 'clear', `seed ${seed} stage ${stage} (lives ${st.lives})`);
      L.nextStage(st);
    }
    assert.ok(st.lives >= 1);
  }
});
