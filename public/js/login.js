document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('errorMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';

    const password = passwordInput.value.trim();
    if (!password) {
      errorMsg.textContent = 'Password required';
      return;
    }

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg.textContent = data.error || 'Login failed';
        return;
      }
      // Redirect to manage posts
      window.location.href = '/manage_posts.html';
    } catch (err) {
      errorMsg.textContent = 'Network error';
    }
  });
});
