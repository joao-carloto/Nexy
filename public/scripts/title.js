// scripts/title.js
// Dynamically loads the title.html into the #title-container div

document.addEventListener("DOMContentLoaded", function () {
  const container = document.getElementById("title-container");
  if (container) {
    fetch("title.html")
      .then((response) => response.text())
      .then((html) => {
        container.innerHTML = html;
      });
  }
});
