const open = require('open');

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  // Opens the URL in the default browser.
  await open('http://localhost:5000/?dev=1&roomID=r1&userID=1&isHost=1');

  await timeout(300);
  await open('http://localhost:5000/?dev=1&roomID=r1&userID=2');

  await timeout(100);
  await open('http://localhost:5000/?dev=1&roomID=r1&userID=3');

  await timeout(100);
  await open('http://localhost:5000/?dev=1&roomID=r1&userID=4');
})();
