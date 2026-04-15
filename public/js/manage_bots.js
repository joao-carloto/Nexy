async function loadBots() {
  try {
    // Admin list source: GET /bots from server/app.mjs.
    const response = await fetch('/bots');
    const data = await response.json();
    const botsContainer = document.getElementById('bots');
    botsContainer.innerHTML = '';

    data.bots.forEach((bot) => {
      const botElement = document.createElement('div');
      botElement.className = 'post-thumbnail';
      // Thumbnail naming contract: /thumbnails/profile_pictures/<userId>-thumbnail.png
      const thumbSrc = bot.profilePictureName
        ? `/thumbnails/profile_pictures/${bot.userId}-thumbnail.png`
        : 'images/logo.png';
      botElement.innerHTML = `
        <img src="${thumbSrc}" alt="${bot.fullName}" class="thumbnail-image" style="border-radius: 50%; cursor: pointer;" />
        <p style="color: #333; font-weight: 600; margin: 8px 0 2px; cursor: pointer;">${bot.fullName}</p>
        <p style="color: #666; font-size: 0.85em; margin: 0 0 4px;">@${bot.userId}</p>
        <button class="delete-post-button">Delete</button>
      `;
      botElement.querySelector('.thumbnail-image').addEventListener('click', () => viewBot(bot));
      botElement.querySelector('p').addEventListener('click', () => viewBot(bot));
      botElement.querySelector('.delete-post-button').addEventListener('click', () => deleteBot(bot.userId));
      botsContainer.appendChild(botElement);
    });
  } catch (error) {
    console.error('Error loading bots:', error);
  }
}

function viewBot(bot) {
  // random_bot.html reads this key to render the selected profile.
  localStorage.setItem('randomUser', JSON.stringify(bot));
  window.location.href = '/random_bot.html';
}

async function deleteBot(userId) {
  if (!confirm(`Are you sure you want to delete bot @${userId}? This action cannot be undone.`)) {
    return;
  }
  try {
    // Admin delete API: DELETE /bots/:userId
    const response = await fetch(`/bots/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (response.ok) {
      loadBots();
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to delete bot');
    }
  } catch (error) {
    console.error('Error deleting bot:', error);
    alert('Failed to delete bot. Please try again.');
  }
}

document.getElementById('create-bot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('create-bot-status');
  const loadingOverlay = document.getElementById('loadingOverlay');

  const userId = document.getElementById('botUserId').value.trim();
  const fullName = document.getElementById('botFullName').value.trim();
  // const countryRegion = document.getElementById('botCountryRegion').value.trim();
  const description = document.getElementById('botDescription').value.trim();

  loadingOverlay.classList.remove('hidden');

  try {
    // Admin create API: POST /bots (server may auto-generate missing fields).
    const response = await fetch('/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, fullName, description }), // countryRegion commented out for now
    });
    const data = await response.json();
    if (response.ok) {
      document.getElementById('create-bot-form').reset();
      // Keep newly-created bot as active persona for downstream pages.
      localStorage.setItem('randomUser', JSON.stringify(data));
      window.location.href = '/random_bot.html';
    } else {
      statusEl.textContent = data.error || 'Failed to create bot.';
    }
  } catch (error) {
    console.error('Error creating bot:', error);
    statusEl.textContent = 'Failed to create bot. Please try again.';
  } finally {
    loadingOverlay.classList.add('hidden');
  }
});

loadBots();
