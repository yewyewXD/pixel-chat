Moralis.initialize("UTWiusSu2P8dn1H8LK5Q6N4vC7w1wqjsU0nE6peb");
Moralis.serverURL = "https://aefj6iraiwkm.usemoralis.com:2053/server";

const currentUser =
  Moralis.User.current() ||
  JSON.parse(window.localStorage.getItem("currentUser"));

let context;
let game;
let gameInitialized = false;

const PLAYER_SIZE = 20;
const SCREEN_WIDTH = 700;
const SCREEN_HEIGHT = 500;

let lastMove = 0; // date
let hasDoneCoolOff = true;
const buttonsLocked = {};
const MOVE_SPEED = 10;
const MOVE_COOLOFF = 300;
const coolOffPercentEl = document.getElementById("cool-off-percentage");
const coolOffCircle = document.querySelector(".StrokedCircle");

let users = [];
let usernames = [];

let myPositionX = 0;
let myPositionY = 0;
let myRoomId = "";
let myUsername = window.localStorage.getItem("username") || "";

// server move request queue
let currentQueueId = 0;
let currentRoom = "Lobby";
const currentRoomElement = document.getElementById("current-room");

const loginScreenElement = document.querySelector(".LoginScreen");
const loginBtnEl = document.getElementById("login-btn");
const logoutBtnEl = document.getElementById("logout-btn");

let lastChat = 0; // date
let doneChatCoolOff = true;
const CHAT_COOLOFF = 300;
const chatElement = document.querySelector(".Chat");
const chatViewElement = document.querySelector(".Chat__View");
const chatInputEl = document.querySelector(".ChatForm__Input");
const chatUsernameEl = document.querySelector(".ChatForm__Username");

window.onload = () => {
  highlightRoomButton("Lobby");
  currentRoomElement.innerText = "Lobby";
  window.localStorage.removeItem("currentUser");
  window.localStorage.removeItem("username");
  loginScreenElement.style.display = "flex";
};

const nameFormEl = document.getElementById("name-form");
const nameInputEl = document.querySelector(".LoginScreen__NameInput");
function handleInputUsername(e) {
  e.preventDefault();
  const name = nameInputEl.value;
  window.localStorage.setItem("username", name);
  myUsername = name;
  chatUsernameEl.innerText = name;

  nameFormEl.style.opacity = 0;

  setTimeout(() => {
    nameFormEl.style.display = "none";
    loginBtnEl.style.display = "inline-block";
  }, 500);
}
nameFormEl.addEventListener("submit", handleInputUsername);

async function login() {
  const user = await Moralis.Web3.authenticate();
  if (user) {
    window.localStorage.setItem("currentUser", JSON.stringify(user));
    loginScreenElement.style.opacity = 0;
    setTimeout(() => {
      loginScreenElement.style.display = "none";
    }, 500);
  }
}

async function logout() {
  loginScreenElement.style.display = "flex";
  setTimeout(() => {
    loginScreenElement.style.opacity = 1;
  }, 10);
  window.localStorage.removeItem("currentUser");
  window.localStorage.removeItem("username");
  await Moralis.User.logOut();
}

async function selectRoom(room) {
  const previousRoom = currentRoom;
  if (previousRoom === room) return;

  users = [];
  usernames = [];

  highlightRoomButton(room);
  // previous room -> inactive
  await Moralis.Cloud.run("move", {
    direction: null,
    queueId: null,
    room: previousRoom,
    username: myUsername,
    isActive: false,
  });

  // new room -> active
  if (room !== "Lobby") {
    await Moralis.Cloud.run("move", {
      direction: null,
      queueId: null,
      room: room,
      username: myUsername,
      isActive: true,
    });
  }

  currentRoom = room;
  currentRoomElement.innerText = room;

  if (previousRoom === "Lobby") {
    loadGame();
  } else {
    refreshGame();
  }

  if (room !== "Lobby") {
    chatElement.style.display = "flex";
    logoutBtnEl.style.display = "none";
    chatViewElement.innerHTML = "";
  }
}

function highlightRoomButton(room) {
  const allRoomNames = ["Room1", "Room2", "Lobby"];
  const affectedButtonEl = document.getElementById(`${room}-btn`);
  affectedButtonEl.classList.add("buttonFocus");

  allRoomNames.forEach((roomName) => {
    if (roomName !== room) {
      const roomEl = document.getElementById(`${roomName}-btn`);
      roomEl.classList.remove("buttonFocus");
    }
  });
}

async function leaveRoom() {
  highlightRoomButton("Lobby");
  await Moralis.Cloud.run("move", {
    direction: null,
    queueId: null,
    room: currentRoom,
    username: myUsername,
    isActive: false,
  });
  currentRoom = "Lobby";
  currentRoomElement.innerText = "Lobby";
  chatElement.style.display = "none";
  logoutBtnEl.style.display = "block";
  if (game) {
    game.destroy(true, false);
  }
}

async function showJoinLeaveMsg({ name, type }) {
  const newChatText = document.createElement("div");
  newChatText.style.fontSize = "20px";
  newChatText.style.margin = "2px 0";
  const actionMsg = type === "join" ? "joined" : "left";
  newChatText.innerText = `[${name} has ${actionMsg} the room]`;
  chatViewElement.appendChild(newChatText);
}

async function handleSendChat(e) {
  e.preventDefault();
  lastChat = new Date();
  const inputValue = chatInputEl.value;
  const newChatText = document.createElement("div");
  newChatText.innerText = `${myUsername}: ${inputValue}`;
  chatViewElement.appendChild(newChatText);
  chatInputEl.value = "";
  await Moralis.Cloud.run("sendChat", {
    room: currentRoom,
    text: inputValue,
    roomId: myRoomId,
    username: myUsername,
  });
}
document.querySelector(".ChatForm").addEventListener("submit", handleSendChat);

function refreshGame() {
  context.registry.destroy(); // destroy registry
  context.events.off(); // disable all active events
  context.scene.restart(); // restart current scene
}

function loadGame() {
  const config = {
    type: Phaser.AUTO,
    parent: "phaser-parent",
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    scene: {
      preload: preload,
      create: create,
      update: update,
    },
    physics: {
      default: "arcade",
      arcade: { debug: true },
    },
  };

  game = new Phaser.Game(config);

  function preload() {
    context = this;
  }

  async function create() {
    if (currentRoom === "Lobby") {
      return;
    } else if (!currentRoom) {
      currentRoom = "Lobby";
      console.log("no current room");
      return;
    }

    if (!currentUser) return;

    this.leftKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT
    );
    this.rightKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    );
    this.upKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.DOWN
    );

    const query = new Moralis.Query(currentRoom);
    const subscription = await query.subscribe();
    subscription.on("update", (moved) => {
      if (moved.className !== currentRoom) return;

      console.log({ moved, currentRoom, users, usernames });
      const roomId = moved.id;
      const newX = moved.get("x");
      const newY = moved.get("y");
      const moveIsActive = moved.get("isActive");
      const playerUsername = moved.get("username");
      const player = moved.get("player");

      // if user were never here
      if (!users[roomId] && moveIsActive) {
        showJoinLeaveMsg({ name: playerUsername, type: "join" });
        if (player.id === currentUser.id) {
          // remember my position and id
          myPositionX = newX;
          myPositionY = newY;
          myRoomId = roomId;
        }

        // create new character
        users[roomId] = this.add.rectangle(
          newX,
          newY,
          PLAYER_SIZE,
          PLAYER_SIZE,
          player.id === currentUser.id ? 0xff0000 : 0xffffff
        );

        usernames[roomId] = this.add.text(
          newX - 13,
          newY - 35,
          playerUsername,
          {
            font: "18px bold",
            fontFamily: "'Press Start 2P', cursive",
            color: "white",
          }
        );

        usernames[roomId].setPosition(
          newX - usernames[myRoomId].width / 2,
          newY - 35
        );
      } else if (
        // change my position
        player.id === currentUser.id &&
        (newX !== myPositionX || newY !== myPositionY) &&
        moved.get("queueId") === currentQueueId
      ) {
        users[roomId].setPosition(newX, newY);
        usernames[roomId].setPosition(
          newX - usernames[roomId].width / 2,
          newY - 35
        );
        myPositionX = newX;
        myPositionY = newY;
        // remove player character from room
      } else if (moveIsActive === false && moved.className === currentRoom) {
        users[roomId].destroy();
        users[roomId] = undefined;
        usernames[roomId].destroy();
        usernames[roomId] = undefined;
        showJoinLeaveMsg({ name: playerUsername, type: "leave" });
      } else {
        // change other player's position & username
        users[roomId].setPosition(newX, newY);
        usernames[roomId].setPosition(
          newX - usernames[roomId].width / 2,
          newY - 35
        );
        usernames[roomId].setText(playerUsername);
      }
    });
    //just to register the player
    await Moralis.Cloud.run("move", {
      direction: null,
      queueId: null,
      room: currentRoom,
      username: myUsername,
      isActive: true,
    });

    const chatQuery = new Moralis.Query(`${currentRoom}Chat`);
    const chatSub = await chatQuery.subscribe();
    chatSub.on("create", (chat) => {
      const text = chat.get("text");
      const sender = chat.get("player");
      const senderName = chat.get("username");
      if (sender?.id !== currentUser?.id) {
        const newChatText = document.createElement("div");
        newChatText.innerText = `${senderName}: ${text}`;
        chatViewElement.appendChild(newChatText);
      }
    });

    const nearbyPlayers = await Moralis.Cloud.run("playersNearby", {
      room: currentRoom,
      roomId: myRoomId,
    });
    nearbyPlayers.forEach((player) => {
      const playerUsername = player.get("username");
      console.log({ player });
      const playerX = player.get("x");
      const playerY = player.get("y");
      const playerRoomId = player.id;
      users[playerRoomId] = this.add.rectangle(
        playerX,
        playerY,
        PLAYER_SIZE,
        PLAYER_SIZE,
        0xffffff
      );

      usernames[playerRoomId] = this.add.text(
        playerX - 13,
        playerY - 35,
        playerUsername,
        {
          font: "18px bold",
          fontFamily: "'Press Start 2P', cursive",
          color: "white",
        }
      );

      usernames[playerRoomId].setPosition(
        playerX - usernames[playerRoomId].width / 2,
        playerY - 35
      );
    });

    gameInitialized = true;
  }

  async function update() {
    if (!gameInitialized) return;

    // rate-limit move
    if (new Date() - lastMove < MOVE_COOLOFF) {
      if (hasDoneCoolOff) hasDoneCoolOff = false;
      const coolOffPercent = Math.round(
        ((new Date() - lastMove) / MOVE_COOLOFF) * 100
      );
      coolOffPercentEl.innerText = `${coolOffPercent} %`;
      if (coolOffCircle.style !== "stroke: black !important") {
        coolOffCircle.style = "stroke: black !important";
      }
    } else if (!hasDoneCoolOff) {
      hasDoneCoolOff = true;
      coolOffPercentEl.innerText = "100%";
      coolOffCircle.style = `stroke: red !important`;
    }

    // rate-limit chat
    if (new Date() - lastChat < CHAT_COOLOFF) {
      if (doneChatCoolOff) doneChatCoolOff = false;
      console.log("chat CD");
      if (+chatElement.style.opacity != 0.5) {
        chatElement.style.opacity = 0.5;
      }
      return;
    } else if (!doneChatCoolOff) {
      doneChatCoolOff = true;
      chatElement.style.opacity = 1;
      console.log("done chat CD");
    }

    if (hasDoneCoolOff) {
      if (this.upKey.isDown && !buttonsLocked["up"]) {
        console.log("UP is pressed");

        myPositionY -= MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(
          myPositionX - usernames[myRoomId].width / 2,
          myPositionY - 35
        );
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["up"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "up",
          queueId: currentQueueId,
          username: myUsername,
          room: currentRoom,
        });
        console.log(moveResult);
        buttonsLocked["up"] = false;
      } else if (this.leftKey.isDown && !buttonsLocked["left"]) {
        console.log("LEFT is pressed");

        myPositionX -= MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(
          myPositionX - usernames[myRoomId].width / 2,
          myPositionY - 35
        );
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["left"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "left",
          queueId: currentQueueId,
          username: myUsername,
          room: currentRoom,
        });
        console.log(moveResult);
        buttonsLocked["left"] = false;
      } else if (this.downKey.isDown && !buttonsLocked["down"]) {
        console.log("DOWN is pressed");

        myPositionY += MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(
          myPositionX - usernames[myRoomId].width / 2,
          myPositionY - 35
        );
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["down"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "down",
          queueId: currentQueueId,
          username: myUsername,
          room: currentRoom,
        });
        console.log(moveResult);
        buttonsLocked["down"] = false;
      } else if (this.rightKey.isDown && !buttonsLocked["right"]) {
        console.log("RIGHT is pressed");

        myPositionX += MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(
          myPositionX - usernames[myRoomId].width / 2,
          myPositionY - 35
        );
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["right"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "right",
          queueId: currentQueueId,
          username: myUsername,
          room: currentRoom,
        });
        console.log(moveResult);
        buttonsLocked["right"] = false;
      }
    }
  }
}
