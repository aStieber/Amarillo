(function init() {
  let game;
  let roomID;
  let userID;

  // const socket = io.connect('http://tic-tac-toe-realtime.herokuapp.com'),
  const socket = io.connect('http://localhost:5000');
  //generate random ID number for this browser and store it in a cookie.
  if (!Cookies.get('ID')) {
    Cookies.set('ID', Math.random().toString(36).substr(2, 9), {expires: 1000, path: ''}); 
  }
  userID = Cookies.get('ID');

  function updateFactories(factories) {
    $('.factories').empty();
    factories.forEach(factory => {
      factory.sort();
      let newDiv = '<div class="factory flex-container">'
      factory.forEach(tile => {
        newDiv += `<div class="tile" type="${tile}"></div>`
      });
      newDiv += '</div>'
      $('.factories').append(newDiv);
    });
  }

  $('#doStuff').on('click', () => {
    $('#mat').load("playerMat.html");
    game = new Game("arst");//new Game(data.room);
    game.displayBoard();
  });

  $('#setTiles').on('click', () => {
    let i =0;
    //iterate through wall, build colors
    $('#playerWall').children().each(function (){
      $(this).children().each(function (){
        $(this).attr("type", i % 5);
        i++;
      });
      i++;
    });
  });

  // Create a new game. Emit newGame event.
  $('#createGame').on('click', () => {
    name = $('#nameInput').val();
    if (!name) {
      name = "Nameless Buffoon";
    }
    socket.emit('createGame', { name, userID });
  });

  //Start a created game.
  $('#startGame').on('click', () => {
    socket.emit('startGame', {room: roomID});
  });


  // Join an existing game on the entered roomId. Emit the joinGame event.
  $('#join').on('click', () => {
    const name = $('#nameJoin').val();
    const roomID = $('#room').val();
    if (!name || !roomID) {
      alert('Please enter your name and game ID.');
      return;
    }
    socket.emit('joinGame', { name, room: roomID });
    player = new Player(name, P2);
  });

  socket.on('gameCreated', (data) => {
    roomID = data.room;
    const message = `Connected to ${data.room} as ${data.name}.`;
    $('#statusSpan').text(message);
    $('#nameInput').hide();
    $('#createGame').hide();
    $('#startGame').show();
  });

  socket.on('gameUpdate', (data) => {
    updateFactories(data.factories);
  });
  /**
	 * Opponent played his turn. Update UI.
	 * Allow the current player to play now. 
	 */
  socket.on('turnPlayed', (data) => {
    const row = data.tile.split('_')[1][0];
    const col = data.tile.split('_')[1][1];
    const opponentType = player.getPlayerType() === P1 ? P2 : P1;

    game.updateBoard(opponentType, row, col, data.tile);
    player.setCurrentTurn(true);
  });

  // If the other player wins, this event is received. Notify user game has ended.
  socket.on('gameEnd', (data) => {
    game.endGame(data.message);
    socket.leave(data.room);
  });

  /**
	 * End the game on any err event. 
	 */
  socket.on('err', (data) => {
    game.endGame(data.message);
  });
}());
