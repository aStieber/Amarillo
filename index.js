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

function getConnectionMessage(name, room) {
  return `${name} connected to room '${room}'.`;
}

let gameMap = {};
let chatlogMap = {};

io.on('connection', (socket) => {
  function emitMessage(room, message, senderName) {
    io.in(room).emit('chatUpdate', {message: message, senderName});
  }


  // Create a new game room and notify the creator of game.
  socket.on('createGame', (data) => {
    let roomName = `r${++rooms}`;
    socket.join(roomName);
    gameMap[roomName] = new Game(roomName);
    gameMap[roomName].addPlayer(data.name, data.userID);
    socket.emit('gameConnected', { name: data.name, room: roomName, userID: data.userID, chatlog: [] });

    let msgObject = {senderName: '', message: getConnectionMessage(data.name, roomName)};
    chatlogMap[roomName] = [msgObject];
    emitMessage(roomName, msgObject.message, msgObject.senderName);
  });

  // Connect the Player 2 to the room he requested. Show error if room full.
  socket.on('joinGame', function (data) {
    var room = io.nsps['/'].adapter.rooms[data.room];

    if (room && gameMap[data.room].players.length <= 4) { //room exists and <4 players
      socket.join(data.room);
      let hasGameStarted = gameMap[data.room].roundCount > -1;
      //check if player is already in game
      let playerAlreadyInGame = false;
      for (let playerIndex in gameMap[data.room].players) {
        if (gameMap[data.room].players[playerIndex].userID === data.userID) {
          playerAlreadyInGame = true;
          break;
        }
      }
      if (playerAlreadyInGame) {
        io.in(data.room).emit('gameConnected', { name: data.name, room: data.room, userID: data.userID, chatlog: chatlogMap[data.room] });
        let msgObject = {senderName: '', message: `${data.name} has reconnected to room '${data.room}'.`};
        chatlogMap[data.room].push(msgObject);
        emitMessage(data.room, msgObject.message, msgObject.senderName);
        if (hasGameStarted) { 
          socket.emit('gameUpdate', gameMap[data.room].getState()); //emit this only to reconnecter
        }
      }
      else if (!hasGameStarted) {
        gameMap[data.room].addPlayer(data.name, data.userID);
        io.in(data.room).emit('gameConnected', { name: data.name, room: data.room, userID: data.userID, chatlog: chatlogMap[data.room] });

        let msgObject = {senderName: '', message: getConnectionMessage(data.name, data.room)};
        chatlogMap[data.room].push(msgObject);
        emitMessage(data.room, msgObject.message, msgObject.senderName);
      }
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

  //chat
  socket.on('msgSent', (data) =>{
    console.log(data.message);
    chatlogMap[data.room].push({senderName: '', message: data.message});
    emitMessage(data.room, data.message, data.senderName);
  });

});

server.listen(process.env.PORT || 5000);
