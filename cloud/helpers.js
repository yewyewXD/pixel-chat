function getRandomInt({ min, max }) {
  const randomInt = Math.floor(Math.random() * (max - min + 1) + min);
  return Math.ceil(randomInt / 5) * 5; // dividable by 5
}
