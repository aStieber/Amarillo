(function init() {
  let game;
  let roomID;

  // const socket = io.connect('http://tic-tac-toe-realtime.herokuapp.com'),
  const socket = io.connect('http://localhost:5000');

  console.log(Cookies.get('ID'))
  //generate random ID number for this browser and store it in a cookie.
  if (document.cookie) {
    console.log(document.cookie["ID"]);
  }
  var d = new Date();
  d.setTime(d.getTime() + (1000*24*60*60*1000));
  document.cookie = `ID=${"arst"};expires=${d.toUTCString()};path=/`;
  // Create a new game. Emit newGame event.
  $('#createGame').on('click', () => {
    name = $('#nameInput').val();
    if (!name) {
      name = "Nameless Buffoon";
    }
    socket.emit('createGame', { name });
  });

  //Start a created game.
  $('#startGame').on('click', () => {
    socket.emit('startGame', {});
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
}());
