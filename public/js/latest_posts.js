/* eslint-disable indent */
async function loadPosts() {
  try {
    const response = await fetch("/posts");
    const data = await response.json();
    const postsContainer = document.getElementById("posts");
    postsContainer.innerHTML = "";

    data.posts.forEach((post) => {
      if (post.imageFileName) {
        const postElement = document.createElement("div");
        postElement.className = "post-frame";
        postElement.innerHTML = `
        <h3>${post.userId}</h3>
        <p>${post.postText.substring(0, 100)}...</p>
        ${
          post.imageFileName
            ? `<img src="/post_images/${post.imageFileName}" alt="Post Image">`
            : ""
        }
        <button onclick="viewPost(${post.id})">View Post</button>
      `;
        postsContainer.appendChild(postElement);
      }
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
