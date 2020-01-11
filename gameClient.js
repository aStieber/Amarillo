/* global Cookies, io, StateMachine, $*/

(function init() { 
  let g_gameState; //todo: use window.localstorage
  let g_clientPlayer;
  let g_isClientsTurn = false;
  let g_roomID;
  let g_userID;

  // use query params as dev flags
  let params = new URLSearchParams(document.location.search);
  let devEnabled = params.get('dev') !== "0" && !!params.get('dev');
  let devRoomID = params.get('roomID');
  let devUserID = params.get('userID');
  let devIsHost = params.get('isHost');

  // const socket = io.connect('http://tic-tac-toe-realtime.herokuapp.com'),
  const socket = io.connect();
  //generate random ID number for this browser and store it in a cookie.
  if (!Cookies.get('ID')) {
    Cookies.set('ID', Math.random().toString(36).substr(2, 9), {expires: 1000, path: ''}); 
  }
  g_userID = (devEnabled && devUserID) || Cookies.get('ID');

  if (devEnabled && devRoomID && devUserID) {
    let name = 'p' + devUserID;
    socket.on('connect', () => {
      if (devIsHost) {
        socket.emit('createGame', { name, room: devRoomID, userID: g_userID });
      } else {
        socket.emit('joinGame', { name, room: devRoomID, userID: g_userID});
      }
    });
  }

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
          let tileType = parseInt(element.target.attributes.type.value);
          let fIndex = parseInt(element.target.attributes.factoryIndex.value);

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
              let cell = parseInt(g_clientPlayer.patternLines[r][c]);
              if (cell === -1) continue;
              if (cell === tileType) tileCount++;
              else  {
                rowMatch = false;
                break;
              }
            }

            let wallClear = true;
            for (let i in g_clientPlayer.wall[r]) {
              if (tileType === g_clientPlayer.wall[r][i])
              {
                wallClear = false;
                break;
              }
            }

            if (rowMatch && tileCount < (r + 1) && wallClear) 
              rowsToHighlight.push({index: r, tileCount: tileCount});
          }


          rowsToHighlight.forEach(row => {
            $(`.playerMat[user=${g_userID}] #patternLines .patternLine[patternlineindex="${row.index}"]`).children()
              .slice(row.tileCount, row.tileCount + selectedTiles.length)
              .attr('type', tileType)
              .toggleClass('option');
          });

          //additionally, select the appropriate amount of floor lines (always an option)
          $(`.playerMat[user=${g_userID}] #floorLine .tile[type="-1"]`)
              .slice(0, selectedTiles.length)
              .attr('type', tileType)
              .toggleClass('option');

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
          $('.tile').off('click');

          let tileType = $(element.target).attr('type');
          let patternLineIndex = 0;
          let selectedCount = 0;
          let highlightedCount = 0;
          //handle floor line a lil differently
          if ($(element.target).parent().attr('id') === 'floorLine') {
            console.log('Floor line selected.');
            patternLineIndex = -1;
            selectedCount = $(`#floorLine .option`).length;
          }
          else { //regular pattern line
            console.log('Pattern line selected.');
            selectedCount = $('.placed.selectedTile').length;
            patternLineIndex = $(element.target.parentElement).attr('patternlineindex');
            highlightedCount = $(`.patternLine[patternlineindex=${patternLineIndex}] .option`).length;
          }


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
        console.log('Factory unselected.');
        $('.tile').off('click');
        $('.selectedTile').toggleClass('selectedTile');
        $('#floorLine .tile.option').attr('type', -1);
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
      let newDiv = `<div class="factory flex-container">`;
      factory.forEach(tile => {
        newDiv += `<div 
          class="tile placed" 
          type="${tile}" 
          enabled="${g_isClientsTurn.toString()}" 
          factoryIndex="${i}"></div>
        `;
      });
      newDiv += '</div>';
      $('.factories').append(newDiv);
      i++;
    });
  }

  function updateCommunityPool(pool) {
    pool.sort();
    $('#communityPool').remove();
    let newDiv = `<div id="communityPool" class="communityPool factory flex-container" factoryIndex="-1" grabbed="${g_gameState.communityPoolFirstTakeUserID != ''}">`;
    pool.forEach(tile => {
      newDiv += `<div class="tile placed" type="${tile}" draggable="${g_isClientsTurn.toString()}" factoryIndex="-1"></div>`;
    });
    newDiv += '</div>';
    $('#centerBoard').append(newDiv);
  }

  function updatePlayerMats(players, wallOffset=0) {
    $('.playerMat').remove();
    let turnOrder = 1;
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
          t++;
        });
        wallHTML += '</div>';
        t++;
      });
      //floor line
      const floorLineText = ['-1', '-1', '-2', '-2', '-2', '-3', '-3'];
      let floorLineHTML = '';
      for (let f = 0; f < 7; f++) {
        let floorTilePlaced = (player.floorLine.length > f);
        let tile =  floorTilePlaced ? player.floorLine[f] : -1;
        floorLineHTML += `<div class="tile${floorTilePlaced ? ' placed' : ''}" type="${tile}">${floorLineText[f]}</div>`;
      }

      //final product
      var newPlayerMatHTML = `
        <div class="playerMat" user="${player.userID}" isTurn="${g_gameState.currentTurnUserID === player.userID}">
          <div class="topLine">
            <div class="scoreboard">
              ${player.name}<br/>
              ${player.score} Points
            </div>
            <div class="playerTurn">${turnOrder}</div>
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
      `;
      turnOrder++;      
      if (g_userID === player.userID) {
        $('.playerMats').prepend(newPlayerMatHTML);
      }
      else {
        $('.opponentMats').append(newPlayerMatHTML);
      }
    });    

    // When we transform-scale down the opponent mats, apply this hack to remove whitespace
    if (!$('.opponentMatsWrapper').hasClass('transform-hack-applied')) {
      let width = $('.opponentMats').width();
      let height = $('.opponentMats').height();
      $('.opponentMats').width(width).height(height);
      $('.opponentMatsWrapper').width(width * 0.6).height(height * 0.6).addClass('transform-hack-applied');
    }
  }

  function onEndGame(endGameList) {
    $('.factories').hide();
    $('#communityPool').hide();
        
    let gridHTML = `
      <table class="endGameTable">
        <tr>
          <th>Name</th>
          <th>Ending Score</th>
          <th>Rows Completed</th>
          <th>Columns Completed</th>
          <th>Colors Completed</th>
          <th>Final Score</th>
        </tr>
    `; 
    endGameList.forEach(obj => {
      let finalScore = obj.endingScore + (obj.numRowsCompleted * 2) + (obj.numColumnsCompleted * 7) + (obj.numColorsCompleted * 10);
      gridHTML += `
        <tr>
          <th>${obj.name}</th>
          <th>${obj.endingScore}</th>
          <th>${obj.numRowsCompleted}</th>
          <th>${obj.numColumnsCompleted}</th>
          <th>${obj.numColorsCompleted}</th>
          <th>${finalScore}</th>
        </tr>
      `;
    });
    gridHTML += '</table>';

    $('#centerBoard').append(gridHTML);
  }

  $('#endTurn').on('click', () => {
    socket.emit('debugEndTurn', { room: g_roomID });
  });

  // Create a new game. Emit newGame event.
  $('#createGame').on('click', () => {
    let name = $('#nameInput').val();
    if (!name) name = "Nameless Buffoon";
    socket.emit('createGame', { name: name, userID: g_userID });
  });

  //Start a created game.
  $('#startGame').on('click', () => {
    socket.emit('startGame', {room: g_roomID});
  });

  // Join an existing game on the entered roomID. Emit the joinGame event.
  $('#joinGame').on('click', () => {
    let name = $('#nameInput').val();
    if (!name) name = "Nameless Buffoon";
    let roomID = prompt("Please enter the room ID you with to join. Example: r1");
    if (!roomID)
    {
      alert('Please enter a roomID.');
      return;
    }
    socket.emit('joinGame', { name, room: roomID, userID: g_userID});
  });

  socket.on('gameConnected', (data) => {
    console.log('gameConnected'+  data);
    g_roomID = data.room;
    applyChatlog(data.chatlog);
    $('#nameInput').hide();
    $('#createGame').hide();
    $('#joinGame').hide();
    $('#startGame').show();
  });

  socket.on('gameUpdate', (data) => {
    g_gameState = data;
    $('#menuButtons').hide();
    $('.textEntry').show();
    if (data.endGameObject) {
      onEndGame(data.endGameObject);
    }

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
      document.getElementById('turnAlert').play();
      g_turnStateMachine.beginTurn();
    }

  });

  function applyChatlog(chatlog) {
    $('#messages li').remove();
    for (let m in chatlog) {
      addChatMessage(chatlog[m].senderName, chatlog[m].message);
    }
  }

  function addChatMessage(senderName, message) {
    if (senderName === '') {
      $('#messages').append($('<li>').text(`${message}`).addClass('serverMessage'));
    }
    else {
      $('#messages').append($('<li>').text(
        `${senderName}: ${message}`
      ));
    }
  } 

  socket.on('chatUpdate', (data) => {
    addChatMessage(data.senderName, data.message);    
  });

  function emitMessage(msg) {
    if (msg.length > 0) {
      socket.emit('msgSent', {room: g_roomID, message: msg.slice(0, 150), senderName: g_clientPlayer.name});
      $('#chatInput').val('');
    }
  }

  $('.textEntry').submit(function(e){
    e.preventDefault(); // prevents page reloading
    emitMessage($('#chatInput').val());
    return false;
  });

  $('#chatInput').keydown(function() {
    if (event.keyCode == 13) { //enter
      emitMessage($('#chatInput').val());
    }
  });


}());
