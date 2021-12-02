Moralis.initialize("UuODzE6wvQ33uBGpHNI9psoJLOpCF2EZD0yG2E6d"); // Application id from moralis.io
Moralis.serverURL = "https://vrbdy1tqiytg.usemoralis.com:2053/server"; //Server url from moralis.io

let context;
let game;

const currentUser =
  Moralis.User.current() ||
  JSON.parse(localStorage.getItem("currentUser"))?.user;

const buttonsLocked = {};
let gameInitialized = false;

const PLAYER_SIZE = 20;
const MOVE_SPEED = 10;

const MOVE_COOLOFF = 500;
let hasDoneCoolOff = true;
const coolOffPercentEl = document.getElementById("cool-off-percentage");
const strokedCircleEl = document.querySelector(".StrokedCircle");

let lastMove = 0; // date

let myPositionX = 0;
let myPositionY = 0;
let myRoomId = "";

// server move request queue
let currentQueueId = 0;

const currentRoomElement = document.getElementById("current-room");
let currentRoom = "Lobby";

const loginScreenElement = document.querySelector(".LoginScreen");

const chatElement = document.querySelector(".Chat");
const chatViewElement = document.querySelector(".Chat__View");

window.onload = () => {
  currentRoomElement.innerText = currentRoom;
  highlightRoomButton("Lobby");

  if (
    JSON.parse(localStorage.getItem("currentUser"))?.expiry <= new Date() ||
    !currentUser?.id
  ) {
    localStorage.setItem("currentUser", "");

    if (loginScreenElement.style.display !== "flex") {
      loginScreenElement.style.display = "flex";
    }
  }
};

async function login() {
  console.log("login clicked");
  const user = await Moralis.Web3.authenticate();
  if (user) {
    console.log(user);
    const storedUser = {
      user,
      expiry: new Date() + 3.6e6, // 1 hour
    };
    localStorage.setItem("currentUser", JSON.stringify(storedUser));
    loginScreenElement.style.opacity = 0;
    setTimeout(() => {
      loginScreenElement.style.display = "none";
    }, 500);
  }
}

async function selectRoom(room) {
  if (currentRoom === room) return;

  highlightRoomButton(room);
  await Moralis.Cloud.run("move", {
    direction: null,
    queueId: null,
    room: currentRoom,
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

  if (room === "Lobby") {
    chatElement.style.display = "none";
  } else {
    chatElement.style.display = "flex";
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
    isActive: false,
  });
  currentRoom = "Lobby";
  currentRoomElement.innerText = "Lobby";
  if (game) {
    game.destroy(true, false);
  }
}

const formInputEl = document.querySelector(".ChatForm__Input");
async function handleSendChat(e) {
  e.preventDefault();
  const inputValue = formInputEl.value;
  const newChatText = document.createElement("div");
  newChatText.innerText = inputValue;
  chatViewElement.appendChild(newChatText);
  formInputEl.value = "";
  await Moralis.Cloud.run("sendChat", {
    room: currentRoom,
    text: inputValue,
    roomId: myRoomId,
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
      const loginId = currentUser?.id;

      // if new player
      if (!users[roomId]) {
        if (moved.get("player").id === loginId) {
          // remember my position and id
          myPositionX = newX;
          myPositionY = newY;
          myRoomId = roomId;
        }

        // create new player
        users[roomId] = this.add.rectangle(
          newX,
          newY,
          PLAYER_SIZE,
          PLAYER_SIZE,
          moved.get("player").id === loginId ? 0xff0000 : 0xffffff
        );

        usernames[roomId] = this.add.text(newX - 13, newY - 35, "Me", {
          font: "18px bold",
          fontFamily: "'Press Start 2P', cursive",
          color: "white",
        });
      } else if (
        roomId === myRoomId &&
        (newX !== myPositionX || newY !== myPositionY) &&
        moved.get("queueId") === currentQueueId
      ) {
        users[roomId].setPosition(newX, newY);
        usernames[roomId].setPosition(newX - 13, newY - 35);
        myPositionX = newX;
        myPositionY = newY;
      } else if (moved.get("isActive") === false) {
        users[roomId].destroy();
        users[roomId] = null;
      } else {
        users[roomId].setPosition(newX, newY);
      }
    });
    //just to register the player
    await Moralis.Cloud.run("move", {
      direction: null,
      queueId: null,
      room: currentRoom,
      isActive: true,
    });

    const chatQuery = new Moralis.Query(`${currentRoom}Chat`);
    const chatSub = await chatQuery.subscribe();
    chatSub.on("create", (chat) => {
      const text = chat.get("text");
      const chatSender = chat.get("player");
      if (chatSender?.id !== currentUser?.id) {
        const newChatText = document.createElement("div");
        newChatText.innerText = text;
        chatViewElement.appendChild(newChatText);
      }
    });

    const nearbyPlayers = await Moralis.Cloud.run("playersNearby", {
      room: currentRoom,
    });
    nearbyPlayers.forEach((player) => {
      users[player.id] = this.add.rectangle(
        player.get("x"),
        player.get("y"),
        PLAYER_SIZE,
        PLAYER_SIZE,
        0xffffff
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
      if (strokedCircleEl.style !== "stroke-dasharray: 440 !important") {
        strokedCircleEl.style = "stroke: black !important";
      }
      return;
    } else if (!hasDoneCoolOff) {
      hasDoneCoolOff = true;
      coolOffPercentEl.innerText = "100%";
      strokedCircleEl.style = `stroke: red !important`;
    }

    if (this.wKey.isDown) {
      if (!buttonsLocked["up"]) {
        console.log("W is pressed");

        myPositionY -= MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 35);
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["up"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "up",
          queueId: currentQueueId,
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 35);
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["left"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "left",
          queueId: currentQueueId,
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 35);
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["down"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "down",
          queueId: currentQueueId,
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 35);
        lastMove = new Date();
        currentQueueId += 1;

        buttonsLocked["right"] = true;
        let moveResult = await Moralis.Cloud.run("move", {
          direction: "right",
          queueId: currentQueueId,
          room: currentRoom,
        });
        console.log(moveResult);
        buttonsLocked["right"] = false;
      }
    }
  }
}
