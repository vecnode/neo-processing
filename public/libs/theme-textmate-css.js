ace.define("ace/theme/textmate-css", ["require", "exports", "module"], function(require, exports, module) {
  "use strict";

  exports.cssText = `
.ace-tm .ace_gutter {
  background: #f0f0f0;
  color: #333333;
}

.ace-tm .ace_print-margin {
  width: 1px;
  background: #e8e8e8;
}

.ace-tm {
  background-color: #ffffff;
  color: #000000;
}

.ace-tm .ace_cursor {
  color: #000000;
}

.ace-tm .ace_invisible {
  color: rgb(191, 191, 191);
}

.ace-tm .ace_storage,
.ace-tm .ace_keyword {
  color: blue;
}

.ace-tm .ace_constant {
  color: rgb(197, 6, 11);
}

.ace-tm .ace_constant.ace_numeric {
  color: rgb(0, 0, 205);
}

.ace-tm .ace_string {
  color: rgb(3, 106, 7);
}

.ace-tm .ace_comment {
  color: rgb(76, 136, 107);
  font-style: italic;
}

.ace-tm .ace_support.ace_function {
  color: rgb(60, 76, 114);
}

.ace-tm .ace_marker-layer .ace_selection {
  background: rgb(181, 213, 255);
}

.ace-tm .ace_marker-layer .ace_active-line {
  background: rgba(0, 0, 0, 0.03);
}
`;
});
