/* The service worker of the discussion board. Its only job is browser notifications (Web Push): the board
   knocks without saying anything (a push without content), and this worker then asks the board what is new
   for the user of this browser and shows it. It keeps no pages and touches no requests.
   It sits next to forum.html (not under assets/), so that its scope covers the page. */
var API = new URL(self.location.href).searchParams.get("api") || "";

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (event) {
  event.waitUntil(self.registration.pushManager.getSubscription().then(function (subscription) {
    return fetch(API + "/push/peek", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription ? subscription.endpoint : "" })
    }).then(function (response) { return response.json(); });
  }).catch(function () { return null; }).then(function (note) {
    if (!note || !note.body) { note = { title: "הפורום של מובידוס", body: "יש חדש בפורום.", url: "" }; }
    return self.registration.showNotification(note.title, {
      body: note.body, tag: note.tag || "board", dir: "rtl", lang: "he", icon: "logo.png", data: { url: note.url || "" }
    });
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
    for (var i = 0; i < windows.length; i++) {              // a window of the board that is already open goes there
      if (windows[i].url.split("#")[0] === url.split("#")[0] && "focus" in windows[i]) {
        if ("navigate" in windows[i]) { windows[i].navigate(url); }
        return windows[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
