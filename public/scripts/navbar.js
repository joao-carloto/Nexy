async function loadNavbar() {
  const response = await fetch("navbar.html");
  const navbarHTML = await response.text();
  document.body.insertAdjacentHTML("afterbegin", navbarHTML);

  // Load the user's thumbnail
  const userId = localStorage.getItem("randomUser")
    ? JSON.parse(localStorage.getItem("randomUser")).userId
    : null;

  const thumbnailElement = document.getElementById("random-user-thumbnail");

  if (userId) {
    // Set the thumbnail source based on the userId
    thumbnailElement.src = `/data/thumbnails/profile-pictures/${userId}-thumbnail.png`;
  } else {
    // Set a default placeholder image if no userId is found
    thumbnailElement.src = "data/thumbnails/profile-pictures/default.png";
  }
}
loadNavbar();
