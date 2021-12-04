// IMPORTANT DO NOT HAVE ANY STATE IN THIS CODE!!!

const HALF_PLAYER_SIZE = 10;
const MOVE_SPEED = 10;
// const DRAW_DISTANCE = 500;
const MOVE_COOLOFF = 100;
const SCREEN_WIDTH = 700;
const SCREEN_HEIGHT = 500; // milliseconds between registering new commands for same user on same core

const lastMoved = {};
const lastChat = {};

Moralis.Cloud.define("sendChat", async (request) => {
  const user = request.user;
  if (!user) {
    return "You need to login!";
  }

  if (lastChat[user.id]) {
    const timeNow = new Date();
    const lastTime = lastChat[user.id];
    const timeDiff = timeNow - lastTime;
    logger.info(timeDiff);

    if (timeDiff < MOVE_COOLOFF) {
      return "chat locked for this user - cooling off";
    }
  }

  const { room, text, username } = request.params;
  const Chat = Moralis.Object.extend(`${room}Chat`);
  const chatEntry = new Chat();
  chatEntry.set("text", text);
  chatEntry.set("player", user);
  chatEntry.set("username", username);

  await chatEntry.save();

  return "chat sent";
});

Moralis.Cloud.define("move", async (request) => {
  const user = request.user;
  if (!user) {
    return "You need to login!";
  }

  if (lastMoved[user.id]) {
    const timeNow = new Date();
    const lastTime = lastMoved[user.id];
    const timeDiff = timeNow - lastTime;
    logger.info(timeDiff);

    if (timeDiff < MOVE_COOLOFF) {
      return "moves locked for this user - cooling off";
    }
  }

  const { direction, queueId, room, isActive, username } = request.params;

  const Room = Moralis.Object.extend(room);

  const query = new Moralis.Query(Room);
  query.equalTo("player", user);
  const roomEntry = await query.first();

  // if first time in room
  if (!roomEntry) {
    const firstEntry = new Room();
    firstEntry.set("player", user);
    firstEntry.set("username", username);
    firstEntry.set(
      "x",
      getRandomInt({
        min: 0 + HALF_PLAYER_SIZE,
        max: SCREEN_WIDTH - HALF_PLAYER_SIZE,
      })
    );
    firstEntry.set(
      "y",
      getRandomInt({
        min: 0 + HALF_PLAYER_SIZE,
        max: SCREEN_HEIGHT - HALF_PLAYER_SIZE,
      })
    );
    await firstEntry.save();

    return;
  }

  if (isActive === false) {
    roomEntry.set("isActive", false);
  } else if (isActive) {
    roomEntry.set("isActive", true);
  }

  if (direction == "up") {
    roomEntry.set("y", roomEntry.get("y") - MOVE_SPEED);
    roomEntry.set("queueId", queueId);
    lastMoved[user.id] = new Date();
  } else if (direction == "down") {
    roomEntry.set("y", roomEntry.get("y") + MOVE_SPEED);
    roomEntry.set("queueId", queueId);
    lastMoved[user.id] = new Date();
  } else if (direction == "left") {
    roomEntry.set("x", roomEntry.get("x") - MOVE_SPEED);
    roomEntry.set("queueId", queueId);
    lastMoved[user.id] = new Date();
  } else if (direction == "right") {
    roomEntry.set("x", roomEntry.get("x") + MOVE_SPEED);
    roomEntry.set("queueId", queueId);
    lastMoved[user.id] = new Date();
  }

  await roomEntry.save();

  return "move registered";
});

Moralis.Cloud.define("playersNearby", async (request) => {
  const user = request.user;

  if (!user) {
    return "You need to login!";
  }

  const { room } = request.params;

  const Room = Moralis.Object.extend(room);
  const query = new Moralis.Query(Room);
  query.equalTo("player", user);
  const userEntry = await query.first();

  if (userEntry) {
    const nearbyPlayerQuery = new Moralis.Query(Room);
    // nearbyPlayerQuery.lessThanOrEqualTo(
    //   "x",
    //   userEntry.get("x") + DRAW_DISTANCE
    // );
    // nearbyPlayerQuery.greaterThanOrEqualTo(
    //   "x",
    //   userEntry.get("x") - DRAW_DISTANCE
    // );
    // nearbyPlayerQuery.lessThanOrEqualTo(
    //   "y",
    //   userEntry.get("y") + DRAW_DISTANCE
    // );
    // nearbyPlayerQuery.greaterThanOrEqualTo(
    //   "y",
    //   userEntry.get("y") - DRAW_DISTANCE
    // );
    nearbyPlayerQuery.equalTo("isActive", true);
    nearbyPlayerQuery.notEqualTo("player", user);
    const nearByPlayers = await nearbyPlayerQuery.find();
    return nearByPlayers;
  } else {
    return "Caller of this function could not be found!";
  }
});
