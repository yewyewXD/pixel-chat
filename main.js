Moralis.initialize("UuODzE6wvQ33uBGpHNI9psoJLOpCF2EZD0yG2E6d"); // Application id from moralis.io
Moralis.serverURL = "https://vrbdy1tqiytg.usemoralis.com:2053/server"; //Server url from moralis.io

const buttonsLocked = {};
let gameInitialized = false;

const PLAYER_SIZE = 50;
const MOVE_SPEED = 15;

const MOVE_COOLOFF = 300;
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
let currentRoom = localStorage.getItem("currentRoom");

window.onload = () => {
  currentRoomElement.innerText = currentRoom;
};

async function login() {
  console.log("login clicked");
  const user = await Moralis.Web3.authenticate();
  if (user) {
    console.log(user);
    location.reload();
  }
}

async function selectRoom(room) {
  if (currentRoom !== "Lobby" && currentRoom !== room) {
    await Moralis.Cloud.run("move", {
      direction: null,
      queueId: null,
      room: currentRoom,
      isActive: false,
    });
  }
  localStorage.setItem("currentRoom", room);
  window.location.reload();
}

async function leaveRoom() {
  await Moralis.Cloud.run("move", {
    direction: null,
    queueId: null,
    room: currentRoom,
    isActive: false,
  });
  localStorage.setItem("currentRoom", "Lobby");
  window.location.reload();
}

console.log(Moralis.User.current());

function loadGame() {
  const config = {
    type: Phaser.AUTO,
    parent: "phaser-parent",
    width: 1200,
    height: 700,
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

  const game = new Phaser.Game(config);

  let users = [];
  let usernames = [];

  let context;
  function preload() {
    context = this;
  }

  async function create() {
    if (currentRoom === "Lobby") {
      return;
    } else if (!currentRoom) {
      localStorage.setItem("currentRoom", "Lobby");
      console.log("no current room");
      return;
    }

    if (!Moralis.User.current()) return;

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
      const loginId = Moralis.User.current().id;

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
          moved.get("player").id === loginId ? 0x6666ff : 0xffffff
        );

        usernames[roomId] = this.add.text(newX - 13, newY - 55, "Me", {
          font: "20px bold",
          fontFamily: "'Press Start 2P', cursive",
          color: "white",
        });
      } else if (
        roomId === myRoomId &&
        (newX !== myPositionX || newY !== myPositionY) &&
        moved.get("queueId") === currentQueueId
      ) {
        users[roomId].setPosition(newX, newY);
        usernames[roomId].setPosition(newX - 13, newY - 55);
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
      strokedCircleEl.style = `stroke-dasharray: ${
        440 - (440 * coolOffPercent) / 100
      } !important`;
      return;
    } else if (!hasDoneCoolOff) {
      hasDoneCoolOff = true;
      strokedCircleEl.style = `stroke-dasharray: 0 !important`;
      coolOffPercentEl.innerText = "100%";
    }

    if (this.wKey.isDown) {
      if (!buttonsLocked["up"]) {
        console.log("W is pressed");

        myPositionY -= MOVE_SPEED;
        users[myRoomId].setPosition(myPositionX, myPositionY);
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 55);
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 55);
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 55);
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
        usernames[myRoomId].setPosition(myPositionX - 13, myPositionY - 55);
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