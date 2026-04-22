const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const chatHistory = [];
const MAX_CHAT_HISTORY = 50;

io.on('connection', (socket) => {
  console.log('접속:', socket.id);
  const nickname = '나그네' + Math.floor(Math.random() * 1000);
  players[socket.id] = {
    x: 250,
    y: 250,
    color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
    nickname: nickname
  };
  
  socket.emit('init', { id: socket.id, players, chatHistory });
  socket.broadcast.emit('playerJoined', { id: socket.id, data: players[socket.id] });
  
  // 접속 시스템 메시지
  const joinMsg = {
    type: 'system',
    text: `${nickname}님이 접속했습니다`,
    time: Date.now()
  };
  chatHistory.push(joinMsg);
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
  io.emit('chat', joinMsg);

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      io.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
    }
  });

  socket.on('chat', (text) => {
    if (typeof text !== 'string') return;
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    if (!players[socket.id]) return;
    
    const msg = {
      type: 'chat',
      nickname: players[socket.id].nickname,
      color: players[socket.id].color,
      text: trimmed,
      time: Date.now()
    };
    chatHistory.push(msg);
    if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
    io.emit('chat', msg);
  });

  socket.on('nickname', (name) => {
    if (typeof name !== 'string') return;
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    if (!players[socket.id]) return;
    
    const oldName = players[socket.id].nickname;
    players[socket.id].nickname = trimmed;
    
    const sysMsg = {
      type: 'system',
      text: `${oldName}님이 ${trimmed}(으)로 이름을 바꿨습니다`,
      time: Date.now()
    };
    chatHistory.push(sysMsg);
    if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
    io.emit('chat', sysMsg);
    io.emit('playerRenamed', { id: socket.id, nickname: trimmed });
  });

  socket.on('disconnect', () => {
    console.log('퇴장:', socket.id);
    const leftNick = players[socket.id] ? players[socket.id].nickname : '누군가';
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    
    const leaveMsg = {
      type: 'system',
      text: `${leftNick}님이 퇴장했습니다`,
      time: Date.now()
    };
    chatHistory.push(leaveMsg);
    if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
    io.emit('chat', leaveMsg);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('서버 시작 포트:', PORT);
});
