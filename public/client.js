// frostfire-00 클라이언트

const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const TILE = 48;              // 한 타일 화면상 크기(px)
const MAP_OFFSET_X = 0;
const MAP_OFFSET_Y = 0;

// ─────────────────────────────────────────────────────────
// 에셋 로드
// ─────────────────────────────────────────────────────────
const sprites = {};
const SPRITE_FILES = {
  knight: '/assets/character_knight.png',
  archer: '/assets/character_archer.png',
};
let spritesLoaded = 0;
const spriteTotal = Object.keys(SPRITE_FILES).length;

for (const [key, url] of Object.entries(SPRITE_FILES)) {
  const img = new Image();
  img.onload = () => { spritesLoaded++; };
  img.src = url;
  sprites[key] = img;
}

// ─────────────────────────────────────────────────────────
// 월드 상태 (서버에서 init 받으면 채워짐)
// ─────────────────────────────────────────────────────────
let myId = null;
let myMap = null;       // { w, h, tiles }
let players = {};       // id → {fi, fj, nickname, sprite, facing}

// ─────────────────────────────────────────────────────────
// 소켓 이벤트 핸들러
// ─────────────────────────────────────────────────────────
socket.on('init', (data) => {
  myId = data.id;
  myMap = data.map;
  players = data.players;

  const me = players[myId];
  document.getElementById('me').textContent =
    `${me.nickname} (${me.sprite})`;

  // 채팅 히스토리 복구
  const log = document.getElementById('chatLog');
  log.innerHTML = '';
  for (const msg of data.chatHistory) appendChat(msg);
});

socket.on('playerJoined', ({ id, data }) => {
  players[id] = data;
});

socket.on('playerMoved', ({ id, fi, fj, facing }) => {
  if (players[id]) {
    players[id].fi = fi;
    players[id].fj = fj;
    players[id].facing = facing;
  }
});

socket.on('playerRenamed', ({ id, nickname }) => {
  if (players[id]) players[id].nickname = nickname;
  if (id === myId) {
    document.getElementById('me').textContent =
      `${nickname} (${players[id].sprite})`;
  }
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

socket.on('chat', (msg) => {
  appendChat(msg);
});

// ─────────────────────────────────────────────────────────
// 채팅 UI
// ─────────────────────────────────────────────────────────
function appendChat(msg) {
  const log = document.getElementById('chatLog');
  const div = document.createElement('div');
  if (msg.type === 'system') {
    div.className = 'sys';
    div.textContent = `— ${msg.text}`;
  } else {
    div.className = 'msg';
    div.innerHTML = `<span class="nick">${escapeHtml(msg.nickname)}:</span> ${escapeHtml(msg.text)}`;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

document.getElementById('chatBtn').onclick = sendChat;
document.getElementById('chatInput').onkeydown = (e) => {
  if (e.key === 'Enter') sendChat();
};
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value;
  if (!text.trim()) return;
  socket.emit('chat', text);
  input.value = '';
}

document.getElementById('nickBtn').onclick = sendNick;
document.getElementById('nickInput').onkeydown = (e) => {
  if (e.key === 'Enter') sendNick();
};
function sendNick() {
  const input = document.getElementById('nickInput');
  const name = input.value.trim();
  if (!name) return;
  socket.emit('nickname', name);
  input.value = '';
}

// ─────────────────────────────────────────────────────────
// 이동 입력 (키를 한 번 누를 때마다 한 칸)
// 채팅 input에 포커스 있으면 무시
// ─────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const focused = document.activeElement;
  if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
    return;
  }

  let dir = null;
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') dir = 'up';
  if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') dir = 'down';
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dir = 'left';
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 'right';
  if (dir) {
    socket.emit('move', dir);
    e.preventDefault();
  }
});

// ─────────────────────────────────────────────────────────
// 렌더링
// ─────────────────────────────────────────────────────────
function drawTile(i, j, type) {
  const x = MAP_OFFSET_X + i * TILE;
  const y = MAP_OFFSET_Y + j * TILE;

  if (type === 0) {
    // 풀 — 체크무늬 느낌으로 약간 밝기 차이
    ctx.fillStyle = ((i + j) % 2 === 0) ? '#2d4f2a' : '#27462a';
    ctx.fillRect(x, y, TILE, TILE);
  } else if (type === 1) {
    // 돌
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  } else if (type === 2) {
    // 나무 — 풀 바닥 + 갈색 줄기 + 녹색 잎
    ctx.fillStyle = '#27462a';
    ctx.fillRect(x, y, TILE, TILE);
    // 잎
    ctx.fillStyle = '#1f5e2f';
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2 - 4, TILE * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // 줄기
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(x + TILE / 2 - 3, y + TILE - 12, 6, 10);
  }
}

function drawPlayer(p, isMe) {
  const img = sprites[p.sprite];
  if (!img || !img.complete) return;

  const cx = MAP_OFFSET_X + p.fi * TILE + TILE / 2;
  const groundY = MAP_OFFSET_Y + p.fj * TILE + TILE;  // 타일 바닥선

  // 스프라이트 크기 (56x90 기준). TILE=48 기준으로 약간 작게 조정
  const drawW = 40;
  const drawH = 64;
  const dx = cx - drawW / 2;
  const dy = groundY - drawH;

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY - 4, drawW * 0.4, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 스프라이트
  ctx.drawImage(img, dx, dy, drawW, drawH);

  // 본인이면 이름 위에 녹색 테두리
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const nameY = dy - 4;
  if (isMe) {
    ctx.fillStyle = '#4ade80';
  } else {
    ctx.fillStyle = '#ffffff';
  }
  // 외곽선
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeText(p.nickname, cx, nameY);
  ctx.fillText(p.nickname, cx, nameY);
}

function render() {
  requestAnimationFrame(render);
  if (!myMap) return;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1) 타일맵
  for (let j = 0; j < myMap.h; j++) {
    for (let i = 0; i < myMap.w; i++) {
      drawTile(i, j, myMap.tiles[j][i]);
    }
  }

  // 2) 플레이어들 (Y 순으로 정렬 — 아래쪽일수록 나중에 그림)
  const sorted = Object.entries(players).sort(
    ([, a], [, b]) => a.fj - b.fj
  );
  for (const [id, p] of sorted) {
    drawPlayer(p, id === myId);
  }
}
render();
