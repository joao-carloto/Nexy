document
  .getElementById("postForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = await ensureUserId();
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
      window.location.href = "index.html"; // Redirect to the main page after creating the post
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create post");
    }
  });
