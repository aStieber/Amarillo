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

function emitGlobalRoomState() {
  io.emit('roomList', getActiveRooms());
}

function getActiveRooms() {
  return Object.entries(gameMap)
    .filter(([, game]) => !game.endGameObject)
    .map(([roomName, game]) => ({
      roomName,
      ownerName: game.players[0].name,
      roundCount: game.roundCount,
      playerCount: game.players.length,
      playerIDs: game.players.map(p => p.userID),
      isFreeColor: game.isFreeColor,
    })
  );
}

io.on('connection', (socket) => {
  function emitMessage(room, message, senderName) {
    console.log(room);
    io.in(room).emit('chatUpdate', {message: message, senderName});
  }

  socket.emit('roomList', getActiveRooms());

  // Create a new game room and notify the creator of game.
  socket.on('createGame', (data) => {
    let roomName = `r${++rooms}`;
    // In development, allow clients to choose room name
    if (process.env.NODE_ENV !== 'production' && data.room) {
      roomName = data.room;
    }
    socket.join(roomName);
    gameMap[roomName] = new Game(roomName, parseInt(data.boardSize));
    gameMap[roomName].init(data.freecolor);
    gameMap[roomName].addPlayer(data.name, data.userID);
    socket.emit('gameConnected', { name: data.name, room: roomName, userID: data.userID, chatlog: [] });

    gameMap[roomName].on('gameMessage', msg =>
    {
      console.log('message: ' + msg);
      emitMessage(roomName, msg, '');
    });

    chatlogMap[roomName] = [];
    if (data.freecolor) {
      let colorMsg = {senderName: '', message: "The Goose is Loose."};
      chatlogMap[roomName].push(colorMsg);
      emitMessage(roomName, colorMsg.message, colorMsg.senderName);
    }

    if (data.boardSize != 5)
    {
      let sizeMsg = {senderName: '', message: `Playing on a ${data.boardSize}x${data.boardSize} board.`};
      chatlogMap[roomName].push(sizeMsg);
      emitMessage(roomName, sizeMsg.message, sizeMsg.senderName);

      let scoreMsg = {senderName: '', message: `Rows: ${gameMap[roomName].getComboScores().rowScore} pts.
        Columns: ${gameMap[roomName].getComboScores().columnScore} pts.
        Color: ${gameMap[roomName].getComboScores().colorScore} pts.`};

      chatlogMap[roomName].push(scoreMsg);
      emitMessage(roomName, scoreMsg.message, scoreMsg.senderName);
    }


    let connMsg = {senderName: '', message: getConnectionMessage(data.name, roomName)};
    chatlogMap[roomName].push(connMsg);
    emitMessage(roomName, connMsg.message, connMsg.senderName);
    emitGlobalRoomState();
  });

  socket.on('joinGame', function (data) {
    if (!gameMap[data.room]) {
      console.log('joinGame failed, game does not exist.', data);
      return;
    }

    if (!io.nsps['/'].adapter.rooms[data.room]) {
      console.log('joinGame: game exists but socket room does not exist. rejoining anyway.', data);
    }
    socket.join(data.room);

    let hasGameStarted = gameMap[data.room].roundCount > -1;
    let isGameFull = gameMap[data.room].players.length > 3;
    //check if player is already in game
    let playerAlreadyInGame = gameMap[data.room].players.some(p => p.userID === data.userID);

    let isSpectator = false;

    if (playerAlreadyInGame) {
      let msgObject = {senderName: '', message: `${data.name} has reconnected to room '${data.room}'.`};
      chatlogMap[data.room].push(msgObject);
      emitMessage(data.room, msgObject.message, msgObject.senderName);
    }
    else if (!hasGameStarted && !isGameFull) {
      gameMap[data.room].addPlayer(data.name, data.userID);
      emitGlobalRoomState();

      let msgObject = {senderName: '', message: getConnectionMessage(data.name, data.room)};
      chatlogMap[data.room].push(msgObject);
      emitMessage(data.room, msgObject.message, msgObject.senderName);
    }
    else {
      isSpectator = true;
      console.log('joinGame: game is full or in progress. joining as spectator.', data);
      let msgObject = {senderName: '', message: `spectator ${data.name} connected to room '${data.room}'.`};
      chatlogMap[data.room].push(msgObject);
      emitMessage(data.room, msgObject.message, msgObject.senderName);
    }

    socket.emit('gameConnected', {
      name: data.name,
      room: data.room,
      userID: data.userID,
      chatlog: chatlogMap[data.room],
      isSpectator,
    });

    if (hasGameStarted) {
      socket.emit('gameUpdate', gameMap[data.room].getState()); //emit this only to reconnecter
    }
  });

  socket.on('startGame', function(data){
    gameMap[data.room].endTurn();
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
    emitGlobalRoomState();
  });


  socket.on('clientMove', (data) => {
    console.log('Received client move.');
    let turnMessage = gameMap[data.room].onClientMove(data);

    let msgObject = {senderName: '', message: turnMessage};
    chatlogMap[data.room].push(msgObject);
    emitMessage(data.room, msgObject.message, msgObject.senderName);
    const gameState = gameMap[data.room].getState();
    io.in(data.room).emit('gameUpdate', gameState);
    if (gameState.endGameObject) {
      emitGlobalRoomState();
    }
  });

  socket.on('pushphaseUpdate', (data) => {
    console.log('Received push phase update');
    gameMap[data.room].onPushUpdate(data.newPlayer);
    io.in(data.room).emit('gameUpdate', gameMap[data.room].getState());
  });

  //chat
  socket.on('msgSent', (data) => {
    console.log('msgSent', data);
    chatlogMap[data.room].push({senderName: data.senderName, message: data.message});
    emitMessage(data.room, data.message, data.senderName);
  });

});
let port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log('Listening on port: ' + port);
});
