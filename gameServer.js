module.exports = function() { 
  this.Player = class Player {
    constructor(name, userID, wallOffset=0) {
      this.name = name;
      this.userID = userID;
      this.turnOrder = 0;
      this.score = 0;
      this.wall = [];
      this.patternLines = [];
      this.floorLine = [];

      this.clearPatternLines([0, 1, 2, 3, 4]);
      this.initializeWall(wallOffset);
    }

    clearPatternLines(rowsToClear) {
      rowsToClear.forEach(rowIndex => {
        let cleanLine = [];
        for (let i = 0; i <= rowIndex; i++) { 
          cleanLine.push(-1);
        }
        this.patternLines[rowIndex] = cleanLine;
      });
    }

    initializeWall() {
      let newWall = []; 
      for (let i = 0; i < 5; i++) {
        let newLine = [];
        for (let j = 0; j < 5; j++) {
          newLine.push(-1);
        }
        newWall.push(newLine);
      }
      this.wall = newWall;
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

    getCurrentTurn() {
      return this.currentTurn;
    }
  }

  this.Game = class Game {
    constructor(roomName, numPlayers=2) {
      this.roomName = roomName;
      this.tilePool = [];
      this.factories = [];
      this.communityPool = [0, 0, 0, 0, 0, 0, 0]; //Called "Center of the table" in ruleset
      this.players = [];
      this.wallOffset = 0;

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

    addPlayer(name, userID) {
      this.players.push(new Player(name, userID));
      console.log(`Added player to game ${this.roomName}: ${name} | ${userID}`);
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
        communityPool: this.communityPool,
        wallOffset: this.wallOffset
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
  }
}