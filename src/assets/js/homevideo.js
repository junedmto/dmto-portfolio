// homevideo.js
// Turns the sound on and off for the YouTube video on the video homepage.
// The video starts muted (browsers only allow autoplay without sound). The
// button sends YouTube a "mute" / "unmute" message through the embed's
// JavaScript interface, which is switched on by enablejsapi=1 in the address.
(function () {
  var frame = document.querySelector("[data-hv-frame]");
  var button = document.querySelector("[data-hv-sound]");
  if (!frame || !button) return;

  var on = false;

  function send(func, args) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: func, args: args || [] }),
      "*"
    );
  }

  // YouTube only listens once it is told someone is there.
  function listen() {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: "hv" }), "*");
    }
  }
  frame.addEventListener("load", listen);
  listen();

  button.hidden = false;
  button.addEventListener("click", function () {
    on = !on;
    if (on) {
      send("unMute");
      send("setVolume", [100]);
      send("playVideo"); // in case the browser paused it
    } else {
      send("mute");
    }
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
  });
})();
