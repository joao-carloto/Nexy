async function loadNavbar() {
  const response = await fetch("navbar.html");
  const navbarHTML = await response.text();
  document.body.insertAdjacentHTML("afterbegin", navbarHTML);
}

// Call the function to load the navbar
loadNavbar();
