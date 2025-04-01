/* eslint-disable indent */
document.addEventListener("DOMContentLoaded", () => {
  const commentForm = document.getElementById("commentForm");
  if (commentForm) {
    commentForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const postId = document.getElementById("postId").value;
      const userId = document.getElementById("commentUserId").value;
      const commentText = document.getElementById("commentText").value;

      const commentData = {
        postId,
        userId,
        commentText,
      };

      try {
        const response = await fetch("/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(commentData),
        });
        const result = await response.json();
        alert(`Comment created with ID: ${result.commentId}`);
        location.reload(); // Reload the page to show the new comment
      } catch (error) {
        console.error("Error:", error);
        alert("Failed to create comment");
      }
    });
  }
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

async function loadThumbnails() {
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

function viewPost(postId) {
  window.location.href = `/post.html?id=${postId}`;
}

// Load posts on page load
loadPosts();
