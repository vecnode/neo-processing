// vecnode 2026-05-12

const terminalOutput = document.getElementById("terminal");
const menuButtons = document.querySelectorAll(".menu-button");
const menuItems = document.querySelectorAll(".menu-item");
const hamburgerButton = document.getElementById("hamburger-button");
const appShell = document.querySelector(".app-shell");
const sidePanel = document.getElementById("side-panel");
const statusContainer = document.querySelector(".bottom-row");
const middleRow = document.getElementById("middle-row");
const splitter = document.getElementById("splitter");
const aceEditorContainer = document.getElementById("ace-editor");
const runButton = document.getElementById("run-button");

let isResizingPanels = false;
let aceEditor = null;

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

function resetEditorToDefault() {
  if (!aceEditor) {
    return;
  }

  aceEditor.session.setValue(defaultCode);
  aceEditor.clearSelection();
  aceEditor.focus();
  appendStatus("New file created");
}

function openLocalFilePicker() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".js,.txt,.json,.html,.css,.md,.xml,.ts,.tsx,.jsx,*/*";
  fileInput.style.display = "none";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || !aceEditor) {
      fileInput.remove();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const contents = typeof reader.result === "string" ? reader.result : "";
      aceEditor.session.setValue(contents);
      aceEditor.clearSelection();
      aceEditor.focus();
      appendStatus(`Opened ${file.name}`);
      fileInput.remove();
    };
    reader.onerror = () => {
      appendStatus(`Failed to open ${file.name}`);
      fileInput.remove();
    };
    reader.readAsText(file);
  }, { once: true });

  document.body.appendChild(fileInput);
  fileInput.click();
}

async function saveEditorToOutputs() {
  if (!aceEditor) {
    return;
  }

  const contents = aceEditor.getValue();
  if (!contents.trim()) {
    appendStatus("Nothing to save");
    return;
  }

  try {
    const response = await fetch("/api/save-script", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: contents,
    });

    const result = await response.text();
    if (!response.ok) {
      appendStatus(`Save failed: ${result}`);
      return;
    }

    appendStatus(`Saved outputs/${result}`);
  } catch (error) {
    appendStatus(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
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
    if (item.dataset.action === "New file") {
      resetEditorToDefault();
    } else if (item.dataset.action === "Open file") {
      openLocalFilePicker();
    } else if (item.dataset.action === "Save file") {
      saveEditorToOutputs();
    } else {
      appendStatus(`${item.dataset.action} clicked`);
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




if (hamburgerButton) {
  hamburgerButton.addEventListener("click", toggleSidebar);
}

if (runButton) {
  runButton.addEventListener("click", () => {
    closeMenus();
    appendStatus("hello-world");
  });
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

// Default p5js code

const defaultCode = `function setup() {

}

function draw() {
}`;

if (window.ace && aceEditorContainer) {
  aceEditor = ace.edit(aceEditorContainer);

  aceEditor.setTheme("ace/theme/textmate");
  aceEditor.session.setMode("ace/mode/javascript");
  aceEditor.session.setUseWorker(false);
  aceEditor.setOptions({
    showGutter: true,
    showFoldWidgets: true,
    showPrintMargin: false,
    highlightActiveLine: true,
    fontSize: "13px",
    useSoftTabs: true,
    tabSize: 2,
  });
  aceEditor.session.setValue(defaultCode);
  aceEditor.clearSelection();
  aceEditor.resize();

  window.addEventListener("resize", () => {
    aceEditor.resize();
  });
}
