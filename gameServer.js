/* global require, module */

const { JSDOM } = require('jsdom');
const { window } = new JSDOM('<html></html>');
const $ = require('jquery')(window);

const deepCopyArray = (a) => $.extend(true, (Array.isArray(a) ? [] : {}), a);

class Player {
  constructor(name, userID, wallOffset=0) {
    this.name = name;
    this.userID = userID;
    this.turnOrder = 0;
    this.score = 0;
    this.wall = [];
    this.patternLines = [];
    this.floorLine = []; //max 7 spaces

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

  updateWall(tileType, rowIndex, columnIndex) {
    this.wall[rowIndex][columnIndex] = tileType;
    this.clearPatternLines([rowIndex]);

    let hSearchScore = this.recursiveSearch(deepCopyArray(this.wall), rowIndex, columnIndex, 'h');
    let vSearchScore = this.recursiveSearch(deepCopyArray(this.wall), rowIndex, columnIndex, 'v');
    //if either search is exactly 1, only consider the other score. Not my fault, that's the rules.
    this.score += (hSearchScore + vSearchScore);
    if (hSearchScore === 1 || vSearchScore === 1) {
       this.score -= 1; //this way, we don't have to worry about which is 1.
    }
  }

  clearFloorLine() {
    if (this.floorLine.length) {
      //                   -1  -1  -2  -2  -2  -3   -3
      const penaltyList = [-1, -2, -4, -6, -8, -11, -14];
      this.score = Math.max(this.score + penaltyList[this.floorLine.length - 1], 0);
      this.floorLine = [];
    }
  }

  recursiveSearch(wallCopy, row, column, searchDirection='h') {
    if (wallCopy[row][column] !== -1) {
      let score = 1;
      wallCopy[row][column] = -1; //prevent search from coming back to us.
      if (searchDirection === 'v') {
        if (row > 0) score += this.recursiveSearch(wallCopy, row-1, column, searchDirection);
        if (row < 4) score += this.recursiveSearch(wallCopy, row+1, column, searchDirection);
      }
      else if (searchDirection === 'h') {
        if (column > 0) score += this.recursiveSearch(wallCopy, row, column-1, searchDirection);
        if (column < 4) score += this.recursiveSearch(wallCopy, row, column+1, searchDirection);
      }
      return score;
    }
    return 0;
  }
}

class Game {
  constructor(roomName) {
    this.roomName = roomName;
    this.tilePool = [];
    this.factories = [];
    this.communityPool = []; //Called "Center of the table" in ruleset
    this.players = [];
    this.wallOffset = 0;
    this.currentTurn = 0;
    this.roundCount = -1;
    this.communityPoolTaken=false;

    this.refillTilePool();
  }

  addPlayer(name, userID) {
    this.players.push(new Player(name, userID));
    console.log(`Added player to game ${this.roomName}: ${name} | ${userID}`);
  }

  onClientMove(data) {
    let factoryIndex = data.factoryIndex;
    let tileType = data.tileType;
    let targetRow = data.targetRow;
    let userID = data.userID;
    let floorLineCount = data.floorLineCount; //number of tiles to add to the floor line.
    let selectedTileCount = 0;

    let player = {};
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].userID === userID) {
        player = this.players[i];
        break;
      }
    }

    //Move tiles to pool, count selectedTiles
    if (factoryIndex == -1) //from the communityPool
    {
      let newCommunityPool = [];
      for (let f = 0; f < this.communityPool.length; f++) {
        if (this.communityPool[f] == tileType) {
          selectedTileCount++;
        }
        else { newCommunityPool.push(this.communityPool[f]); }
      }
      this.communityPool = newCommunityPool;
      if (!this.communityPoolTaken) {
        this.communityPoolTaken = true;
        console.log("community Pool cherry popped");
        player.floorLine.push(5);
      }
    }
    else {
      for (let f = 0; f < 4; f++) {
        if (this.factories[factoryIndex][f] == tileType) {
          selectedTileCount++;
        }
        else { this.communityPool.push(this.factories[factoryIndex][f]); }
      }
      this.factories[factoryIndex] = [];
    }

    //update player's floor line
    for (let i = 0; i < floorLineCount; i++) {
      if (player.floorLine.length < 7) {
        player.floorLine.push(tileType);
      }
    }

    //update player's pattern lines
    let currentRow = player.patternLines[targetRow];
    for (let i = 0; i < player.patternLines[targetRow].length; i++) {
      if (player.patternLines[targetRow][i] == -1 && selectedTileCount > 0) {
        player.patternLines[targetRow][i] = tileType;
        selectedTileCount--;
      }
    }
    currentRow.forEach(element=> {
      if (element == -1 && selectedTileCount > 0) {
        element = tileType;
        selectedTileCount--;
      }
    });
    player.patternLines[targetRow] = currentRow;


    //check for end of turn
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
    this.processPlayerBoardsAtEndTurn();

    if (this.checkForEndOfGame()) {
      console.log('game ended');
      this.endGameJson = this.getEndGameObject();
    }
    else {
      console.log('no completed row');
      this.fillFactories();
      this.communityPoolTaken = false;
      this.communityPool = []; //should be empty right now anyway.
    }
  }

  getTilesLeftInPlay() {
    let output = this.communityPool.length;
    this.factories.forEach(factory => {
      output += factory.length;
    });
    return output;
  }

  checkForEndOfGame() {
    //if any player has a completed row, calculate final score for all players.
    for (let p in this.players) {
      let player = this.players[p];
      for (let w in player.wall) {
        let rowCompleted = true;
        let wallLine = player.wall[w];
        for (let e in wallLine) {
          if (wallLine[e] === -1) { rowCompleted = false; }
          break;
        }
        if (rowCompleted) {
          return true;
        }
      }
    }
    return false;
  }

  processPlayerBoardsAtEndTurn() {
    this.players.forEach(player => {
      //identify completed rows
      let completedPatternLineIndexes = [];
      for (let i in player.patternLines) {
        let hasEmptyCell = false;
        for (let t in player.patternLines[i]) {
          if (player.patternLines[i][t] === -1) {
            hasEmptyCell = true;
            break;
          }
        }
        if (!hasEmptyCell) completedPatternLineIndexes.push(i);
      }
      //move to wall
      for (let i in completedPatternLineIndexes) {
        let tileType = parseInt(player.patternLines[completedPatternLineIndexes[i]][0]);
        let rowIndex = parseInt(completedPatternLineIndexes[i]);
        let columnIndex = this.getColumnFromRow(rowIndex, tileType);

        player.updateWall(tileType, rowIndex, columnIndex);
        player.clearFloorLine();
      }
    });
  }

  getColumnFromRow(rowIndex, tileType) {
    //https://jsfiddle.net/p2ebduqk/2/
    return (this.wallOffset + tileType - rowIndex + 5) % 5;
  }

  fillFactories() {
    console.log(this.tilePool)
    this.factories = [];
    let playerCount = this.players.length;
    for (let i = 0; i < (playerCount * 2 + 1); i++) {
      if (this.tilePool.length >= 4) {
        this.factories.push(this.tilePool.slice(0, 4));
        this.tilePool = this.tilePool.slice(4);
      }
      else {
        //refill, there are special rules here though
        this.refillTilePool();
        i--;
      }
    }
  }

  getState() {
    return {
      room: this.roomName,
      players: this.players,
      factories: this.factories,
      communityPool: this.communityPool,
      wallOffset: this.wallOffset,
      currentTurnUserID: this.players[this.currentTurn].userID,
      endGameObject: (this.endGameObject ? this.endGameObject : false)
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
    for (var f = 99; f > 0; f--) {
      let j = getRandomInt(0, f + 1);
      [pool[f], pool[j]] = [pool[j], pool[f]];
    }
    this.tilePool = pool;
  }

  getEndGameObject() {
    let playerEndStates = [];
    this.players.forEach(player => {
      let numRowsCompleted = 0;
      let numColumnsCompleted = 0;
      let numColorsCompleted = 0;

      //rows completed and colors completed
      let colorCounts = [0, 0, 0, 0, 0];
      for (let w in player.wall) {
        let rowCompleted = true;
        let wallLine = player.wall[w];
        for (let e in wallLine) {
          if (wallLine[e] === -1) { rowCompleted = false; }
          else { colorCounts[wallLine[e]]++; }
        }
        if (rowCompleted) {
          numRowsCompleted++;
        }
      }
      //columns completed
      for (let c = 0; c < 5; c++) {
        let columnCompleted = true;
        for (let w in player.wall) {
          if (player.wall[w][c] === -1) {
            columnCompleted = false;
            break;
          }
        }
        if (columnCompleted) {
          numColumnsCompleted++;
        }
      }
      //colors completed
      colorCounts.forEach(count => {
        if (count === 5)
          numColorsCompleted++;
      });

      playerEndStates.push({
        name: player.name,
        userID: player.userID,
        endingScore: player.score,
        numRowsCompleted,
        numColumnsCompleted,
        numColorsCompleted
      });
    });

    return playerEndStates;
  }
}

module.exports = {
  Game,
  Player,
};
