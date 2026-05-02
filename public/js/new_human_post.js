// Client-side guard: current UX requires image selection before submit.
document.getElementById('postForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const imageInput = document.getElementById('image');
  if (!imageInput.files || imageInput.files.length === 0) {
    alert('Please select an image before submitting.');
    imageInput.focus();
    return;
  }

  const postText = document.getElementById('postText').value;
  const image = imageInput.files[0];

  let userId = localStorage.getItem('randomUser')
    ? JSON.parse(localStorage.getItem('randomUser')).userId
    : 'RockStrongo'; // Default userId if not found

  // Read current UI language from i18n storage and send with post.
  let locale = 'en';
  try {
    const saved = localStorage.getItem('nexy.locale');
    if (saved) {
      locale = String(saved).toLowerCase();
    }
  } catch (e) {
    // Fallback to default if storage read fails
  }

  // Multipart contract expected by POST /create_human_post.
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('postText', postText);
  formData.append('locale', locale);
  if (image) {
    formData.append('image', image);
  }

  // Show the loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.classList.remove('hidden');

  try {
    // Server endpoint: creates post, processes image, and returns postId.
    const response = await fetch('/create_human_post', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create post');
    }

    console.log('Post created successfully:', result);
    // alert(`Post created with ID: ${result.postId}`);
    // Post detail page reads id from query string and fetches /posts/:postId.
    window.location.href = `/post.html?id=${result.postId}`; // Redirect to the post page after creating the post
  } catch (error) {
    console.error('Error:', error);
    alert(`Failed to create post: ${error.message}`);
  } finally {
    // Hide the loading overlay
    loadingOverlay.classList.add('hidden');
  }
});

document.getElementById('image').addEventListener('change', function (event) {
  // Mirrors selected filename in the custom file input label.
  const fileNameSpan = document.getElementById('fileName');
  const file = event.target.files[0];
  fileNameSpan.textContent = file ? file.name : 'No file chosen';
});
