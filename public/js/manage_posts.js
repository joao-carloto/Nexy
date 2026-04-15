async function loadPostsWithDeleteButtons() {
  try {
    // Admin dashboard fetches a large list to render all removable post thumbnails.
    const response = await fetch(`/posts?search=${encodeURIComponent('')}&limit=1000`);
    const data = await response.json();
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    data.posts.forEach((post) => {
      if (post.imageFileName) {
        // Convert <id>.png to <id>-thumbnail.png to match server thumbnail naming.
        const fileNameWithoutExt = post.imageFileName.split('.').slice(0, -1).join('.');
        const fileExt = post.imageFileName.split('.').pop();
        const thumbnailFileName = `${fileNameWithoutExt}-thumbnail.${fileExt}`;

        const postElement = document.createElement('div');
        postElement.className = 'post-thumbnail';
        postElement.innerHTML = `
            <img 
              src="/thumbnails/post_images/${thumbnailFileName}" 
              alt="Post Thumbnail" 
              class="thumbnail-image"
            >
            <button class="delete-post-button" onclick="deletePost('${post.id}')">Delete</button>
          `;
        postsContainer.appendChild(postElement);
      }
    });
  } catch (error) {
    console.error('Error loading posts:', error);
  }
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
    return;
  }

  try {
    // Admin delete API: DELETE /posts/:postId
    const response = await fetch(`/posts/${postId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      // Reload list to reflect DB + filesystem deletion performed by server.
      loadPostsWithDeleteButtons(); // Reload the posts after deletion
    } else {
      throw new Error('Failed to delete post');
    }
  } catch (error) {
    console.error('Error deleting post:', error);
    alert('Failed to delete post. Please try again.');
  }
}

loadPostsWithDeleteButtons();
