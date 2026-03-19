document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('psyopForm');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const objective = document.getElementById('objective').value.trim();
    const target = document.getElementById('target').value.trim();
    const strategy = document.getElementById('strategy').value;

    if (!objective) {
      alert('Please define the objective of the PsyOp.');
      return;
    }

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
      const response = await fetch('/create_psyop_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, target, strategy }),
      });

      if (response.ok) {
        const result = await response.json();
        window.location.href = `/post.html?id=${result.postId}`;
      } else {
        const errorData = await response.json();
        alert('Failed to create PsyOp post: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed to create PsyOp post: ${error.message}`);
    } finally {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
  });
});
