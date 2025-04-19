async function ensureUserId() {
  let userId = localStorage.getItem("randomUser")
    ? JSON.parse(localStorage.getItem("randomUser")).userId
    : null;

  if (!userId) {
    try {
      // Fetch a random user from the server
      const response = await fetch("/random-user");
      if (!response.ok) {
        throw new Error("Failed to fetch random user");
      }
      const randomUser = await response.json();

      // Save the random user in localStorage
      localStorage.setItem("randomUser", JSON.stringify(randomUser));
      userId = randomUser.userId;
      console.log("Random user selected:", randomUser);
    } catch (error) {
      console.error("Error fetching random user:", error);
      alert("Failed to select a random user. Please try again.");
    }
  }

  return userId;
}

window.onload = async () => {
  await ensureUserId(); // Ensure a user is selected
};
