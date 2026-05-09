
const terminalOutput = document.getElementById("terminal");
const menuButtons = document.querySelectorAll(".menu-button");
const menuItems = document.querySelectorAll(".menu-item");
const hamburgerButton = document.getElementById("hamburger-button");
const appShell = document.querySelector(".app-shell");
const sidePanel = document.getElementById("side-panel");
const statusContainer = document.querySelector(".bottom-row");
const middleRow = document.getElementById("middle-row");
const splitter = document.getElementById("splitter");

let isResizingPanels = false;

function setLeftPanelSize(percent) {
  if (!middleRow) {
    return;
  }

  const clamped = Math.min(80, Math.max(20, percent));
  middleRow.style.setProperty("--left-panel-size", `${clamped}%`);
}

function scrollStatusToBottom() {
  if (!statusContainer) {
    return;
  }

  statusContainer.scrollTop = statusContainer.scrollHeight;
}

function appendStatus(message) {
  if (!terminalOutput) {
    return;
  }

  if (!terminalOutput.textContent) {
    terminalOutput.textContent = message;
    scrollStatusToBottom();
    return;
  }

  terminalOutput.textContent += `\n${message}`;
  scrollStatusToBottom();
}

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
  appendStatus(isOpen ? "Sidebar opened" : "Sidebar closed");
}

function updateSplitFromPointer(clientX) {
  if (!middleRow) {
    return;
  }

  const rect = middleRow.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  const percent = ((clientX - rect.left) / rect.width) * 100;
  setLeftPanelSize(percent);
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
    appendStatus(`${item.dataset.action} clicked`);
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




if (hamburgerButton) {
  hamburgerButton.addEventListener("click", toggleSidebar);
}

if (splitter && middleRow) {
  splitter.addEventListener("pointerdown", (event) => {
    isResizingPanels = true;
    splitter.setPointerCapture(event.pointerId);
    updateSplitFromPointer(event.clientX);
    event.preventDefault();
  });

  splitter.addEventListener("pointermove", (event) => {
    if (!isResizingPanels) {
      return;
    }

    updateSplitFromPointer(event.clientX);
  });

  splitter.addEventListener("pointerup", (event) => {
    isResizingPanels = false;
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  });

  splitter.addEventListener("pointercancel", (event) => {
    isResizingPanels = false;
    if (splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  });
}

setLeftPanelSize(50);
