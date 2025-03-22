document
  .getElementById("postForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const userId = document.getElementById("userId").value;
    const postText = document.getElementById("postText").value;
    const image = document.getElementById("image").files[0];

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("postText", postText);
    if (image) {
      formData.append("image", image);
    }

    try {
      const response = await fetch("/posts", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      alert(`Post created with ID: ${result.postId}`);
      loadPosts();
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create post");
    }
  });

document
  .getElementById("commentForm")
  .addEventListener("submit", async (event) => {
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
      loadPosts();
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create comment");
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
      postElement.className = "post";
      postElement.innerHTML = `
          <h3>${post.userId}</h3>
          <p>${post.postText}</p>
          ${
            post.imageFileName
              ? `<img src="/data/images/${post.imageFileName}" alt="Post Image">`
              : ""
          }
          <p>Created at: ${post.createdAt}</p>
          <h4>Comments:</h4>
          <div class="comments">
            ${data.comments
              .filter((comment) => comment.postId === post.id)
              .map(
                (comment) => `
              <div class="comment">
                <p>${comment.userId}: ${comment.commentText}</p>
                <p>Created at: ${comment.createdAt}</p>
              </div>
            `
              )
              .join("")}
          </div>
        `;
      postsContainer.appendChild(postElement);
    });
  } catch (error) {
    console.error("Error loading posts:", error);
  }
}

// Load posts on page load
loadPosts();
