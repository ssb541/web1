/* main.js - 부팅 */
(function () {
  'use strict';
  const PJ = window.PJ;
  PJ.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (PJ.touch) document.body.classList.add('touch');
  PJ.Gfx.load().then(() => PJ.Game.init());
})();
