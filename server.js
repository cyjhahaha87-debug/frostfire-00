// frostfire-00 / expedition 형식 최소 MMO 실험
// v0.1 — 타일맵 위에 2+ 명이 공존하고 서로 움직이는 게 보임. 전투 없음.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ─────────────────────────────────────────────────────────
// 월드 정의
// ─────────────────────────────────────────────────────────
const MAP_W = 20;
const MAP_H = 15;
const TILE_GRASS = 0;
const TILE_ROCK  = 1;
const TILE_TREE  = 2;

// 맵을 생성하는 함수 (단순: 가장자리는 돌, 내부에 나무 몇 개)
function generateMap() {
  const m = [];
  for (let j = 0; j < MAP_H; j++) {
    const row = [];
    for (let i = 0; i < MAP_W; i++) {
      if (i === 0 || j === 0 || i === MAP_W - 1 || j === MAP_H - 1) {
        row.push(TILE_ROCK);
      } else {
        row.push(TILE_GRASS);
      }
    }
    m.push(row);
  }
  // 나무 몇 그루 흩뿌리기 (랜덤이되 시드 고정 위해 수동 배치)
  const trees = [[4,3],[7,5],[12,4],[15,7],[3,9],[9,10],[14,11],[6,12]];
  for (const [i,j] of trees) m[j][i] = TILE_TREE;
  return m;
}

const MAP = generateMap();

// 통행 가능 판정
function isWalkable(i, j) {
  if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H) return false;
  const t = MAP[j][i];
  return t === TILE_GRASS; // 돌/나무는 못 지나감
}

// 스폰 지점 후보 (중앙 근처 풀밭)
const SPAWNS = [[10,7],[9,7],[11,7],[10,6],[10,8]];
function pickSpawn() {
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
}

// ─────────────────────────────────────────────────────────
// 플레이어 상태
// ─────────────────────────────────────────────────────────
const players = {};         // socket.id → { fi, fj, nickname, sprite, facing }
const chatHistory = [];
const MAX_CHAT_HISTORY = 50;

const SPRITES = ['knight', 'archer'];

function pushChat(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
  io.emit('chat', msg);
}

// ─────────────────────────────────────────────────────────
// 소켓 이벤트
// ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('접속:', socket.id);

  const [fi, fj] = pickSpawn();
  const nickname = '나그네' + Math.floor(Math.random() * 1000);
  const sprite = SPRITES[Math.floor(Math.random() * SPRITES.length)];

  players[socket.id] = {
    fi, fj,
    nickname,
    sprite,
    facing: 'down',  // 바라보는 방향 (나중 스프라이트 회전용, 지금은 고정)
  };

  // 새 접속자에게 월드 전체 전송
  socket.emit('init', {
    id: socket.id,
    map: { w: MAP_W, h: MAP_H, tiles: MAP },
    players,
    chatHistory,
  });

  // 다른 접속자들에게 새 플레이어 알림
  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    data: players[socket.id],
  });

  pushChat({
    type: 'system',
    text: `${nickname}님이 들어왔습니다 (${sprite})`,
    time: Date.now(),
  });

  // ── 이동 요청 ─────────────────────────────────────
  // 클라이언트는 방향만 보냄. 서버가 검증하고 전파.
  socket.on('move', (dir) => {
    const p = players[socket.id];
    if (!p) return;
    if (typeof dir !== 'string') return;

    let di = 0, dj = 0;
    if (dir === 'up')         { dj = -1; p.facing = 'up'; }
    else if (dir === 'down')  { dj =  1; p.facing = 'down'; }
    else if (dir === 'left')  { di = -1; p.facing = 'left'; }
    else if (dir === 'right') { di =  1; p.facing = 'right'; }
    else return;

    const ni = p.fi + di;
    const nj = p.fj + dj;

    if (!isWalkable(ni, nj)) {
      // 벽/나무 — 제자리에서 방향만 돌리고 전파
      io.emit('playerMoved', {
        id: socket.id, fi: p.fi, fj: p.fj, facing: p.facing,
      });
      return;
    }

    // 다른 플레이어와 겹치는 것도 막기 (옵션)
    for (const sid in players) {
      if (sid === socket.id) continue;
      const q = players[sid];
      if (q.fi === ni && q.fj === nj) {
        io.emit('playerMoved', {
          id: socket.id, fi: p.fi, fj: p.fj, facing: p.facing,
        });
        return;
      }
    }

    p.fi = ni;
    p.fj = nj;
    io.emit('playerMoved', {
      id: socket.id, fi: p.fi, fj: p.fj, facing: p.facing,
    });
  });

  // ── 채팅 ─────────────────────────────────────────
  socket.on('chat', (text) => {
    if (typeof text !== 'string') return;
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    if (!players[socket.id]) return;

    pushChat({
      type: 'chat',
      nickname: players[socket.id].nickname,
      text: trimmed,
      time: Date.now(),
    });
  });

  // ── 닉네임 변경 ─────────────────────────────────
  socket.on('nickname', (name) => {
    if (typeof name !== 'string') return;
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    if (!players[socket.id]) return;

    const oldName = players[socket.id].nickname;
    players[socket.id].nickname = trimmed;

    pushChat({
      type: 'system',
      text: `${oldName}님이 ${trimmed}(으)로 이름을 바꿨습니다`,
      time: Date.now(),
    });
    io.emit('playerRenamed', { id: socket.id, nickname: trimmed });
  });

  // ── 퇴장 ─────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('퇴장:', socket.id);
    const leftNick = players[socket.id] ? players[socket.id].nickname : '누군가';
    delete players[socket.id];
    io.emit('playerLeft', socket.id);

    pushChat({
      type: 'system',
      text: `${leftNick}님이 나갔습니다`,
      time: Date.now(),
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('frostfire-00 서버 시작 포트:', PORT);
});
