module.exports = function() { 
  this.Player = class Player {
    constructor(name, userID, wallOffset=0) {
      this.name = name;
      this.userID = userID;
      this.turnOrder = 0;
      this.score = 0;
      this.wall = [];
      this.patternLines = [];
      this.floorLine = []; //max 6 spaces

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

    getPlayerName() {
      return this.name;
    }
  }

  this.Game = class Game {
    constructor(roomName, numPlayers=2) {
      this.roomName = roomName;
      this.tilePool = [];
      this.factories = [];
      this.communityPool = []; //Called "Center of the table" in ruleset
      this.players = [];
      this.wallOffset = 0;
      this.currentTurn = 0;
      this.roundCount = -1;

      //initialize factories
      for (var i = 0; i < (numPlayers*2+1); i++)
        this.factories.push([]);

      this.refillTilePool();
    }

    addPlayer(name, userID) {
      this.players.push(new Player(name, userID));
      console.log(`Added player to game ${this.roomName}: ${name} | ${userID}`);
    };

    onClientMove(data) {
      let factoryIndex = data.factoryIndex;
      let tileType = data.tileType;
      let targetRow = data.targetRow;
      let userID = data.userID;
      let selectedTileCount = 0;

      if (factoryIndex == -1) //from the communityPool
      { 
        let newCommunityPool = []; 
        for (let f = 0; f < this.communityPool.length; f++) {
          if (this.communityPool[f] == tileType) {
            selectedTileCount++;
          }
          else {
            newCommunityPool.push(this.communityPool[f]);
          }
        }
        this.communityPool = newCommunityPool;
      }
      else {
        for (let f = 0; f < 4; f++) {
          if (this.factories[factoryIndex][f] == tileType) {
            selectedTileCount++;
          }
          else {
            this.communityPool.push(this.factories[factoryIndex][f]);
          }
        }
        this.factories[factoryIndex] = [];
      }
      

      let playerIndex = 0;
      for (playerIndex; playerIndex < this.players.length; playerIndex++)
        if (this.players[playerIndex].userID === userID) break;

      //update player's pattern lines
      let currentRow = this.players[playerIndex].patternLines[targetRow];
      for (let i = 0; i < this.players[playerIndex].patternLines[targetRow].length; i++) {
        if (this.players[playerIndex].patternLines[targetRow][i] == -1 && selectedTileCount > 0) {
          this.players[playerIndex].patternLines[targetRow][i] = tileType;
          selectedTileCount--;
        }
      }
      currentRow.forEach(element=> {
        if (element == -1 && selectedTileCount > 0) {
          element = tileType;
          selectedTileCount--;
        }
      });
      this.players[playerIndex].patternLines[targetRow] = currentRow;

      if (this.getTilesLeftInPlay() > 0) {
        this.currentTurn = (this.currentTurn + 1) % this.players.length;
      }
      else {
        this.endTurn();
      }
    }

    endTurn() {
      this.roundCount++;
      this.currentTurn = this.roundCount % this.players.length; //next player starts each round
      //calculate points/updateWalls
      this.updatePlayerBoards();
      //

      //this.calculatePoints(); //updates walls too
      this.fillFactories();
    }

    getTilesLeftInPlay() {
      let output = 0;
      this.factories.forEach(factory => {
        output += factory.length;
      });
      return output;
    }

    updatePlayerBoards() {
      this.players.forEach(player => {
        //identify completed rows
        let completedPatternLineIndexes = [];
        for (let i = 0; i < player.patternLines.length; i++) {
          let hasEmptyCell = false;
          for (let t in player.patternLines[i]) {
            if (t == -1) {
              hasEmptyCell = true;
              break;
            }
          }
          if (!hasEmptyCell) completedPatternLineIndexes.push(i);
        }
        //move to wall
        for (let i in completedPatternLineIndexes) {
          //let tileType = player.patternLines[i][0];
          //let rowIndex = i;
          //let columnIndex = getColumnFromRow(rowIndex, tileType); 
        }
        //update points
        //reset line
      });
    }

    getColumnFromRow(rowIndex, tileType) {
      //01234
      //12340
      //23401

      //0,0 -> 0
      //1,0 -> 4
      //1,1 -> 0
      return (rowIndex*4 - tileType) % 5;

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
        wallOffset: this.wallOffset,
        currentTurnUserID: this.players[this.currentTurn].userID
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