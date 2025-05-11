document
  .getElementById("postForm")
  .addEventListener("submit", function (event) {
    const imageInput = document.getElementById("image");
    if (!imageInput.files || imageInput.files.length === 0) {
      event.preventDefault(); // Prevent form submission
      alert("Please select an image before submitting.");
      imageInput.focus(); // Focus the file input
    }
  });

document
  .getElementById("postForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const postText = document.getElementById("postText").value;
    const image = document.getElementById("image").files[0];

    let userId = localStorage.getItem("randomUser")
      ? JSON.parse(localStorage.getItem("randomUser")).userId
      : "RockStrongo"; // Default userId if not found

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("postText", postText);
    if (image) {
      formData.append("image", image);
    }

    // Show the loading overlay
    const loadingOverlay = document.getElementById("loadingOverlay");
    loadingOverlay.classList.remove("hidden");

    try {
      const response = await fetch("/create_human_post", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create post");
      }

      console.log("Post created successfully:", result);
      // alert(`Post created with ID: ${result.postId}`);
      window.location.href = `post.html?id=${result.postId}`; // Redirect to the post page after creating the post
    } catch (error) {
      console.error("Error:", error);
      alert(`Failed to create post: ${error.message}`);
    } finally {
      // Hide the loading overlay
      loadingOverlay.classList.add("hidden");
    }
  });

document
  .getElementById("postForm")
  .addEventListener("submit", function (event) {
    const imageInput = document.getElementById("image");
    if (!imageInput.files || imageInput.files.length === 0) {
      event.preventDefault(); // Prevent form submission
      alert("Please select an image before submitting.");
      imageInput.focus(); // Focus the file input
    }
  });

document.getElementById("image").addEventListener("change", function (event) {
  const fileNameSpan = document.getElementById("fileName");
  const file = event.target.files[0];
  fileNameSpan.textContent = file ? file.name : "No file chosen";
});
