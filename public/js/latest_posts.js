/* eslint-disable indent */
function t(key, fallback) {
  return window.NexyI18n ? window.NexyI18n.t(key, fallback) : fallback;
}

function formatPostDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadPosts() {
  try {
    const response = await fetch('/posts');
    const data = await response.json();
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    data.posts.forEach((post) => {
      if (post.imageFileName) {
        const postElement = document.createElement('div');
        postElement.className = 'post-frame';
        const thumbSrc = post.authorProfilePicture
          ? `/thumbnails/profile_pictures/${post.userId}-thumbnail.png`
          : 'images/logo.png';
        postElement.innerHTML = `
        <div class="post-card-header">
          <img src="${thumbSrc}" alt="${post.userId}" class="post-user-thumbnail" onerror="this.src='images/logo.png'" />
          <div class="post-card-identity">
            <span class="post-card-username">${post.userId}</span>
            <span class="post-card-date">${formatPostDate(post.createdAt)}</span>
          </div>
        </div>
        <p class="post-card-text">${post.postText.substring(0, 250)}...</p>
        <img src="/post_images/${post.imageFileName}" alt="Post Image" class="post-card-image" onclick="viewPost('${post.id}')" />
        <div class="post-card-footer">
          <button class="post-card-view-btn" onclick="viewPost('${post.id}')">${t('latestPosts.viewPost', 'View Post')}</button>
        </div>
      `;
        postsContainer.appendChild(postElement);
      }
    });
  } catch (error) {
    console.error('Error loading posts:', error);
  }
}

function viewPost(postId) {
  window.location.href = `/post.html?id=${postId}`;
}

// Load posts on page load
loadPosts();
