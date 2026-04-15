function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('.')[0].replace('T', ' ');
}

function getUserThumbnail(userId, profilePictureName) {
  if (profilePictureName) {
    // Thumbnail naming contract: <userId>-thumbnail.png
    return `/thumbnails/profile_pictures/${userId}-thumbnail.png`;
  }
  return 'images/logo.png';
}

document.addEventListener('DOMContentLoaded', () => {
  // Remembers one antagonist per (postId, userId) pair to keep reply identity stable.
  const ANTAGONIST_STORAGE_KEY = 'antagonistUserByPostAndUser';
  const commentForm = document.getElementById('commentForm');
  const commentText = document.getElementById('commentText');
  const commentTone = document.getElementById('commentTone');
  const addBotCommentButton = document.getElementById('addBotComment');

  function getAntagonistStorageMap() {
    try {
      const raw = localStorage.getItem(ANTAGONIST_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function getAntagonistStorageKey(postId, userId) {
    // Composite key prevents collisions when same user comments in multiple posts.
    return `${postId}::${userId}`;
  }

  function getStoredAntagonistUserId(postId, userId) {
    if (!postId || !userId) return null;
    const map = getAntagonistStorageMap();
    const key = getAntagonistStorageKey(postId, userId);
    const stored = map[key];
    return typeof stored === 'string' && stored.trim() !== '' ? stored : null;
  }

  function storeAntagonistUserId(postId, userId, antagonistUserId) {
    if (!postId || !userId || !antagonistUserId) return;
    const map = getAntagonistStorageMap();
    const key = getAntagonistStorageKey(postId, userId);
    map[key] = antagonistUserId;
    localStorage.setItem(ANTAGONIST_STORAGE_KEY, JSON.stringify(map));
  }

  // Show glasspanel overlay
  function showLoadingOverlay(message = 'Generating bot comment...') {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const msg = overlay.querySelector('.loading-message');
      if (msg) msg.textContent = message;
    }
  }

  // Hide glasspanel overlay
  function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // Load the post details
  async function loadPost() {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    if (!postId) {
      // No identifier – redirect to 404 page
      window.location.href = '/404.html';
      return;
    }

    try {
      // Data source for this page: GET /posts/:postId (returns post + comments).
      const response = await fetch(`/posts/${postId}`);
      if (response.status === 404) {
        // Post not found – redirect to 404
        window.location.href = '/404.html';
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load post: ' + response.status);
      }
      const post = await response.json();
      if (!post || post.error || !post.postText) {
        // Unexpected structure / error field present
        window.location.href = '/404.html';
        return;
      }
      const postContainer = document.getElementById('post');

      const postUserThumbSrc = getUserThumbnail(post.userId, post.authorProfilePicture);

      postContainer.innerHTML = `
          <div class="post-details">
            <div class="post-user-header">
              <img src="${postUserThumbSrc}" alt="${post.userId}" class="post-user-thumbnail" onerror="this.src='images/logo.png'" />
              <h3>${post.userId}</h3>
            </div>
            <p class="post-text">${post.postText}</p>
          ${
            post.imageFileName
              ? `<img src="/post_images/${post.imageFileName}" alt="Post Image" class="post-image">`
              : ''
          }
          <p class="post-date">Created at: ${formatDate(post.createdAt)}</p>
          <h4>Comments:</h4>
          <div class="comments">
            ${post.comments
              .map((comment) => {
                const thumbSrc = getUserThumbnail(comment.userId, comment.authorProfilePicture);
                return `
              <div class="comment">
                <div class="comment-header">
                  <img src="${thumbSrc}" alt="${comment.userId}" class="comment-author-thumbnail" onerror="this.src='images/logo.png'" />
                  <p class="comment-user">${comment.userId}</p>
                </div>
                <p class="comment-text">${comment.commentText}</p>
                <p class="comment-date">Created at: ${formatDate(comment.createdAt)}</p>
              </div>
            `;
              })
              .join('')}
          </div>
        </div>
      `;

      // Hidden form field is reused by both comment actions below.
      document.getElementById('postId').value = postId;
    } catch (error) {
      console.error('Error loading post:', error);
      window.location.href = '/404.html';
    }
  }

  // Generate a comment and add it automatically
  async function generateAndAddComment() {
    showLoadingOverlay();
    const postId = document.getElementById('postId').value;
    const tone = commentTone.value;
    const userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;

    if (!userId) {
      hideLoadingOverlay();
      alert('No user selected. Please select a user first.');
      return;
    }

    try {
      // Step 1: ask server to generate text with selected tone.
      const response = await fetch('/generate-comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, tone }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate comment');
      }

      const { commentText } = await response.json();

      // Step 2: persist generated text as a regular human comment.
      const addCommentResponse = await fetch('/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, userId, commentText }),
      });

      if (addCommentResponse.ok) {
        loadPost(); // Reload the post to show the new comment
      } else {
        throw new Error('Failed to add comment');
      }
    } catch (error) {
      console.error('Error generating or adding comment:', error);
      alert('Failed to generate or add comment. Please try again.');
    } finally {
      hideLoadingOverlay();
    }
  }

  // Add a comment manually
  async function addHumanComment(event) {
    event.preventDefault();

    showLoadingOverlay("Wait. Someone's answering to your comment.");

    const postId = document.getElementById('postId').value;
    const userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;
    const commentTextValue = commentText.value;
    const storedAntagonistUserId = getStoredAntagonistUserId(postId, userId);

    if (!userId) {
      hideLoadingOverlay();
      alert('No user selected. Please select a user first.');
      return;
    }

    try {
      // This route stores human comment and appends an automatic bot reply.
      const response = await fetch('/human_comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId,
          userId,
          commentText: commentTextValue,
          antagonistUserId: storedAntagonistUserId,
        }),
      });

      if (response.ok) {
        const responseBody = await response.json().catch(() => null);
        // Persist antagonist id to keep the same opponent across future replies.
        if (responseBody?.antagonistUserId) {
          storeAntagonistUserId(postId, userId, responseBody.antagonistUserId);
        }
        commentText.value = ''; // Clear the comment text
        loadPost(); // Reload the post to show the new comment
      } else {
        throw new Error('Failed to add comment: ' + response.statusText);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.' + error);
    } finally {
      hideLoadingOverlay();
    }
  }

  // Attach event listeners
  addBotCommentButton.addEventListener('click', generateAndAddComment);
  commentForm.addEventListener('submit', addHumanComment);

  // Load the post on page load
  loadPost();
});
