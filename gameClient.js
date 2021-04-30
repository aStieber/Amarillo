/* global Cookies, io, StateMachine, $*/

(function init() { 
  let g_gameState; //todo: use window.localstorage
  let g_clientPlayer;
  let g_roomID;
  let g_userID;

  // use query params as dev flags
  let params = new URLSearchParams(document.location.search);
  let devEnabled = params.get('dev') !== "0" && !!params.get('dev');
  let devRoomID = params.get('roomID');
  let devUserID = params.get('userID');
  let devIsHost = params.get('isHost');

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
          //if the floorline is full, make trash can available
          if ($(`.playerMat[user=${g_userID}] #floorLine .tile[type="-1"]`).length === 0) {
            $(`.playerMat[user=${g_userID}] #floorLineTrashCan`)
              .attr('type', tileType)
              .toggleClass('option')
              .removeClass('hidden');
          }
          else {
            $(`.playerMat[user=${g_userID}] #floorLine .tile[type="-1"]`)
              .slice(0, selectedTiles.length)
              .attr('type', tileType)
              .toggleClass('option');
          }


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

          let tileType = $('.selectedTile').attr('type');
          let patternLineIndex = 0;
          let selectedCount = 0;
          let highlightedCount = 0;
          //handle floor line a lil differently
          let isTrashCan = $(element.target).attr('id') === 'floorLineTrashCan' || $(element.target).attr('id') === 'tcText';
          if (isTrashCan) {
            patternLineIndex = -1;
            selectedCount = 1; //just needs to be > 0
          }
          else if ($(element.target).parent().attr('id') === 'floorLine') {
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
        $('#floorLineTrashCan').attr('type', -1).addClass('hidden');
        $('.tile.option').toggleClass('option');
        this.onBeginTurn();
      },
      onReset: function() {
        console.log("Turn statemachine reset.");
        $('.tile').off('click');
      }
    }
  });
  
  let g_editedPlayer; 
  let g_wallStateMachine = new StateMachine({
    init: 'idle',
    transitions: [
      { name: 'pushStep', from: '*',  to: 'plSelect' },
      { name: 'reset', from: '*', to: 'idle'}
    ],
    methods: {
      onPushStep: function() {
        console.log("pushStep");
        let fullRowExists = false;
        //starting at top level, user needs to select a column for each completed row.
        $(`.playerMat[user=${g_userID}] #patternLines .patternLine`).each(function(index, line) {
          let lineFilled = true;
          let tileType = -1;
          $(line).find('.tile').each(function(index, tile) {
            if ($(tile).attr('type') == -1) {
              lineFilled = false;
              return true;
            }
            else tileType = $(tile).attr('type');
          });

          if (!lineFilled) {
            return true;
          }
          else {
            fullRowExists = true;
          }

          if (tileType >= 0) {
            $(line).find('.tile').each(function(index, tile) {
              $(tile).toggleClass('selectedTile');
            });
          }

          //make available wall positions selectable
          let availableIndexes = [];
          //add empty wall positions
          g_editedPlayer.wall[index].forEach((type, index) => {
            if (type == -1) {
              availableIndexes.push(index);
            }
          });

          //ensure no available indexes have type in column
          g_editedPlayer.wall.forEach((row, rowIndex) => {
            availableIndexes.forEach((i, iIndex) => {
              if (row[i] == tileType) {
                availableIndexes.splice(iIndex, 1);
              }
            });
          });

          //ensure no tiles of type already on row
          g_editedPlayer.wall[index].forEach((type, index) => {
            if (type == tileType) {
              availableIndexes = [];
              return false;
            }
          });

          availableIndexes.forEach((i, iIndex) => {
            $(`.playerMat[user=${g_userID}] #wall .patternLine`).eq(index)
            .find('.tile').eq(i)
            .attr('type', tileType)
            .toggleClass('option');
          });

          //floorline handling
          if ($(`.playerMat[user=${g_userID}] #floorLine .tile[type="-1"]`).length === 0) {
            $(`.playerMat[user=${g_userID}] #floorLineTrashCan`)
              .attr('type', tileType)
              .toggleClass('option')
              .removeClass('hidden');
          }
          else {
            $(`.playerMat[user=${g_userID}] #floorLine .tile[type="-1"]`)
              .slice(0, $(line).find('.tile').length)
              .attr('type', tileType)
              .toggleClass('option');
          }
          //set options to do something
          $('.option').on('click', element => {
            $('.tile').off('click');

            let patternLineIndex = $('.selectedTile').parent().attr('patternlineindex');
            let tileType = $('.selectedTile').attr('type');
            //handle floor line a lil differently
            let isTrashCan = $(element.target).attr('id') === 'floorLineTrashCan' || $(element.target).attr('id') === 'tcText';
            if (isTrashCan) {
              //nothing
            }
            else if ($(element.target).parent().attr('id') === 'floorLine') {
              let floorLineCount = $(`#floorLine .option`).length;
              for (let i = 0; i < floorLineCount; i++) {
                if (g_editedPlayer.floorLine.length < 7) {
                  g_editedPlayer.floorLine.push(tileType);
                }
              }
            }
            else { //wall tile selected
              console.log('Wall tile selected.');
              //update g_editedPlayer with selected tile
              let selectedIndex = $(element.target).attr('index');
              //insert tile into wall
              g_editedPlayer.wall[patternLineIndex][selectedIndex] = tileType;
            }

            //clear pattern row in all cases
            g_editedPlayer.patternLines[patternLineIndex].forEach((value, index, arr) => {
              arr[index] = -1;
            });
            
            updateUIFromEditedPlayer();
            g_wallStateMachine.pushStep();
          });

          $('#pushResetButton').show();

          return false;
        });
      if (!fullRowExists) {
        $('#pushConfirmButton').show();
      }
      },
      onReset: function() {

      }
    }
  });
  
  function updateUIFromEditedPlayer() {
    $(`.playerMat[user=${g_userID}] #patternLines`).html(getPatternLinesHTML(g_editedPlayer));
    $(`.playerMat[user=${g_userID}] #wall`).html(getWallHTML(g_editedPlayer));
    $(`.playerMat[user=${g_userID}] #floorLine`).html(getFloorLineHTML(g_editedPlayer));
  }

  function onPushResetButton() {
    g_editedPlayer = JSON.parse(JSON.stringify(g_clientPlayer));
    updateUIFromEditedPlayer();
    $('#pushConfirmButton').hide();
    g_wallStateMachine.pushStep();
  }

  function onPushConfirmButton() {
    socket.emit('pushphaseUpdate', {userID: g_userID,
                                    room: g_roomID,
                                    newPlayer: g_editedPlayer}); //send off our player, wait for update
  }

  function isClientsTurn() {
    return g_gameState.currentTurnUserID === g_userID;
  }
  
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
          enabled="${isClientsTurn().toString()}" 
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
      newDiv += `<div class="tile placed" type="${tile}" draggable="${isClientsTurn().toString()}" factoryIndex="-1"></div>`;
    });
    newDiv += '</div>';
    $('#centerBoard').append(newDiv);
  }

  function getPatternLinesHTML(player) {
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
    return patternLinesHTML;
  }

  function getWallHTML(player, wallOffset) {
    let wallHTML = '';
    if (!g_gameState.isFreeColor) {
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
    }
    else {
      let i = 0;
      player.wall.forEach(wallLine => {
        wallHTML += `<div class="patternLine" patternLineIndex="${i}">`;
        let j = 0;
        wallLine.forEach(tileType => {
          wallHTML += `<div class="tile walltile" type="${tileType}" occupied="${tileType >= 0}" index="${j}"></div>`;
          j++;
        });
        wallHTML += '</div>';
        i++;
      });
    }
    return wallHTML;
  }

  function getFloorLineHTML(player) {
    const floorLineText = ['-1', '-1', '-2', '-2', '-2', '-3', '-3'];
    let floorLineHTML = '';
    for (let f = 0; f < 7; f++) {
      let floorTilePlaced = (player.floorLine.length > f);
      let tile =  floorTilePlaced ? player.floorLine[f] : -1;
      floorLineHTML += `<div class="tile${floorTilePlaced ? ' placed' : ''}" type="${tile}">${floorLineText[f]}</div>`;
    }
    return floorLineHTML;
  }

  function updatePlayerMats(players, wallOffset=0, shouldUpdatePlayer=true) {
    if (shouldUpdatePlayer) {
      $('.playerMat').remove();
    }
    else {
      $('.opponentMats .playerMat').remove();
    }
    let turnOrder = 1;
    for (let index in players) {
      let player = players[index];
      let patternLinesHTML = getPatternLinesHTML(player);
      let wallHTML = getWallHTML(player, wallOffset);
      let floorLineHTML = getFloorLineHTML(player);
      //final product
      var newPlayerMatHTML = `
        <div class="playerMat" user="${player.userID}" isTurn="${g_gameState.currentTurnUserID === player.userID || g_gameState.wallPushPhase.includes(player.userID)}">
          <div class="topLine">
            <div class="scoreboard">
              ${player.name}<br/>
              ${player.score} Points
            </div>
            <div id="pushStepButtons">
              <button id="pushResetButton" style="display: none;">Reset</button>
              <button id="pushConfirmButton" style="display: none;" >Confirm</button>
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
          <div id="floorContainer">
            <div id="floorLine">
              ${floorLineHTML}
            </div>
            <div id="floorLineTrashCan" class="tile hidden" type="-1">
              <div id="tcText">&#x1F5D1</div>
            </div>
          </div>
        </div>
      `;
      turnOrder++;
      if (g_userID === player.userID) {
        if (shouldUpdatePlayer) {
          $('.playerMats').prepend(newPlayerMatHTML);
          $('#pushResetButton').on('click', onPushResetButton);
          $('#pushConfirmButton').on('click', onPushConfirmButton);
        }
      }
      else {
        $('.opponentMats').append(newPlayerMatHTML);
      }


    }    

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
          <th>Rows Completed (x2)</th>
          <th>Columns Completed (x7)</th>
          <th>Colors Completed (x10)</th>
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

  $( "#gameModeDialog" ).dialog({
    autoOpen: false,
    modal: true,
    draggable: false
  });

  // Create a new game. Emit newGame event.
  $('#createGame').on('click', () => {
    $("#gameModeDialog").dialog('open');
  });

  $('#dialogAccept').on('click', () => {
    let name = $('#nameInput').val();
    if (!name) name = "Nameless Buffoon";
    socket.emit('createGame', { name: name, userID: g_userID, freecolor: $('#freeColorRadioButton')[0].checked});
    $("#gameModeDialog").dialog('close');
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
    let isFirstUpdate = (g_gameState === null);
    g_gameState = data;
    $('#menuButtons').hide();
    $('.textEntry').show();
    $('.rules').show();
    if (data.endGameObject) {
      onEndGame(data.endGameObject);
    }

    g_gameState.players.forEach(player => {
      if (player.userID === g_userID) {
        g_clientPlayer = player;
      }
    });

    updateFactories(data.factories);
    updateCommunityPool(data.communityPool);

    let shouldUpdatePlayer = !data.wallPushPhase.includes(g_userID) || g_gameState.players.length === data.wallPushPhase.length || isFirstUpdate;
    updatePlayerMats(data.players, data.wallOffset, shouldUpdatePlayer);

    if (data.wallPushPhase.length && shouldUpdatePlayer) {
      document.getElementById('turnAlert').play();
      g_editedPlayer = JSON.parse(JSON.stringify(g_clientPlayer));
      g_wallStateMachine.pushStep();
    }
    else if (isClientsTurn()) {
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
      //| [4]003
      //| [12351231245]
      let re = /\| \[\d+\]\d*/;
      let found = message.match(re);
      if (found) {
        let match = found[0];
        let prefix = message.substring(0, found.index);
        let suffix = '';
        [...match].forEach(c => {
          if (c.match(/\d{1}/)) {
            suffix += ` <span class="messageTile" type="${c}">0</span>`;
          }
          else {
            suffix += c;
          }
        });

        message = (prefix + suffix);
      }
      $('#messages').append($('<li>').html(`${message}`).addClass('serverMessage'));
    }
    else {
      $('#messages').append($('<li>').text(
        `${senderName}: ${message}`
      ));
    }
    $('#messages').scrollTop($('#messages')[0].scrollHeight - $('#messages')[0].clientHeight);
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
