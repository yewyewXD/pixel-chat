// IMPORTANT DO NOT HAVE ANY STATE IN THIS CODE!!!

const HALF_PLAYER_SIZE = 25;
const MOVE_SPEED = 15;
const DRAW_DISTANCE = 500;
const MOVE_COOLOFF = 2000;
const SCREEN_WIDTH = 1200;
const SCREEN_HEIGHT = 700; // milliseconds between registering new commands for same user on same core

// var lastMoved = {};

Moralis.Cloud.define("move", async (request) => {
  const user = request.user;
  if (!user) {
    alert("You need to login!");
    return;
  }

  // if (lastMoved[user.id]) {
  //   let timeNow = new Date();
  //   let lastTime = lastMoved[user.id];
  //   let timeDiff = timeNow - lastTime;
  //   logger.info(timeDiff);

  //   if (timeDiff < MOVE_COOLOFF) {
  //     return "moves locked for this user - cooling off";
  //   }
  // }

  // lastMoved[user.id] = new Date();

  const { direction, queueId, room } = request.params;

  const Room = Moralis.Object.extend(room);

  const query = new Moralis.Query(Room);
  query.equalTo("player", user);
  const roomEntry = await query.first();

  if (!roomEntry) {
    const roomEntry = new Room();
    roomEntry.set("player", user);
    roomEntry.set(
      "x",
      getRandomInt({
        min: 0 + HALF_PLAYER_SIZE,
        max: SCREEN_WIDTH - HALF_PLAYER_SIZE,
      })
    );
    roomEntry.set(
      "y",
      getRandomInt({
        min: 0 + HALF_PLAYER_SIZE,
        max: SCREEN_HEIGHT - HALF_PLAYER_SIZE,
      })
    );
    await roomEntry.save();
  }

  if (direction == "up") {
    roomEntry.set("y", roomEntry.get("y") - MOVE_SPEED);
    roomEntry.set("queueId", queueId);
  } else if (direction == "down") {
    roomEntry.set("y", roomEntry.get("y") + MOVE_SPEED);
    roomEntry.set("queueId", queueId);
  } else if (direction == "left") {
    roomEntry.set("x", roomEntry.get("x") - MOVE_SPEED);
    roomEntry.set("queueId", queueId);
  } else if (direction == "right") {
    roomEntry.set("x", roomEntry.get("x") + MOVE_SPEED);
    roomEntry.set("queueId", queueId);
  }

  await roomEntry.save();

  return "move registered";
});

Moralis.Cloud.define("playersNearby", async (request) => {
  const user = request.user;

  if (!user) {
    alert("You need to login!");
    return;
  }

  const { room } = request.params;

  const Room = Moralis.Object.extend(room);
  const query = new Moralis.Query(Room);
  query.equalTo("player", user);
  const userEntry = await query.first();

  if (userEntry) {
    const nearbyPlayerQuery = new Moralis.Query(Room);
    nearbyPlayerQuery.lessThanOrEqualTo(
      "x",
      userEntry.get("x") + DRAW_DISTANCE
    );
    nearbyPlayerQuery.greaterThanOrEqualTo(
      "x",
      userEntry.get("x") - DRAW_DISTANCE
    );
    nearbyPlayerQuery.lessThanOrEqualTo(
      "y",
      userEntry.get("y") + DRAW_DISTANCE
    );
    nearbyPlayerQuery.greaterThanOrEqualTo(
      "y",
      userEntry.get("y") - DRAW_DISTANCE
    );
    nearbyPlayerQuery.notEqualTo("player", user);
    const nearByPlayers = await nearbyPlayerQuery.find();
    return nearByPlayers;
  } else {
    return "Caller of this function could not be found!";
  }
});
