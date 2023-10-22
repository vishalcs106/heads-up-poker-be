import express from "express";
import { createServer } from "http";
import socketIo from "socket.io";
import { Hand } from "pokersolver";
import Player from "./player_v1.js";
import TexasHoldem from "./texasholdem_v1.js";
const app = express();
const server = createServer(app);
const io = socketIo(server);

import { join } from "path";
app.get("/player", (req, res) => {
  res.sendFile(join(__dirname, "player.html"));
});

app.get("/dealer", (req, res) => {
  res.sendFile(join(__dirname, "dealer.html"));
});

let players = {};
let texasHoldem = {};

function evaluateWinner(player1Hand, player2Hand, board) {
  // Create hands in the format the library expects
  const player1Eval = Hand.solve(player1Hand.concat(board));
  const player2Eval = Hand.solve(player2Hand.concat(board));

  // Compare the hands
  const winner = Hand.winners([player1Eval, player2Eval]);

  if (winner.length === 1) {
    if (winner[0] === player1Eval) {
      gameState.winner = "player1";
      gameState.reason = player1Eval.descr;
      return "player1";
    } else {
      gameState.winner = "player2";
      gameState.reason = player2Eval.descr;
      return "player2";
    }
  } else {
    return "draw";
  }
}

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

function dealCommunityCards() {
  switch (gameState.stage) {
    case "flop":
      gameState.board.push(...dealCards(3));
      gameState.stage = "turn";
      break;
    case "turn":
      gameState.board.push(...dealCards(1));
      gameState.stage = "river";
      break;
    case "river":
      gameState.board.push(...dealCards(1));
      gameState.stage = "showdown";
      break;
    default:
      console.error(
        "Incorrect stage for dealing community cards:",
        gameState.stage
      );
  }
}

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);

  socket.on("joinGame", (playerName) => {
    if (Object.keys(players).length < 2) {
      players[socket.id] = new Player(playerName);
      socket.emit("gameState", gameState);
      io.emit("message", `${playerName} has joined the game.`);
    } else {
      socket.emit("message", "The game is full.");
    }
  });

  socket.on("playerAction", (action) => {
    const playerId = socket.id;
    const player = gameState.players[playerId];

    // Record the action for the current round and player
    if (!gameState.actions[gameState.stage][playerId]) {
      gameState.actions[gameState.stage][playerId] = [];
    }
    gameState.actions[gameState.stage][playerId].push({
      type: action.type,
      amount: action.amount || 0,
      timestamp: new Date().toISOString(),
    });

    switch (action.type) {
      case "fold":
        gameState.turn = getOpponentId(playerId);
        player.bet = 0;
        break;
      case "check":
        gameState.turn = getOpponentId(playerId);
        break;
      case "call":
        const callAmount = gameState.amountToCall - player.bet;
        player.bet += callAmount;
        gameState.pot += callAmount;
        gameState.amountToCall = 0;
        gameState.turn = getOpponentId(playerId);
        break;
      case "bet":
        const betAmount = action.amount;
        gameState.amountToCall = betAmount - player.bet;
        gameState.pot += gameState.amountToCall;
        player.bet = betAmount;
        gameState.turn = getOpponentId(playerId);
        break;
      default:
        console.error("Unknown player action:", action.type);
    }
    io.emit("gameState", gameState);
  });

  function getOpponentId(currentPlayerId) {
    return Object.keys(gameState.players).find((id) => id !== currentPlayerId);
  }

  socket.on("startGame", () => {
    if (Object.keys(players).length === 2) {
      texasHoldem = new TexasHoldem(players[0], players[1]);
      texasHoldem.playGame();
      io.emit("gameState", texasHoldem.gameState);
      io.emit("message", "The game has started!");
    } else {
      socket.emit("message", "Need two players to start the game.");
    }
  });

  socket.on("showdown", () => {
    console.log("showdown");
    const player1Id = Object.keys(gameState.players)[0];
    const player2Id = Object.keys(gameState.players)[1];
    console.log(player1Id + " " + player2Id);

    const winner = evaluateWinner(
      gameState.players[player1Id].hand,
      gameState.players[player2Id].hand,
      gameState.board
    );

    console.log("Winner " + winner);

    switch (winner) {
      case "player1":
        gameState.players[player1Id].stack += gameState.pot;
        io.emit("message", "Player 1 wins the pot!");
        break;
      case "player2":
        gameState.players[player2Id].stack += gameState.pot;
        io.emit("message", "Player 2 wins the pot!");
        break;
      case "draw":
        const splitPot = gameState.pot / 2;
        gameState.players[player1Id].stack += splitPot;
        gameState.players[player2Id].stack += splitPot;
        io.emit("message", "It's a draw! The pot is split.");
        break;
    }

    gameState.pot = 0;
    console.log("postwin state " + JSON.stringify(gameState));
    io.emit("gameState", gameState);
  });

  socket.on("dealerAction", () => {
    if (validateDealerAction()) {
      dealCommunityCards();
      io.emit("gameState", gameState);
    } else {
      socket.emit(
        "message",
        `Can't proceed to the next stage from ${gameState.stage}.`
      );
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
    delete gameState.players[socket.id];
    io.emit("gameState", gameState);
    io.emit("message", "A player has left the game.");
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
