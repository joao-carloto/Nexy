// js/title.js
// Dynamically loads the title.html into the #title-container div

document.addEventListener('DOMContentLoaded', function () {
  const container = document.getElementById('title-container');
  if (container) {
    fetch('title.html')
      .then((response) => response.text())
      .then((html) => {
        container.innerHTML = html;
      });
  }

  // Help button logic
  document.addEventListener('click', function (event) {
    // Use event delegation to catch help button clicks even after dynamic load
    if (event.target.closest && event.target.closest('.help-button')) {
      event.preventDefault();
      window.open('docs/NEXY.pdf', '_blank');
    }
  });
});
