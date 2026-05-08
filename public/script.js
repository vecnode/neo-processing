const helloButton = document.getElementById("hello-button");
const helloOutput = document.getElementById("hello-output");
const menuButtons = document.querySelectorAll(".menu-button");
const menuItems = document.querySelectorAll(".menu-item");
const hamburgerButton = document.getElementById("hamburger-button");
const appShell = document.querySelector(".app-shell");
const sidePanel = document.getElementById("side-panel");

function closeMenus() {
  menuButtons.forEach((button) => {
    const menuId = button.dataset.menu;
    const menu = document.getElementById(menuId);
    button.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
    }
  });
}

function toggleSidebar() {
  if (!appShell || !hamburgerButton || !sidePanel) {
    return;
  }

  const isOpen = appShell.classList.toggle("sidebar-open");
  hamburgerButton.setAttribute("aria-expanded", String(isOpen));
  sidePanel.setAttribute("aria-hidden", String(!isOpen));
}

async function printHelloWorld() {
  if (!helloButton || !helloOutput) {
    return;
  }

  helloButton.disabled = true;
  helloOutput.textContent = "Loading...";

  try {
    const response = await fetch("/api/hello");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    helloOutput.textContent = text;
  } catch (error) {
    helloOutput.textContent = `Request failed: ${error.message}`;
  } finally {
    helloButton.disabled = false;
  }
}

menuButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    const menuId = button.dataset.menu;
    const menu = document.getElementById(menuId);
    const isExpanded = button.getAttribute("aria-expanded") === "true";

    closeMenus();

    if (!isExpanded && menu) {
      button.setAttribute("aria-expanded", "true");
      menu.hidden = false;
    }

    event.stopPropagation();
  });
});

menuItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (helloOutput) {
      helloOutput.textContent = `${item.dataset.action} clicked`;
    }
    closeMenus();
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-group")) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
  }
});

if (helloButton) {
  helloButton.addEventListener("click", printHelloWorld);
}

if (hamburgerButton) {
  hamburgerButton.addEventListener("click", toggleSidebar);
}
