(function init() {
  let currentGameState;
  let roomID;
  let userID;

  // const socket = io.connect('http://tic-tac-toe-realtime.herokuapp.com'),
  const socket = io.connect('http://localhost:5000');
  //generate random ID number for this browser and store it in a cookie.
  if (!Cookies.get('ID')) {
    Cookies.set('ID', Math.random().toString(36).substr(2, 9), {expires: 1000, path: ''}); 
  }
  userID = Cookies.get('ID');

  //D&D
  document.addEventListener('dragstart', function(event) {
    console.log('started drag')
    event.dataTransfer.setData('Text', JSON.stringify({
      factoryIndex: event.target.parentElement.attributes.factoryIndex.value,
      tileType: event.target.attributes.type.value
    }));
  });

  document.addEventListener('dragenter', function(event) {
    if ( event.target.classList.contains('droptarget') ) {
      event.target.style.border = '2px dotted red';
    }
  });

  document.addEventListener('dragover', function(event) {
    event.preventDefault();
  });

  document.addEventListener('dragleave', function(event) {
    if (event.target.classList.contains('droptarget')) {
      event.target.style.border = '';
    }
  });

  document.addEventListener('drop', function(event) {
  event.preventDefault();
  if (event.target.classList.contains('droptarget')) {
    event.target.style.border = '';
    var data = JSON.parse(event.dataTransfer.getData('Text'));
    if (data.factoryIndex === null || data.tileType === null) return;
    console.log('arst');
    socket.emit('clientMove', {
      room: roomID,
      targetRow: event.target.parentElement.attributes.patternLineIndex.value,
      userID: userID,
      ...data
    });
  }
});

  function updateFactories(factories, isClientsTurn=false) {
    $('.factories').empty();
    let i = 0;
    factories.forEach(factory => {
      factory.sort();
      let newDiv = `<div class="factory flex-container" factoryIndex="${i}">`
      factory.forEach(tile => {
        newDiv += `<div class="tile" type="${tile}" draggable="${isClientsTurn.toString()}"></div>`
      });
      newDiv += '</div>'
      $('.factories').append(newDiv);
      i++;
    });
  }

  function updateCommunityPool(pool, isClientsTurn=false) {
    pool.sort();
    $('#communityPool').remove();
    let newDiv = '<div id="communityPool" class="communityPool factory flex-container" factoryIndex="-1">'
    pool.forEach(tile => {
      newDiv += `<div class="tile" type="${tile}" draggable="${isClientsTurn.toString()}"></div>`
    });
    newDiv += '</div>'
    $('#centerBoard').append(newDiv);
  }

  function updatePlayerMats(players, wallOffset=0) {
    $('.playerMat').remove();
    players.forEach(player => {
      //order?

      //patternLines
      let patternLinesHTML = '';
      let i = 0;
      player.patternLines.forEach(patternLine => {
        patternLinesHTML += `<div class="patternLine" patternLineIndex="${i}">`;
        patternLine.forEach(tileType => {
          let classList = 'tile';
          if (tileType == -1) classList += ' droptarget';
          patternLinesHTML += `<div class="${classList}" type="${tileType}"></div>`;
        });
        patternLinesHTML += '</div>';
        i++;
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
    currentGameState = data;

    let isClientsTurn = true;
    data.players.forEach(player => {
      isClientsTurn |= (player.userID === userID);
    });
    updateFactories(data.factories, isClientsTurn);
    updateCommunityPool(data.communityPool, isClientsTurn);
    updatePlayerMats(data.players, data.wallOffset);
  });
}());
