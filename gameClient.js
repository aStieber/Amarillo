(function init() { 
  let g_gameState; //todo: use window.localstorage
  let g_clientPlayer;
  let g_isClientsTurn = false;
  let g_roomID;
  let g_userID;

  // const socket = io.connect('http://tic-tac-toe-realtime.herokuapp.com'),
  const socket = io.connect('http://localhost:5000');
  //generate random ID number for this browser and store it in a cookie.
  if (!Cookies.get('ID')) {
    Cookies.set('ID', Math.random().toString(36).substr(2, 9), {expires: 1000, path: ''}); 
  }
  g_userID = Cookies.get('ID');

  let g_turnStateMachine = new StateMachine({
    init: 'idle',
    transitions: [
      { name: 'beginTurn', from: '*',  to: 'fSelect' },
      { name: 'factorySelect', from: 'fSelect', to: 'plSelect' },
      { name: 'factoryUnselect', from: 'plSelect', to: 'fSelect' },
      { name: 'reset', from: '*', to: 'idle' }
    ],
    methods: {
      onBeginTurn: function() { 
        console.log("onBeginTurn");
        $('.tile').off('click');
        $('.factory .tile').on('click', element => {
          let tileType = element.target.attributes.type.value;
          let fIndex = element.target.attributes.factoryIndex.value;

          let selectedTiles;
          if (fIndex == -1) {
            selectedTiles = $('#communityPool').find('[type="' + tileType + '"]');
          }
          else {
            selectedTiles = $('#factories').children().eq(fIndex).find('[type="' + tileType + '"]');
          }
          //highlight selected type in factory;
          selectedTiles.toggleClass('selectedTile');

          let rowsToHighlight = [];
          for (let r = 0; r < 5; r++) {
            let tileCount = 0;
            let rowMatch = true;
            for (let c = 0; c < g_clientPlayer.patternLines[r].length; c++) {
              cell = g_clientPlayer.patternLines[r][c];
              if (cell === -1) continue;
              if (cell === tileType) tileCount++;
              else  {
                rowMatch = false;
                break;
              }
            };

            if (rowMatch && tileCount < (r + 1)) 
              rowsToHighlight.push({index: r, tileCount: tileCount});
          }

          rowsToHighlight.forEach(row => {
            $(`#patternLines .patternLine[patternlineindex="${row.index}"]`).children()
              .slice(row.tileCount, row.tileCount + selectedTiles.length)
              .attr('type', tileType)
              .toggleClass('option');
          });

          g_turnStateMachine.factorySelect();
        }); 
      },
      onFactorySelect: function() { 
        console.log('Factory selected.');
        $(".tile").off('click');
        $(".selectedTile").on('click', element => {
          g_turnStateMachine.factoryUnselect();
        }); 
        $('.option').on('click', element => {
          console.log('Pattern line selected.');
          $('.tile').off('click');
          let tileType = $(element.target).attr('type');
          let patternLineIndex = $(element.target.parentElement).attr('patternlineindex');
          let selectedCount = $('.placed.selectedTile').length;
          let highlightedCount = $(`.patternLine[patternlineindex=${patternLineIndex}] .option`).length;

          socket.emit('clientMove', { 
            factoryIndex: $('.selectedTile:first').attr('factoryindex'),
            floorLineCount: Math.max(selectedCount - highlightedCount, 0),
            tileType,
            targetRow: patternLineIndex,
            userID: g_userID,
            room: g_roomID
          });
        });
      },
      onFactoryUnselect: function() { 
        console.log('Factory unselected.') 
        $('.tile').off('click');
        $('.selectedTile').toggleClass('selectedTile');
        $('.tile.option').toggleClass('option');
        this.onBeginTurn();
      },
      onReset: function() {
        console.log("Turn statemachine reset.");
        $('.tile').off('click');
      }
    }
  });

  function updateFactories(factories) {
    $('.factories').empty();
    let i = 0;
    factories.forEach(factory => {
      factory.sort();
      let newDiv = `<div class="factory flex-container">`
      factory.forEach(tile => {
        newDiv += `<div 
          class="tile placed" 
          type="${tile}" 
          enabled="${g_isClientsTurn.toString()}" 
          factoryIndex="${i}"></div>
        `
      });
      newDiv += '</div>';
      $('.factories').append(newDiv);
      i++;
    });
  }

  function updateCommunityPool(pool) {
    pool.sort();
    $('#communityPool').remove();
    let newDiv = '<div id="communityPool" class="communityPool factory flex-container" factoryIndex="-1">'
    pool.forEach(tile => {
      newDiv += `<div class="tile placed" type="${tile}" draggable="${g_isClientsTurn.toString()}" factoryIndex="-1"></div>`
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
          patternLinesHTML += `<div class="tile${tileType !== -1 ? ' placed' : ""}" type="${tileType}"></div>`;
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
          wallHTML += `<div class="tile walltile" type="${t%5}" occupied=${tileType >= 0}></div>`;
          t++
        });
        wallHTML += '</div>';
        t++
      });
      //floor line
      const floorLineText = ['-1', '-1', '-2', '-2', '-2', '-3', '-3'];
      let floorLineHTML = '';
      for (let f = 0; f < 7; f++) {
        let tile = (player.floorLine.length > f) ? player.floorLine[f] : -1;
        floorLineHTML += `<div class="tile placed floorLineTile" type="${tile}">${floorLineText[f]}</div>`;
      }

      //final product
      var newPlayerMatHTML = `
        <div class="playerMat">
          <div class="scoreboard">
            ${player.name}<br/>
            ${player.score} Points
          </div>
          <div id="tileSection">
            <div id="patternLines">
              ${patternLinesHTML}
            </div>
            <div id="wall">
              ${wallHTML}
            </div>
          </div>
          <div id="floorLine">
            ${floorLineHTML}
          </div>
        </div>
      `

      $('.playerMats').append(newPlayerMatHTML);
      if (g_userID === player.userID) {

      }
    });    
  }

  $('#endTurn').on('click', () => {
    socket.emit('debugEndTurn', { room: g_roomID });
  });

  // Create a new game. Emit newGame event.
  $('#createGame').on('click', () => {
    name = $('#nameInput').val();
    if (!name) {
      name = "Nameless Buffoon";
    }
    socket.emit('createGame', { name: name, userID: g_userID });
  });

  //Start a created game.
  $('#startGame').on('click', () => {
    socket.emit('startGame', {room: g_roomID});
  });

  // Join an existing game on the entered roomID. Emit the joinGame event.
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
    g_roomID = data.room;
    const message = `Connected to ${data.room} as ${data.name}.`;
    $('#statusSpan').text(message);
    $('#nameInput').hide();
    $('#createGame').hide();
    $('#startGame').show();
  });

  socket.on('gameUpdate', (data) => {
    g_gameState = data;
    $('#menuButtons').hide();

    g_gameState.players.forEach(player => {
      if (player.userID === g_userID) {
        g_clientPlayer = player;
      }
    });
    g_isClientsTurn = g_gameState.currentTurnUserID === g_userID;

    updateFactories(data.factories);
    updateCommunityPool(data.communityPool);
    updatePlayerMats(data.players, data.wallOffset);

    if (g_isClientsTurn) {
      g_turnStateMachine.beginTurn();
    }

  });
}());