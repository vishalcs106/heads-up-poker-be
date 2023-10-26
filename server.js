const express = require("express");
const { createServer } = require("http");
const socketIoLib = require("socket.io");
const Player = require("./player_v1");
const TexasHoldem = require("./texasholdem_v1");
const { join } = require("path");

const app = express();
const server = createServer(app);
const io = socketIoLib(server);

app.get("/player", (req, res) => {
  res.sendFile(join(__dirname, "player.html"));
});

app.get("/dealer", (req, res) => {
  res.sendFile(join(__dirname, "dealer.html"));
});

let players = {};
let texasHoldem = {};

function bet(betAmount, socket) {
  if (gameState.players[socket.id].stack >= betAmount) {
    gameState.players[socket.id].stack -= betAmount;
    gameState.players[socket.id].bet = betAmount;
    gameState.pot += betAmount;
    gameState.turn = Object.keys(gameState.players).find(
      (id) => id !== socket.id
    );
  } else {
    socket.emit("message", "Insufficient chips to bet that amount.");
  }
}

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);

  socket.on("joinGame", (playerName) => {
    if (Object.keys(players).length < 2) {
      let id = socket.id;
      console.log("id " + id);
      players[id] = new Player(playerName);
      console.log("pl " + JSON.stringify(players));
      io.emit("message", `${playerName} has joined the game.`);
    } else {
      socket.emit("message", "The game is full.");
    }
  });

  socket.on("playerAction", (action) => {
    const playerId = socket.id;
    const player = players[playerId];

    texasHoldem.bettingRound(player, action);

    io.emit("gameState", texasHoldem.gameState);
  });

  function getOpponentId(currentPlayerId) {
    return Object.keys(gameState.players).find((id) => id !== currentPlayerId);
  }

  socket.on("startGame", () => {
    console.log("sg");


    if (Object.values(players).length === 2) {
      texasHoldem = new TexasHoldem(Object.values(players)[0], Object.values(players)[1]);
      texasHoldem.playGame();
      io.emit("gameState", texasHoldem.gameState);
      io.emit("message", "The game has started!");
    } else {
      socket.emit("message", "Need two players to start the game.");
    }
  });

  socket.on("showdown", () => {
    console.log("showdown");
    texasHoldem.showDown();
    console.log("postwin state " + JSON.stringify(texasHoldem.gameState));
    io.emit("gameState", texasHoldem.gameState);
  });

  socket.on("dealerAction", () => {
    if (texasHoldem.getGameState().community_cards.length == 0)
      texasHoldem.dealFlop();
    else texasHoldem.dealTurnOrRiver();
    io.emit("gameState", texasHoldem.gameState);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
    //delete gameState.players[socket.id];
    io.emit("gameState", texasHoldem.gameState);
    io.emit("message", "A player has left the game.");
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
