/* global require, __dirname, process */
const { Game } = require('./gameServer');

const express = require('express');
const sassMiddleware = require('node-sass-middleware');
const path = require('path');

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

let rooms = 0;

// https://github.com/sass/node-sass-middleware#express-example
app.use(sassMiddleware({
  src: __dirname,
  dest: path.join(__dirname, 'css'),
  // debug: true,
  outputStyle: 'compressed',
  prefix: '/css', // Where prefix is at <link rel="stylesheets" href="prefix/style.css"/>
}));
app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

let gameMap = {};

io.on('connection', (socket) => {

  socket.on('debugEndTurn', (data) => {
    gameMap[data.room].endTurn();
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });

  // Create a new game room and notify the creator of game.
  socket.on('createGame', (data) => {
    let roomName = `r${++rooms}`;
    socket.join(roomName);
    gameMap[roomName] = new Game(roomName);
    gameMap[roomName].addPlayer(data.name, data.userID);
    socket.emit('gameConnected', { name: data.name, room: roomName, userID: data.userID });
  });

  // Connect the Player 2 to the room he requested. Show error if room full.
  socket.on('joinGame', function (data) {
    var room = io.nsps['/'].adapter.rooms[data.room];
    if (room && gameMap[data.room].roundCount === -1 && room.length < 3) { //room exists and game hasn't started yet and <4 players
      socket.join(data.room);
      gameMap[data.room].addPlayer(data.name, data.userID);
      io.in(data.room).emit('gameConnected', { name: data.name, room: data.room, userID: data.userID });
    } else {
      socket.emit('err', { message: 'Sorry, The room is full!' });
    }
  });

  socket.on('startGame', function(data){
    //decide who goes first
    gameMap[data.room].endTurn();
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });


  socket.on('clientMove', (data) => {
    console.log('Received client move.');
    gameMap[data.room].onClientMove(data);
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });

  socket.on('gameEnded', (data) => {
    socket.broadcast.to(data.room).emit('gameEnd', data);
  });
});

server.listen(process.env.PORT || 5000);
