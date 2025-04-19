/* eslint-disable indent */

document.addEventListener("DOMContentLoaded", () => {
  const userContainer = document.getElementById("user-container");

  // Check if a random user is stored in localStorage
  const storedUser = localStorage.getItem("randomUser");
  if (storedUser) {
    const user = JSON.parse(storedUser);
    userContainer.innerHTML = `
      <img src="/data/profile_pictures/${user.profilePictureName}" alt="Profile Picture" />
      <h2>${user.fullName}</h2>
      <p><strong>User ID:</strong> ${user.userId}</p>
      <p><strong>Description:</strong> ${user.description}</p>
      <p><strong>Country/Region:</strong> ${user.countryRegion}</p>
    `;
  } else {
    userContainer.innerHTML =
      "<p>No user selected. Please go to the Random User page.</p>";
  }
});

document.getElementById("clear-user").addEventListener("click", () => {
  localStorage.removeItem("randomUser");
  alert("Random user cleared. Reload the page to select a new user.");
});

async function loadPosts() {
  try {
    const response = await fetch("/posts");
    const data = await response.json();
    const postsContainer = document.getElementById("posts");
    postsContainer.innerHTML = "";

    data.posts.forEach((post) => {
      const postElement = document.createElement("div");
      postElement.className = "post-thumbnail";
      postElement.innerHTML = `
        <h3>${post.userId}</h3>
        <p>${post.postText.substring(0, 100)}...</p>
        ${
          post.imageFileName
            ? `<img src="/data/images/${post.imageFileName}" alt="Post Image">`
            : ""
        }
        <button onclick="viewPost(${post.id})">View Post</button>
      `;
      postsContainer.appendChild(postElement);
    });
  } catch (error) {
    console.error("Error loading posts:", error);
  }
}

// Load posts on page load
loadPosts();
