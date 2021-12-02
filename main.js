Moralis.initialize("UuODzE6wvQ33uBGpHNI9psoJLOpCF2EZD0yG2E6d"); // Application id from moralis.io
Moralis.serverURL = "https://vrbdy1tqiytg.usemoralis.com:2053/server"; //Server url from moralis.io
Moralis.masterKey = "qXaCDPBjdEdmvFoTFFP5JLHgzpLr5Ilob2LLYd3d";

const currentUser =
  Moralis.User.current() ||
  JSON.parse(window.localStorage.getItem("currentUser"))?.user;

let context;
let game;
let gameInitialized = false;

const PLAYER_SIZE = 20;
const MOVE_SPEED = 10;
let lastMove = 0; // date
const buttonsLocked = {};

const MOVE_COOLOFF = 300;
let hasDoneCoolOff = true;
const coolOffPercentEl = document.getElementById("cool-off-percentage");
const coolOffCircle = document.querySelector(".StrokedCircle");

let myPositionX = 0;
let myPositionY = 0;
let myRoomId = "";
let myUsername = window.localStorage.getItem("username") || "";

// server move request queue
let currentQueueId = 0;
const currentRoomElement = document.getElementById("current-room");
let currentRoom = "Lobby";

const loginScreenElement = document.querySelector(".LoginScreen");
const loginBtnEl = document.getElementById("login-btn");
const logoutBtnEl = document.getElementById("logout-btn");

const chatElement = document.querySelector(".Chat");
const chatViewElement = document.querySelector(".Chat__View");
const chatInputEl = document.querySelector(".ChatForm__Input");
const chatUsernameEl = document.querySelector(".ChatForm__Username");

window.onload = () => {
  currentRoomElement.innerText = currentRoom;
  highlightRoomButton("Lobby");

  if (
    JSON.parse(window.localStorage.getItem("currentUser"))?.expiry <=
      new Date() ||
    !currentUser?.id
  ) {
    window.localStorage.removeItem("currentUser");

    if (loginScreenElement.style.display !== "flex") {
      loginScreenElement.style.display = "flex";
    }
  }

  if (myUsername) {
    chatUsernameEl.innerText = myUsername;
  }
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
    console.log(user);
    const storedUser = {
      user,
      expiry: new Date() + 3.6e6, // 1 hour
    };
    window.localStorage.setItem("currentUser", JSON.stringify(storedUser));
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
  if (currentRoom === room) return;

  highlightRoomButton(room);
  await Moralis.Cloud.run("move", {
    direction: null,
    queueId: null,
    room: currentRoom,
    username: myUsername,
    isActive: false,
  });
  const previousRoom = currentRoom;
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

async function handleSendChat(e) {
  e.preventDefault();
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
    width: 700,
    height: 500,
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

  let users = [];
  let usernames = [];

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

    this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    const query = new Moralis.Query(currentRoom);
    const subscription = await query.subscribe();
    subscription.on("update", (moved) => {
      const roomId = moved.id;
      const newX = moved.get("x");
      const newY = moved.get("y");

      // if I were never here
      if (!users[roomId]) {
        // remember my position and id
        myPositionX = newX;
        myPositionY = newY;
        myRoomId = roomId;

        // create new character
        users[roomId] = this.add.rectangle(
          newX,
          newY,
          PLAYER_SIZE,
          PLAYER_SIZE,
          0xff0000
        );

        usernames[roomId] = this.add.text(newX - 13, newY - 35, myUsername, {
          font: "18px bold",
          fontFamily: "'Press Start 2P', cursive",
          color: "white",
        });

        usernames[roomId].setPosition(
          newX - usernames[myRoomId].width / 2,
          newY - 35
        );
      } else if (
        // change my position
        roomId === myRoomId &&
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
      } else if (moved.get("isActive") === false) {
        users[roomId].destroy();
        users[roomId] = null;
      } else {
        // change other player's position
        users[roomId].setPosition(newX, newY);
        usernames[roomId].setPosition(
          newX - usernames[roomId].width / 2,
          newY - 35
        );
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

    // dont move if cool off hasnt passed
    if (new Date() - lastMove < MOVE_COOLOFF) {
      if (hasDoneCoolOff) hasDoneCoolOff = false;
      const coolOffPercent = Math.round(
        ((new Date() - lastMove) / MOVE_COOLOFF) * 100
      );
      coolOffPercentEl.innerText = `${coolOffPercent} %`;
      if (coolOffCircle.style !== "stroke-dasharray: 440 !important") {
        coolOffCircle.style = "stroke: black !important";
      }
      return;
    } else if (!hasDoneCoolOff) {
      hasDoneCoolOff = true;
      coolOffPercentEl.innerText = "100%";
      coolOffCircle.style = `stroke: red !important`;
    }

    if (this.wKey.isDown) {
      if (!buttonsLocked["up"]) {
        console.log("W is pressed");

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
      }
    } else if (this.aKey.isDown) {
      if (!buttonsLocked["left"]) {
        console.log("A is pressed");

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
      }
    } else if (this.sKey.isDown) {
      if (!buttonsLocked["down"]) {
        console.log("S is pressed");

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
      }
    } else if (this.dKey.isDown) {
      if (!buttonsLocked["right"]) {
        console.log("D is pressed");

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
