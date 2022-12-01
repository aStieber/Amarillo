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

app.get('/latest_room', (req, res) => {
  if (rooms) {
    res.json({id: `r${rooms}`});
  } else {
    res.status(404).end();
  }
});

function getConnectionMessage(name, room) {
  return `${name.slice(0, 20).replace(/\W/g, '')} connected to room '${room}'.`;
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
    // In development, allow clients to choose room name
    if (process.env.NODE_ENV !== 'production' && data.room) {
      roomName = data.room;
    }
    socket.join(roomName);
    gameMap[roomName] = new Game(roomName);
    gameMap[roomName].init(data.freecolor);
    gameMap[roomName].addPlayer(data.name, data.userID);
    socket.emit('gameConnected', { name: data.name, room: roomName, userID: data.userID, chatlog: [] });

    chatlogMap[roomName] = [];
    if (data.freecolor) {
      let colorMsg = {senderName: '', message: "The Goose is Loose."};
      chatlogMap[roomName].push(colorMsg);
      emitMessage(roomName, colorMsg.message, colorMsg.senderName);
    }
    let connMsg = {senderName: '', message: getConnectionMessage(data.name, roomName)};
    chatlogMap[roomName].push(connMsg);
    emitMessage(roomName, connMsg.message, connMsg.senderName);
  });

  // Connect the Player 2 to the room he requested. Show error if room full.
  socket.on('joinGame', function (data) {
    var room = io.nsps['/'].adapter.rooms[data.room];

    if (room && gameMap[data.room].players.length <= 4) { //room exists and <4 players
      socket.join(data.room);
      let hasGameStarted = gameMap[data.room].roundCount > -1;
      //check if player is already in game
      let playerAlreadyInGame = gameMap[data.room].players.some(p => p.userID === data.userID);

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
    gameMap[data.room].endTurn();
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });


  socket.on('clientMove', (data) => {
    console.log('Received client move.');
    let turnMessage = gameMap[data.room].onClientMove(data);

    let msgObject = {senderName: '', message: turnMessage};
    chatlogMap[data.room].push(msgObject);
    emitMessage(data.room, msgObject.message, msgObject.senderName);
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });

  socket.on('pushphaseUpdate', (data) => {
    console.log('Received push phase update');
    gameMap[data.room].onPushUpdate(data.newPlayer);
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });

  //chat
  socket.on('msgSent', (data) =>{
    console.log(data.message);
    chatlogMap[data.room].push({senderName: '', message: data.message});
    emitMessage(data.room, data.message, data.senderName);
  });

});
let port = process.env.PORT || 5000;
console.log('Listening on port: ' + port);
server.listen(port);