async function ensureUserId() {
  // Shared persona state is stored in localStorage under randomUser.
  let userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;

  if (!userId) {
    try {
      // Bootstrap persona when none is cached.
      const response = await fetch('/random-user');
      if (!response.ok) {
        throw new Error('Failed to fetch random user');
      }
      const randomUser = await response.json();

      // Persist once so all pages can reuse the same selected user.
      localStorage.setItem('randomUser', JSON.stringify(randomUser));
      userId = randomUser.userId;
      console.log('Random user selected:', randomUser);
    } catch (error) {
      console.error('Error fetching random user:', error);
      alert('Failed to select a random user. Please try again.');
    }
  }

  return userId;
}

async function loadNavbar() {
  // Navbar is a shared HTML fragment injected at runtime.
  const response = await fetch('/navbar.html');
  const navbarHTML = await response.text();
  document.body.insertAdjacentHTML('afterbegin', navbarHTML);

  // After injection, resolve and update the avatar placeholder.
  const userId = localStorage.getItem('randomUser') ? JSON.parse(localStorage.getItem('randomUser')).userId : null;

  const thumbnailElement = document.getElementById('random-bot-thumbnail');

  if (userId) {
    // Naming contract: /thumbnails/profile_pictures/<userId>-thumbnail.png
    thumbnailElement.src = `/thumbnails/profile_pictures/${userId}-thumbnail.png`;
  } else {
    // Set a default placeholder image if no userId is found
    thumbnailElement.src = 'images/logo.png';
  }
}

window.onload = async () => {
  // Ensure persona exists before navbar render to avoid broken avatar state.
  await ensureUserId(); // Ensure a user is selected
  loadNavbar();
};
