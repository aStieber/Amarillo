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
        newDiv += `<div class="tile" type="${tile}" draggable="true"></div>`
      });
      newDiv += '</div>'
      $('.factories').append(newDiv);
    });
  }

  function updateCommunityPool(pool) {
    pool.sort();
    $('#communityPool').remove();
    let newDiv = '<div id="communityPool" class="communityPool factory flex-container">'
    pool.forEach(tile => {
      newDiv += `<div class="tile" type="${tile}"></div>`
    });
    newDiv += '</div>'
    $('.factories').append(newDiv);
  }

  function updatePlayerMats(players, wallOffset=0) {
    $('.playerMat').remove();
    players.forEach(player => {
      //order?

      //patternLines
      let patternLinesHTML = '';
      player.patternLines.forEach(patternLine => {
        patternLinesHTML += `<div class="patternLine">`;
        patternLine.forEach(tileType => {
          patternLinesHTML += `<div class="tile" type="${tileType}"></div>`;
        });
        patternLinesHTML += '</div>';
      });
      //wall
      let wallHTML = '';
      let t = wallOffset;
      player.wall.forEach(wallLine => {
        wallHTML += `<div class="patternLine">`;
        wallLine.forEach(tileType => {
          wallHTML += `<div class="tile" type="${t%5}" occupied=${tileType >= 0}></div>`;
          t++
        });
        wallHTML += '</div>';
        t++
      });

      //final product
      var newPlayerMatHTML = `
        <div class="playerMat">
          <div class="scoreboard">
            Name: ${player.name}
            Score: ${player.score}
          </div>
          <div id="tileSection">
            <div id="patternLines">
              ${patternLinesHTML}
            </div>
            <div id="wall">
              ${wallHTML}
            </div>
          </div>
        </div>
      `

      $('.playerMats').append(newPlayerMatHTML);
      if (userID === player.userID) {

      }
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
    updateCommunityPool(data.communityPool);
    updatePlayerMats(data.players, data.wallOffset);
  });
}());
