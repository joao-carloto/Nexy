document
  .getElementById("generateAIPostForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const topic = document.getElementById("topic").value;
    const isFakeNews = document.getElementById("isFakeNews").value === "true";
    const numComments = document.getElementById("numComments").value;

    try {
      const response = await fetch("/ai_posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic || undefined,
          isFakeNews,
          numComments: numComments ? parseInt(numComments) : undefined,
        }),
      });

      const result = await response.json();
      alert(`Post created with ID: ${result.postId}`);
      window.location.href = "index.html"; // Redirect to the main page after creating the post
    } catch (error) {
      console.error("Error generating post:", error);
      alert("Failed to generate post");
    }
  });
