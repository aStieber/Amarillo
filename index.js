require('./gameServer.js')();

const express = require('express');
const path = require('path');

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

let rooms = 0;

app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

let gameMap = {};

io.on('connection', (socket) => {

  // Create a new game room and notify the creator of game.
  socket.on('createGame', (data) => {
    let roomName = `room-${++rooms}`;
    socket.join(roomName);
    gameMap[roomName] = new Game(roomName, 2);
    gameMap[roomName].addPlayer(data.name, data.userID);
    socket.emit('gameCreated', { name: data.name, room: roomName });
  });

  // Connect the Player 2 to the room he requested. Show error if room full.
  socket.on('joinGame', function (data) {
    var room = io.nsps['/'].adapter.rooms[data.room];
    if (room && room.length === 1) {
      socket.join(data.room);
      socket.broadcast.to(data.room).emit('player1', {});
      socket.emit('player2', { name: data.name, room: data.room })
    } else {
      socket.emit('err', { message: 'Sorry, The room is full!' });
    }
  });

  socket.on('startGame', function(data){
    //decide who goes first
    gameMap[data.room].endTurn();
    socket.emit('gameUpdate', gameMap[data.room].getState());
  });


  socket.on('clientMove', (data) => {
    console.log('Received client move.');
    gameMap[data.room].onClientMove(data);
    socket.emit('gameUpdate', gameMap[data.room].getState());
  });

  socket.on('playTurn', (data) => {
    socket.broadcast.to(data.room).emit('turnPlayed', {
      tile: data.tile,
      room: data.room
    });
  });


  socket.on('gameEnded', (data) => {
    socket.broadcast.to(data.room).emit('gameEnd', data);
  });
});

server.listen(process.env.PORT || 5000);
