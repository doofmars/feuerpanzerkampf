// ============================================================
// Feuerpanzerkampf - Multiplayer Artillery Server
// Express + Socket.io relay for remote multiplayer
// ============================================================

'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// rooms: Map<code, { players: PlayerEntry[], started: bool }>
const rooms = new Map();

function genCode() {
  let c;
  do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); }
  while (rooms.has(c));
  return c;
}

io.on('connection', socket => {
  console.log('+ connect', socket.id);

  // ── Create room ──────────────────────────────────────────────
  socket.on('createRoom', ({ playerName, numLocalPlayers }, cb) => {
    const code = genCode();
    rooms.set(code, {
      players: [{ socketId: socket.id, name: playerName,
                  numLocalPlayers, isHost: true, idx: 0 }],
      started: false
    });
    socket.join(code);
    socket.roomCode = code;
    socket.isHost   = true;
    socket.pIdx     = 0;
    cb({ ok: true, code, idx: 0, players: rooms.get(code).players });
    console.log('room', code, 'created by', playerName);
  });

  // ── Join room ─────────────────────────────────────────────────
  socket.on('joinRoom', ({ code, playerName, numLocalPlayers }, cb) => {
    const room = rooms.get(code);
    if (!room)          return cb({ ok: false, err: 'Room not found' });
    if (room.started)   return cb({ ok: false, err: 'Game already started' });
    if (room.players.length >= 4)
                        return cb({ ok: false, err: 'Room is full (max 4 connections)' });

    const idx = room.players.length;
    room.players.push({ socketId: socket.id, name: playerName,
                        numLocalPlayers, isHost: false, idx });
    socket.join(code);
    socket.roomCode = code;
    socket.isHost   = false;
    socket.pIdx     = idx;

    io.to(code).emit('playerJoined', { players: room.players });
    cb({ ok: true, code, idx, players: room.players });
    console.log(playerName, 'joined', code);
  });

  // ── Host starts game ──────────────────────────────────────────
  socket.on('startGame', data => {
    if (!socket.isHost) return;
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    room.started = true;
    io.to(socket.roomCode).emit('gameStart', data);
  });

  // ── Relay generic game events ─────────────────────────────────
  // Client sends { type, ... } events; server broadcasts to all others
  socket.on('gameEvent', evt => {
    if (socket.roomCode)
      socket.to(socket.roomCode).emit('gameEvent', evt);
  });

  // ── Host pushes terrain diff ──────────────────────────────────
  socket.on('terrainDiff', data => {
    if (socket.isHost && socket.roomCode)
      socket.to(socket.roomCode).emit('terrainDiff', data);
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code) {
      const room = rooms.get(code);
      if (room) {
        room.players = room.players.filter(p => p.socketId !== socket.id);
        if (room.players.length === 0) {
          rooms.delete(code);
          console.log('room', code, 'deleted');
        } else {
          io.to(code).emit('playerLeft', { socketId: socket.id });
        }
      }
    }
    console.log('- disconnect', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Feuerpanzerkampf running on http://localhost:${PORT}`)
);
