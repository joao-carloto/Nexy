function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split(".")[0].replace("T", " ");
}

document.addEventListener("DOMContentLoaded", () => {
  const commentForm = document.getElementById("commentForm");
  const commentText = document.getElementById("commentText");
  const commentTone = document.getElementById("commentTone");
  const generateCommentButton = document.getElementById("generateComment");

  // Load the post details
  async function loadPost() {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get("id");

    try {
      const response = await fetch(`/posts/${postId}`);
      const post = await response.json();
      const postContainer = document.getElementById("post");

      postContainer.innerHTML = `
        <div class="post-details">
          <h3>${post.userId}</h3>
          <p class="post-text">${post.postText}</p>
          ${
            post.imageFileName
              ? `<img src="/data/images/${post.imageFileName}" alt="Post Image" class="post-image">`
              : ""
          }
          <p class="post-date">Created at: ${formatDate(post.createdAt)}</p>
          <h4>Comments:</h4>
          <div class="comments">
            ${post.comments
              .map(
                (comment) => `
              <div class="comment">
                <p class="comment-user">${comment.userId}:</p>
                <p class="comment-text">${comment.commentText}</p>
                <p class="comment-date">Created at: ${formatDate(
                  comment.createdAt
                )}</p>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;

      // Pre-fill the postId in the comment form
      document.getElementById("postId").value = postId;
    } catch (error) {
      console.error("Error loading post:", error);
    }
  }

  // Generate a comment and add it automatically
  async function generateAndAddComment() {
    const postId = document.getElementById("postId").value;
    const tone = commentTone.value;
    const userId = localStorage.getItem("randomUser")
      ? JSON.parse(localStorage.getItem("randomUser")).userId
      : null;

    if (!userId) {
      alert("No user selected. Please select a user first.");
      return;
    }

    try {
      // Generate the comment text
      const response = await fetch("/generate-comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId, tone }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate comment");
      }

      const { commentText } = await response.json();

      // Add the generated comment to the post
      const addCommentResponse = await fetch("/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId, userId, commentText }),
      });

      if (addCommentResponse.ok) {
        alert("Comment added successfully!");
        loadPost(); // Reload the post to show the new comment
      } else {
        throw new Error("Failed to add comment");
      }
    } catch (error) {
      console.error("Error generating or adding comment:", error);
      alert("Failed to generate or add comment. Please try again.");
    }
  }

  // Add a comment manually
  async function addManualComment(event) {
    event.preventDefault();

    const postId = document.getElementById("postId").value;
    const userId = localStorage.getItem("randomUser")
      ? JSON.parse(localStorage.getItem("randomUser")).userId
      : null;
    const commentTextValue = commentText.value;

    if (!userId) {
      alert("No user selected. Please select a user first.");
      return;
    }

    try {
      const response = await fetch("/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId, userId, commentText: commentTextValue }),
      });

      if (response.ok) {
        alert("Comment added successfully!");
        commentText.value = ""; // Clear the comment text
        loadPost(); // Reload the post to show the new comment
      } else {
        throw new Error("Failed to add comment");
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      alert("Failed to add comment. Please try again.");
    }
  }

  // Attach event listeners
  generateCommentButton.addEventListener("click", generateAndAddComment);
  commentForm.addEventListener("submit", addManualComment);

  // Load the post on page load
  loadPost();
});
