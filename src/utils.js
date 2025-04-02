function getRandomElement(arr) {
  // Generate a random index based on the array length
  const randomIndex = Math.floor(Math.random() * arr.length);
  // Return the element at the random index
  return arr[randomIndex];
}

function getRandomBoolean() {
  return Math.random() >= 0.5;
}

export { getRandomElement, getRandomBoolean };
