module.exports = function() { 
  this.Player = class Player {
    constructor(name, userID) {
      this.name = name;
      this.userID = userID;
      this.currentTurn = false;
      this.currentScore = 0;
      this.wall = [];
      this.patternLines = [];
      this.floorLine = [];
    }

    // Set the bit of the move played by the player
    // tileValue - Bitmask used to set the recently played move.
    updatePlaysArr(tileValue) {
      this.playsArr += tileValue;
    }

    getPlaysArr() {
      return this.playsArr;
    }

    // Set the currentTurn for player to turn and update UI to reflect the same.
    setCurrentTurn(turn) {
      this.currentTurn = turn;
      const message = turn ? 'Your turn' : 'Waiting for Opponent';
      $('#turn').text(message);
    }

    getPlayerName() {
      return this.name;
    }

    getPlayerType() {
      return this.type;
    }

    getCurrentTurn() {
      return this.currentTurn;
    }
  }

  this.Game = class Game {
    constructor(roomName, numPlayers=2) {
      this.roomName = roomName;
      this.tilePool = [];
      this.factories = [];
      this.communityPool = []; //Called "Center of the table" in ruleset
      this.players = [];

      //initialize factories
      for (var i = 0; i < (numPlayers*2+1); i++)
        this.factories.push([]);

      this.refillTilePool();
    }

    tileClickHandler() {
      const row = parseInt(this.id.split('_')[1][0], 10);
      const col = parseInt(this.id.split('_')[1][1], 10);
      if (!player.getCurrentTurn() || !game) {
        alert('Its not your turn!');
        return;
      }

      if ($(this).prop('disabled')) {
        alert('This tile has already been played on!');
        return;
      }

      // Update board after your turn.
      game.playTurn(this);
      game.updateBoard(player.getPlayerType(), row, col, this.id);

      player.setCurrentTurn(false);
      player.updatePlaysArr(1 << ((row * 3) + col));

      game.checkWinner();
    }

    updateBoard(type, row, col, tile) {
      $(`#${tile}`).text(type).prop('disabled', true);
      this.board[row][col] = type;
      this.moves++;
    }

    addPlayer(name, userID) {
      this.players.push(new Player(name, userID));
      console.log(`Added player: ${name} | ${userID}`);
    };

    endTurn() {
      //calculate points/updateWalls
      //fill factories
      //set first player

      //this.calculatePoints(); //updates walls too

      this.fillFactories();
    }

    fillFactories() {
      for (let i = 0; i < this.factories.length; i++) {
        if (this.tilePool.length >= 4) {
          this.factories[i] = this.tilePool.slice(0, 4);
          this.tilePool = this.tilePool.slice(4);
        }
        else {
          //refill, there are special rules here though
          this.refillTilePool();
          i--;
        }
      };
    }

    getState() {
      return {
        room: this.roomName,
        players: this.players,
        factories: this.factories,
        communityPool: this.communityPool
      };
    }

    refillTilePool() {
      function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min; //min <= r < max
      }
      //100 tiles, 20 of each type.
      let pool = new Array(100);
      for (var i = 0; i < 100; i++) {
        pool[i] = i % 5;
      }
      //fisher-yates
      for (var i = 99; i > 0; i--) {
        let j = getRandomInt(0, i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.tilePool = pool;
    };

    // Send an update to the opponent to update their UI's tile
    playTurn(tile) {
      const clickedTile = $(tile).attr('id');

      // Emit an event to update other player that you've played your turn.
      socket.emit('playTurn', {
        tile: clickedTile,
        room: this.getRoomId(),
      });
    }

    checkWinner() {
      const currentPlayerPositions = player.getPlaysArr();

      Player.wins.forEach((winningPosition) => {
        if ((winningPosition & currentPlayerPositions) === winningPosition) {
          game.announceWinner();
        }
      });

      const tieMessage = 'Game Tied :(';
      if (this.checkTie()) {
        socket.emit('gameEnded', {
          room: this.getRoomId(),
          message: tieMessage,
        });
        alert(tieMessage);
        location.reload();
      }
    }

    checkTie() {
      return this.moves >= 9;
    }

    // Announce the winner if the current client has won. 
    // Broadcast this on the room to let the opponent know.
    announceWinner() {
      const message = `${player.getPlayerName()} wins!`;
      socket.emit('gameEnded', {
        room: this.getRoomId(),
        message,
      });
      alert(message);
      location.reload();
    }

    // End the game if the other player won.
    endGame(message) {
      alert(message);
      location.reload();
    }
  }
}