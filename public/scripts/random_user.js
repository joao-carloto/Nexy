document.addEventListener("DOMContentLoaded", () => {
  const userContainer = document.getElementById("user-container");
  const profilePicture = document.getElementById("profile-picture");
  const fullName = document.getElementById("full-name");
  const userId = document.getElementById("user-id");
  const description = document.getElementById("description");
  const countryRegion = document.getElementById("country-region");
  const loadUserButton = document.getElementById("load-user");

  // Function to display user information
  function displayUser(user) {
    profilePicture.src = `/data/profile_pictures/${user.profilePictureName}`;
    fullName.textContent = user.fullName;
    userId.textContent = user.userId;
    description.textContent = user.description;
    countryRegion.textContent = user.countryRegion;
  }

  // Function to fetch a random user from the server
  async function fetchRandomUser() {
    try {
      const response = await fetch("/random-user");
      if (!response.ok) {
        throw new Error("Failed to fetch random user");
      }
      const user = await response.json();
      // Store the user in localStorage
      localStorage.setItem("randomUser", JSON.stringify(user));
      return user;
    } catch (error) {
      console.error("Error fetching random user:", error);
      userContainer.innerHTML = "<p>Failed to load user. Please try again.</p>";
    }
  }

  // Function to load a random user (from localStorage or server)
  async function loadRandomUser() {
    // Check if a random user is already stored in localStorage
    const storedUser = localStorage.getItem("randomUser");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      displayUser(user);
    } else {
      // Fetch a new random user from the server
      const user = await fetchRandomUser();
      if (user) {
        displayUser(user);
      }
    }
  }

  // Load a random user when the page loads
  loadRandomUser();

  // Load another random user when the button is clicked
  loadUserButton.addEventListener("click", async () => {
    const user = await fetchRandomUser();
    if (user) {
      displayUser(user);
    }
  });
});
