document.getElementById('postForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const topic = document.getElementById('topic').value;
  const isFakeNews = document.getElementById('isFakeNews').value === 'true';
  const numComments = document.getElementById('numComments').value;

  // Show the loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.classList.remove('hidden');

  try {
    const response = await fetch('/create_bot_post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic, isFakeNews, numComments }),
    });

    if (response.ok) {
      const result = await response.json();
      window.location.href = `/post.html?id=${result.postId}`; // Redirect to the post page after creating the post
    } else {
      const errorData = await response.json();
      alert('Failed to create bot post: ' + (errorData.error || response.statusText));
      throw new Error(errorData.error || response.statusText);
    }
  } catch (error) {
    console.error('Error:', error);
    alert(`Failed to create post: ${error.message}`);
  } finally {
    // Hide the loading overlay
    loadingOverlay.classList.add('hidden');
  }
});
