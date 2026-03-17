let currentSearch = ''; // Store the current search term
let currentLimit = 10; // Default limit for the number of posts
let debounceTimeout; // Timeout ID for debounce

async function loadThumbnails(search = '', limit = 1000) {
  try {
    currentSearch = search; // Update the current search term
    currentLimit = limit; // Update the current limit

    const response = await fetch(`/posts?search=${encodeURIComponent(search)}&limit=${limit}`);
    const data = await response.json();
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';

    data.posts.forEach((post) => {
      if (post.imageFileName) {
        // Add the "-thumbnail" suffix before the file extension
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
              onclick="viewPost('${post.id}')"
            >
          `;
        postsContainer.appendChild(postElement);
      }
    });
  } catch (error) {
    console.error('Error loading posts:', error);
  }
}

function debounce(func, delay) {
  return function (...args) {
    clearTimeout(debounceTimeout); // Clear the previous timeout
    debounceTimeout = setTimeout(() => func(...args), delay); // Set a new timeout
  };
}

const filterPosts = debounce(() => {
  const searchText = document.getElementById('searchBox').value;
  loadThumbnails(searchText, currentLimit); // Reload posts with the search term
}, 300); // 300ms delay

function viewPost(postId) {
  window.location.href = `/post.html?id=${postId}`;
}

// Load thumbnails on page load
loadThumbnails();
