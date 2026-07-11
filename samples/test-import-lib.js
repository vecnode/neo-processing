// Tiny sample library for testing the "Import JS Library" button (Libraries
// panel). Pick this file in the dialog, then reference `neoTestLib` from a
// sketch, e.g.: function setup() { neoTestLib.greet(); createCanvas(400, 400); }
window.neoTestLib = {
  greet: function () {
    console.log("[test-import-lib] Hello from the imported library!");
  },
};
