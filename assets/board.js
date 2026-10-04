/* The discussion board of forum.html. Talks to the board's API (cloud/board, a Cloudflare Worker): its address
   is the content of <meta name="board-api"> - the Worker's address on the site, "/" when the Worker itself serves
   this page. On localhost any other address means the local Worker, http://localhost:8787: a local look at the
   site folder never talks to the board in the cloud.

   What is drawn where:
     #user   the account in the top bar (renderUser)
     #view   what the address asks for (render): the list of topics, one topic, a search, the kept messages,
             a user's page, the account's settings, the moderators' page
     #float  one menu or small panel at a time, next to what opened it (openFloat)
     #modal  one dialog at a time (renderModal)
   The address after the # says where one is:  (nothing) the list · k=idea a kind · f=unread a filter ·
   tag=NAME · q=WORDS a search · t=ID a topic (t=ID&p=POST a message in it) · u=ID a user · me the account ·
   saved the kept messages · admin the moderators' page · join / login the sign-up dialog.

   The text of a message becomes markup only in board-text.js; everything else a visitor wrote goes through esc().
   ES2017 only, like site.js. */
(function () {
  "use strict";

  // The forum page (forum.html), or another page of the site, where only the account in the top bar is the board's:
  // signing in, the bell, the account's menu (site.js loads this script there only for a member, or when "כניסה"
  // is pressed - and then opens it through window.MoovidosBoard).
  var FORUM = !!document.getElementById("board");
  var FORUM_PAGE = FORUM ? "" : "forum.html";       // what a link into the forum starts with
  // Inside a frame of another site the board does not run: there, presses could be led to its buttons unseen.
  try { if (window.top !== window.self && window.top.location.origin !== location.origin) { throw 0; } }
  catch (e) { if (FORUM) { document.documentElement.hidden = true; } return; }

  var esc = window.BoardText.esc;
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // In the clear nothing of the board runs: the same address is opened over HTTPS.
  if (location.protocol === "http:" && !LOCAL) { location.replace("https:" + location.href.slice(5)); return; }
  var meta = document.querySelector('meta[name="board-api"]');
  var address = (meta && meta.getAttribute("content")) || "";
  if (LOCAL && address !== "/") address = "http://localhost:8787";
  var API = address ? address.replace(/\/+$/, "") : null;      // "" = this very origin, null = not set up
  var OWNER = /[?&]owner=1/.test(location.search);        // the owner's own sign-up: shows the owner-code field
  var TOKEN = "mv-board-token", MEMORY = "mv-board-memory";
  var KNOWN = "mv-board-known";       // this browser had a signed-in member once: "כניסה / הרשמה" opens on "כניסה" (kept after signing out)
  var TITLE = document.title;
  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var KINDS = { idea: "רעיון", question: "שאלה", bug: "תקלה" };
  var KIND_ICON = { idea: "lightbulb", question: "help", bug: "bug-report" };
  var NAV = [["", "כל הנושאים", "forum", "all"], ["idea", "רעיונות", "lightbulb", "idea"], ["question", "שאלות", "help", "question"], ["bug", "תקלות", "bug-report", "bug"]];
  var MINE = [["unread", "לא נקראו", "mark-chat-unread"], ["watching", "במעקב", "notifications"], ["mine", "הנושאים שלי", "person"]];
  var SORTS = [      // what the list is sorted by: the key, its name, and what comes first
    ["active", "תגובה אחרונה", "קודם הנושאים שהגיבו בהם לאחרונה"],
    ["votes", "מספר תומכים", "קודם הנושאים שיש להם הכי הרבה תומכים"],
    ["new", "תאריך פתיחה", "קודם הנושאים שנפתחו לאחרונה"]
  ];
  var STARTERS = [
    ["idea", "יש לי רעיון", "משהו שהייתם רוצים שיהיה באפליקציה"],
    ["question", "יש לי שאלה", "איך עושים משהו, או למה זה עובד כך"],
    ["bug", "מצאתי תקלה", "משהו שלא עובד כמו שצריך"]
  ];
  var HINTS = {            // what the two fields of a new topic ask for, by its kind
    idea: ["בשורה אחת: מה הרעיון?", "מה חסר לכם היום, ואיך זה היה עוזר?"],
    question: ["בשורה אחת: מה השאלה?", "מה ניסיתם, ומה לא ברור?"],
    bug: ["בשורה אחת: מה לא עובד?", "מה קרה, באיזה מכשיר ובאיזו גרסה של האפליקציה?"]
  };
  var STATUS = { planned: "מתוכנן", done: "בוצע", answered: "נענתה", known: "תקלה מוכרת", fixed: "תוקנה" };
  var WATCH = [
    [1, "במעקב", "התראה על כל תגובה חדשה", "notifications-active-fill"],
    [0, "לא במעקב", "התראה רק כשמזכירים אתכם", "notifications"],
    [-1, "מושתק", "בלי התראות, ולא מסומן אצלכם כלא נקרא", "notifications-off"]
  ];
  var WAIT_WHY = { link: "יש בה קישור", phone: "יש בה מספר טלפון", mail: "יש בה כתובת מייל", word: "יש בה מילה חסומה" };
  var EMOJIS = ["🙂", "😀", "😉", "😂", "😅", "🤔", "😢", "🙏", "👍", "👎", "👏", "💪", "❤️", "🎉", "🔥", "⭐", "✅", "❌", "⚠️", "❓", "💡", "🚌", "📱", "🕐"];
  var ERRORS = {
    network: "אין חיבור לפורום. ייתכן שהסינון חוסם את הכתובת שלו.",
    server: "משהו השתבש אצלנו. נסו שוב בעוד רגע.",
    not_configured: "הפורום עוד לא הופעל.",
    slow_down: "יותר מדי פעולות בזמן קצר. נסו שוב בעוד כמה דקות.",
    login_first: "כדי לעשות את זה נרשמים או נכנסים.",
    expired: "הכניסה פגה. היכנסו שוב.",
    bad_login: "שם המשתמש או הסיסמה אינם נכונים.",
    bad_code: "הקוד אינו נכון, או שתוקפו פג.",
    bad_owner: "קוד הבעלים אינו נכון.",
    bad_google: "הכניסה עם Google לא הצליחה. נסו שוב.",
    bad_password: "הסיסמה הנוכחית אינה נכונה.",
    bad_request: "הבקשה לא התקבלה.",
    bad_mail: "זו לא נראית כתובת מייל תקינה.",
    mail_taken: "לכתובת המייל הזו כבר יש חשבון בפורום. נכנסים אליו; סיסמה שנשכחה מאפסים ב״שכחתי סיסמה״.",
    bad_tag: "תגית: עד 3 תגיות, כל אחת עד 20 תווים, בלי סימנים מיוחדים.",
    bad_poll: "סקר צריך בין 2 ל-10 אפשרויות שונות, כל אחת עד 60 תווים.",
    banned: "החשבון הזה נחסם.",
    forbidden: "אין הרשאה לפעולה הזו.",
    locked: "הנושא נעול, ואי אפשר לכתוב בו.",
    poll_closed: "הסקר נסגר.",
    own_post: "אי אפשר לסמן את ההודעה של עצמכם.",
    no_links: "כאן אי אפשר לכתוב קישור, מספר טלפון או כתובת מייל.",
    name_taken: "השם הזה כבר תפוס.",
    name_short: "השם קצר מדי: לפחות שתי אותיות.",
    name_long: "השם ארוך מדי: עד 24 תווים.",
    name_chars: "בשם אפשר להשתמש באותיות, בספרות, ברווח, בנקודה ובמקף.",
    name_reserved: "השם הזה שמור.",
    empty: "לא נכתב כלום.",
    long: "הטקסט ארוך מדי.",
    bad_image: "הקובץ אינו תמונה מתאימה (JPG, PNG או WebP).",
    big_image: "התמונה גדולה מדי.",
    bad_quote: "אי אפשר לצטט את ההודעה הזו.",
    not_found: "מה שחיפשתם לא נמצא. ייתכן שהוסר.",
    too_late: "אפשר לערוך הודעה רק ביממה הראשונה.",
    has_replies: "כבר הגיבו לנושא, ולכן אי אפשר למחוק אותו."
  };

  var state = {
    config: null, me: null, notes: [], unseen: 0, waiting: 0, follows: {}, ignores: {},
    here: [], typing: [],    // the open topic: the others who read it now, and the names of those who are writing
    list: null,              // the list of topics on screen: { key, topics, more, counts, tags, wanted, waiting, voted, latest }
    current: null,           // the open topic
    queue: null, profile: null, account: null, found: null, saved: null
  };
  var ui = {
    route: { view: "list", kind: "", filter: "", tag: "" }, view: "loading", sort: "active", listHash: "", listScroll: 0,
    float: null,                          // the open menu: { key, anchor }
    modal: "", ask: null,                 // the open dialog; `ask` = the question a small dialog puts
    authTab: "login", authNote: "", authName: "", authMail: "", after: "",
    authNotify: true,                     // the sign-up form's "mail me about replies": on unless he turns it off
    signup: null,                         // a sign-up that waits for its mailed code: { ticket, pending, body }
    draft: blankDraft(), reply: null, editing: 0,
    quote: null,                          // what the reply being written quotes: { topic, post, name, text, marked }
    shots: { reply: null, compose: null, edit: undefined },      // the picture attached to what is being written
                                          //   (reply: with its topic; edit: undefined = as it is, null = remove it)
    picked: {},                           // users chosen from the "@" suggestions: lower-case name -> { id, name }
    shown: {},                            // messages of ignored users that were unfolded
    zoom: "",                             // the picture shown large
    read: { topic: 0, post: 0, at: 0, dirty: false, timer: 0 },      // how far the reader got in the open topic
    recovery: "", credential: "", suggestion: "", googleMail: "", googleFor: "", ownAvatar: null, googleReady: false,
    loaded: 0, active: Date.now(), fresh: "", mailTest: "", failure: null, history: null,
    mailChange: false,                    // the account page asks for a new address instead of the one kept
    typedAt: 0,                           // when the reply bar was last typed in
    liveUntil: 0,                         // until then the open topic is checked every ten seconds: a conversation is live
    place: ""                             // what render() drew last: the view, and for a topic its id
  };
  function blankDraft() { return { kind: "idea", title: "", body: "", tags: [], poll: null }; }

  /* ---------- what this browser remembers: the session, and what was already seen ---------- */
  var store = {
    get: function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { if (value == null) { localStorage.removeItem(key); } else { localStorage.setItem(key, value); } } catch (e) { /* private window */ } }
  };
  var memory = (function () {
    var saved = null;
    try { saved = JSON.parse(store.get(MEMORY) || "null"); } catch (e) { saved = null; }
    var now = Date.now();
    var mem = saved && typeof saved === "object" ? saved : { last: now, active: 0, seen: {} };
    if (mem.active && now - mem.active > 30 * MIN) { mem.last = mem.active; }      // a new visit: "new" = since the previous one
    mem.active = now;
    mem.seen = mem.seen || {};
    mem.read = mem.read || {};        // per topic: the time of the latest message this browser has shown (a visitor's reading position)
    mem.viewed = mem.viewed || {};    // per topic: the day this browser last counted as a view of it
    if (["active", "votes", "new"].indexOf(mem.sort) !== -1) { ui.sort = mem.sort; }
    return mem;
  })();
  function remember() { memory.active = Date.now(); store.set(MEMORY, JSON.stringify(memory)); }
  if (FORUM) { remember(); }       // a visit of the forum; the site's other pages are not one
  // the top bar's own "כניסה" (the page's markup): what a visitor sees there. A member's is hidden until he is known.
  var GUEST = document.getElementById("user").innerHTML;
  if (store.get(TOKEN)) { document.getElementById("user").setAttribute("data-pending", ""); }

  /* ---------- helpers ---------- */
  // the icons are one file for every page of the site (written by cloud/board/scripts/icons.mjs)
  function icon(id, more) { return '<svg class="mi' + (more ? " " + more : "") + '" aria-hidden="true"><use href="assets/board-icons.svg#m-' + id + '"/></svg>'; }
  function name(value) { return "<bdi>" + esc(value) + "</bdi>"; }
  function initial(value) { return Array.from(String(value).replace(/[\s.,'"״׳_-]/g, ""))[0] || ""; }
  function ago(ts) {
    var d = Date.now() - ts;
    if (d < MIN) { return "עכשיו"; }
    if (d < HOUR) { var m = Math.floor(d / MIN); return m === 1 ? "לפני דקה" : "לפני " + m + " דקות"; }
    if (d < DAY) { var h = Math.floor(d / HOUR); return h === 1 ? "לפני שעה" : h === 2 ? "לפני שעתיים" : "לפני " + h + " שעות"; }
    if (d < 2 * DAY) { return "אתמול"; }
    if (d < 7 * DAY) { var n = Math.floor(d / DAY); return n === 2 ? "לפני יומיים" : "לפני " + n + " ימים"; }
    return dateOf(ts);
  }
  function dateOf(ts) { var date = new Date(ts); return date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear(); }
  function when(ts) {
    var date = new Date(ts);
    return '<time datetime="' + date.toISOString() + '" title="' + esc(date.toLocaleString("he-IL")) + '">' + ago(ts) + "</time>";
  }
  function count(n, one, many, none) { return n === 0 && none ? none : n === 1 ? one : n + " " + many; }
  function repliesCount(n) { return count(n, "תגובה אחת", "תגובות", "בלי תגובות"); }
  function hue(user) { return "av-" + (Math.abs(Number(user.id) || 0) % 6); }      // the class of a writer's own colour
  /** The round badge of a user: his picture, or the first letter of his name on a colour of his own. */
  function face(user, size) {
    var picture = user.av ? '<img src="' + esc(API + "/avatar/" + Number(user.id) + "?v=" + Number(user.av)) + '" alt="" loading="lazy">' : "";
    return '<span class="avatar ' + hue(user) + (size ? " avatar--" + size : "") + '" aria-hidden="true">' +
      (picture || esc(initial(user.name))) + "</span>";
  }
  function who(user) { return '<a class="who" href="#u=' + Number(user.id) + '">' + name(user.name) + "</a>"; }
  /** The picture as a way to the user's page. The name next to it is the link a keyboard and a screen reader meet. */
  function faceLink(user, size, more) {
    return '<a class="facelink' + (more ? " " + more : "") + '" href="#u=' + Number(user.id) + '" tabindex="-1" aria-hidden="true">' + face(user, size) + "</a>";
  }
  /** What stands next to a name: the developer, a moderator, a title the developer gave. */
  function marks(user) {
    return (user.admin ? '<span class="lbl lbl--dev">' + icon("verified-fill") + "יוצר מובידוס</span>" : "") +
      (user.mod ? '<span class="lbl lbl--mod">' + icon("shield-person") + "מנהל</span>" : "") +
      (user.badge ? '<span class="lbl lbl--badge">' + name(user.badge) + "</span>" : "");
  }
  function kindCircle(kind, large) {
    return '<span class="kc kc--' + esc(kind) + (large ? " kc--l" : "") + '"' + (KINDS[kind] ? ' title="' + KINDS[kind] + '"' : "") + ">" + icon(KIND_ICON[kind] || "forum") + "</span>";
  }
  function isMod() { return !!state.me && (state.me.admin || state.me.mod); }
  var DOT = '<span class="sep" aria-hidden="true">·</span>';

  function toast(text, action) {
    var el = document.getElementById("toast");
    el.innerHTML = "<span>" + esc(text) + "</span>" + (action ? '<button type="button" data-act="' + action[0] + '">' + esc(action[1]) + "</button>" : "");
    el.classList.add("is-on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove("is-on"); }, action ? 7000 : 3600);
  }
  function explain(error) { return ERRORS[error && error.code] || ERRORS.server; }
  function say(error) { if (error && error.code === "moved") { return; } toast(explain(error)); }
  function value(id) { var el = document.getElementById(id); return el ? el.value : ""; }
  function busyLine(on) { var el = document.getElementById("progress"); if (el) { el.hidden = !on; } }

  function failure(code) { var error = new Error(code); error.code = code; return error; }
  /** `lasting`: the request is sent although the page is being left. */
  function api(method, path, body, lasting) {
    var token = store.get(TOKEN);
    var options = { method: method, headers: {}, keepalive: !!lasting };
    if (token) { options.headers.Authorization = "Bearer " + token; }
    if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    return fetch(API + path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.ok) { return data; }
        var error = failure(data.error || "server");
        if (response.status === 401 && token && error.code === "login_first") { error.code = "expired"; signedOut(); }
        throw error;
      });
    }, function () { throw failure("network"); });
  }

  /* ---------- the password never leaves the browser: only a key derived from it does ---------- */
  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function randomHex(count) { return toHex(crypto.getRandomValues(new Uint8Array(count))); }
  function deriveKey(password, saltHex, iterations) {
    var salt = new Uint8Array(saltHex.match(/../g).map(function (pair) { return parseInt(pair, 16); }));
    return crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"])
      .then(function (material) {
        return crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" }, material, 256);
      }).then(toHex);
  }
  /** The key of the signed-in user's current password: what proves it is him before a sensitive change. */
  function currentKey(password) {
    return api("POST", "/auth/salt", { name: state.me.name }).then(function (salt) { return deriveKey(password, salt.salt, salt.iterations); });
  }
  /** A new password as what the board keeps of it: { salt, key }. */
  function newKey(password) {
    var salt = randomHex(16);
    return deriveKey(password, salt, state.config.iterations).then(function (key) { return { salt: salt, key: key }; });
  }

  /* ---------- a chosen picture -> a JPEG as base64, small enough to keep ---------- */
  function loadPicture(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(failure("bad_image")); };
      image.src = url;
    });
  }
  /** Draws the part (sx, sy, sw, sh) of a picture as w x h on white, and returns the JPEG as base64. */
  function jpegOf(image, sx, sy, sw, sh, w, h, quality) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, w, h);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality).split(",")[1];
  }
  /** A profile picture: the middle square, 256 px. */
  function squareJpeg(file) {
    return loadPicture(file).then(function (image) {
      var side = Math.min(image.naturalWidth, image.naturalHeight);
      return jpegOf(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 256, 256, 0.85);
    });
  }
  /** The picture of a message: whole, its longer side up to limits.imageSide; made lighter, then smaller, until it
   *  is within limits.imageBytes. -> { data, w, h } */
  function fitJpeg(file) {
    var limits = state.config.limits;
    return loadPicture(file).then(function (image) {
      var scale = Math.min(1, limits.imageSide / Math.max(image.naturalWidth, image.naturalHeight)), quality = 0.85;
      for (var attempt = 0; attempt < 10; attempt++) {
        var w = Math.max(1, Math.round(image.naturalWidth * scale)), h = Math.max(1, Math.round(image.naturalHeight * scale));
        var data = jpegOf(image, 0, 0, image.naturalWidth, image.naturalHeight, w, h, quality);
        if (data.length * 3 / 4 <= limits.imageBytes) { return { data: data, w: w, h: h }; }
        if (quality > 0.6) { quality -= 0.1; } else { scale *= 0.8; }
      }
      throw failure("big_image");
    });
  }
  /** The picture attached to what is being written at `where` ("reply" | "compose" | "edit"): shown small, with a way to remove it. */
  function attachBox(where) {
    var shot = ui.shots[where], kept = null;
    if (where === "edit" && shot === undefined && state.current) {          // the picture the message already has
      kept = (state.current.posts.filter(function (post) { return post.id === ui.editing; })[0] || {}).image;
    }
    var preview = shot ? "data:image/jpeg;base64," + shot.data : kept ? API + "/image/" + kept.key : "";
    return '<div class="attach" data-attach="' + where + '">' +
      (preview ? '<span class="attach__thumb"><img src="' + esc(preview) + '" alt="התמונה שמצורפת">' +
        '<button type="button" class="ib" data-act="detach" data-where="' + where + '" aria-label="הסרת התמונה" title="הסרת התמונה">' + icon("close") + "</button></span>" : "") + "</div>";
  }
  function redrawAttach(where) {
    var box = document.querySelector('[data-attach="' + where + '"]');
    if (box) { box.outerHTML = attachBox(where); }
  }
  function attach(where, file) {
    fitJpeg(file).then(function (shot) {
      if (where === "reply") { shot.topic = state.current ? state.current.topic.id : 0; }
      ui.shots[where] = shot;
      redrawAttach(where);
      dockReady();
    }, say);
  }
  /** Adds the picture attached at `where` to what is sent; for an edit also "the picture is removed". */
  function withShot(body, where) {
    var shot = ui.shots[where];
    if (shot) { body.image = { data: shot.data, w: shot.w, h: shot.h }; }
    else if (where === "edit" && shot === null) { body.image = null; }
    return body;
  }

  /* ---------- how far the reader got in a topic ---------- */
  /** The furthest message on the screen is how far he got. Kept on the account, or - for a visitor - in this browser. */
  function reached() {
    if (ui.view !== "topic" || !state.current || document.hidden || ui.read.topic !== state.current.topic.id) { return; }
    var posts = document.querySelectorAll(".thread .post[data-at]"), line = window.innerHeight - 48, last = null;
    for (var i = 0; i < posts.length && posts[i].getBoundingClientRect().top < line; i++) { last = posts[i]; }
    var at = last ? Number(last.getAttribute("data-at")) : 0;
    if (at <= ui.read.at) { return; }
    ui.read.at = at;
    ui.read.post = Number(last.getAttribute("data-id"));
    ui.read.dirty = true;
    clearTimeout(ui.read.timer);
    ui.read.timer = setTimeout(saveRead, 1500);
  }
  function saveRead(lasting) {
    var read = ui.read;
    clearTimeout(read.timer);
    if (!read.dirty) { return Promise.resolve(); }
    read.dirty = false;
    if (!state.me) { memory.read[read.topic] = read.at; remember(); return Promise.resolve(); }
    return api("POST", "/topics/" + read.topic + "/read", { post: read.post }, lasting).catch(function () { /* the next mark carries it */ });
  }
  /** A topic opens where its reader stopped: at the message the address names, or at the first one that is new for him. */
  function land() {
    var wanted = ui.route.post ? document.getElementById("p" + ui.route.post) : null;
    if (wanted) { jump(wanted.getBoundingClientRect().top + window.pageYOffset - 84); flash(wanted); return; }
    var fresh = document.querySelector(".thread .newline");
    jump(!fresh ? 0 : fresh.getBoundingClientRect().top + window.pageYOffset - 84);
  }
  function flash(el) {
    el.classList.add("post--flash");
    setTimeout(function () { el.classList.remove("post--flash"); }, 1800);
  }
  /** Scrolls at once, without the site's smooth scrolling: a place is opened, not travelled to. */
  function jump(top) {
    var root = document.documentElement, before = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = before;
  }

  /* ---------- where one is, and loading it ---------- */
  function parseRoute() {
    var params = {};
    location.hash.slice(1).split("&").forEach(function (part) {
      var cut = part.indexOf("="), key = cut === -1 ? part : part.slice(0, cut), text = cut === -1 ? "" : part.slice(cut + 1);
      try { text = decodeURIComponent(text); } catch (e) { /* as it is */ }
      if (key) { params[key] = text; }
    });
    if (/^\d+$/.test(params.t || "")) { return { view: "topic", id: Number(params.t), post: /^\d+$/.test(params.p || "") ? Number(params.p) : 0 }; }
    if (/^\d+$/.test(params.p || "")) { return { view: "post", post: Number(params.p) }; }
    if (/^\d+$/.test(params.u || "")) { return { view: "user", id: Number(params.u) }; }
    if ("q" in params) { return { view: "search", q: params.q }; }
    if ("me" in params) { return { view: "account" }; }
    if ("saved" in params) { return { view: "saved" }; }
    if ("admin" in params) { return { view: "admin" }; }
    if ("privacy" in params) { return { view: "privacy" }; }
    return {
      view: "list", kind: KINDS[params.k] ? params.k : "", tag: params.tag || "",
      filter: ["unread", "watching", "mine"].indexOf(params.f) !== -1 ? params.f : "",
      ask: "join" in params ? "register" : "login" in params ? "login" : ""
    };
  }
  function listHash(route) {
    return route.kind ? "#k=" + route.kind : route.filter ? "#f=" + route.filter : route.tag ? "#tag=" + encodeURIComponent(route.tag) : "#";
  }
  function listKey(route) { return [route.kind, route.filter, route.tag, ui.sort].join("|"); }
  function listPath(route, offset) {
    var parts = ["sort=" + ui.sort];
    if (route.kind) { parts.push("kind=" + route.kind); }
    if (route.filter) { parts.push("filter=" + route.filter); }
    if (route.tag) { parts.push("tag=" + encodeURIComponent(route.tag)); }
    if (offset) { parts.push("offset=" + offset); }
    return "/topics?" + parts.join("&");
  }
  /** Loads the list the address asks for. Coming back to the list one left, as many pages as were on screen. */
  function loadList(route) {
    var key = listKey(route), size = state.config.limits.page;
    var pages = state.list && state.list.key === key ? Math.min(5, Math.ceil((state.list.next || state.list.topics.length) / size)) || 1 : 1;
    var asks = [];
    for (var page = 0; page < pages; page++) { asks.push(api("GET", listPath(route, page * size))); }
    return Promise.all(asks).then(function (parts) {
      var first = parts[0], last = parts[parts.length - 1], list = { key: key, topics: [], voted: {}, more: last.more, next: last.next };
      ["counts", "tags", "wanted", "waiting"].forEach(function (field) { list[field] = first[field]; });
      parts.forEach(function (part) {
        part.topics.forEach(function (topic) { if (!list.topics.some(function (t) { return t.id === topic.id; })) { list.topics.push(topic); } });
        part.voted.forEach(function (id) { list.voted[id] = true; });
      });
      list.latest = list.topics.reduce(function (max, topic) { return Math.max(max, topic.lastAt); }, 0);
      state.list = list;
    });
  }
  /** Is this opening of a topic a view to count? Once a day per topic in this browser. */
  function countsAsView(id) {
    var today = Math.floor(Date.now() / DAY);
    if (memory.viewed[id] === today) { return false; }
    Object.keys(memory.viewed).forEach(function (key) { if (memory.viewed[key] !== today) { delete memory.viewed[key]; } });
    memory.viewed[id] = today;
    remember();
    return true;
  }
  /** Loads what the address asks for and draws the page. `quiet`: without the loading line (a refresh in place). */
  function show(quiet) {
    if (!FORUM) { renderUser(); return Promise.resolve(); }      // another page of the site: only its top bar
    var route = parseRoute(), work, needsUser = route.view === "account" || route.view === "saved" || route.view === "admin" || !!route.filter;
    closeFloat();
    if (needsUser && !state.me) {                 // a place of signed-in users: the list, and the sign-in dialog over it
      ui.after = location.hash;
      route = { view: "list", kind: "", filter: "", tag: "", ask: "login" };
    }
    if (route.view === "admin" && !isMod()) { route = { view: "list", kind: "", filter: "", tag: "" }; }
    ui.route = route;
    busyLine(!quiet);
    if (route.view === "topic") {
      work = api("GET", "/topics/" + route.id + (countsAsView(route.id) ? "?view=1" : "")).then(function (data) {
        if (data.moved) { location.replace("#t=" + Number(data.moved)); throw failure("moved"); }       // it was merged into another topic
        // what is new for this reader: whatever came after the point he reached - kept on the account, or in this browser
        data.since = state.me ? data.readAt : (memory.read[route.id] || memory.seen[route.id] || memory.last);
        ui.read = { topic: route.id, post: 0, at: Math.max(data.since, ui.read.topic === route.id ? ui.read.at : 0), dirty: false, timer: 0 };
        if (!state.current || state.current.topic.id !== route.id) { state.here = []; state.typing = []; setTimeout(pulse, 800); }      // who else is here: asked at once
        state.current = data;
        ui.fresh = "";
        state.notes.forEach(function (note) { if (note.topic === route.id) { note.seen = true; } });     // opening a topic silences its bell
        state.unseen = state.notes.filter(function (note) { return !note.seen; }).length;
      });
    } else if (route.view === "post") {
      work = api("GET", "/posts/" + route.post).then(function (data) {
        location.replace("#t=" + Number(data.topic) + "&p=" + route.post);
        throw failure("moved");
      });
    } else if (route.view === "user") {
      work = api("GET", "/users/" + route.id + (countsAsView("u" + route.id) ? "?view=1" : "")).then(function (data) { state.profile = data; });
    } else if (route.view === "search") {
      work = api("GET", "/search?q=" + encodeURIComponent(route.q)).then(function (data) { state.found = data; });
    } else if (route.view === "saved") {
      work = api("GET", "/me/saves").then(function (data) { state.saved = data.posts; });
    } else if (route.view === "account") {
      work = Promise.all([api("GET", "/me/account"), api("GET", "/me/avatar")]).then(function (got) { state.account = got[0]; ui.ownAvatar = got[1]; return pushState(); });
    } else if (route.view === "admin") {
      work = api("GET", "/admin/queue").then(function (data) { state.queue = data; });
    } else if (route.view === "privacy") {
      work = Promise.resolve();                 // the page's own text (#privacy-text in forum.html): nothing to ask
    } else {
      work = loadList(route).then(function () { ui.listHash = listHash(route); });
    }
    return work.then(function () {
      ui.view = route.view;
      ui.loaded = Date.now();
      if (route.view !== "topic") { state.current = null; }
      busyLine(false);
      render();
      if (route.ask && !state.me) {
        ui.authTab = route.ask;
        ui.authNote = ""; ui.authName = "";
        ui.modal = "auth";
        renderModal();
      }
    }, function (error) {
      busyLine(false);
      if (error.code === "moved") { return; }
      if (error.code === "expired") { toast(ERRORS.expired); return show(); }      // signed out by now: the same place, as a visitor
      ui.view = error.code === "not_found" ? "missing" : "failed";
      ui.failure = error;
      render();
    });
  }

  /* ---------- who is signed in ---------- */
  function took(data) {
    state.me = data.user;
    store.set(KNOWN, "1");
    state.notes = data.notes || [];
    state.unseen = data.unseen || 0;
    state.waiting = data.waiting || 0;
    state.follows = {}; state.ignores = {};
    (data.follows || []).forEach(function (id) { state.follows[id] = true; });
    (data.ignores || []).forEach(function (id) { state.ignores[id] = true; });
  }
  function signedIn(data) {
    store.set(TOKEN, data.token);
    took(data);
    ui.credential = "";
    ui.recovery = data.recovery || "";
    ui.modal = ui.recovery ? "recovery" : "";       // a new name-and-password account first sees its recovery code
    renderModal();
    return show().then(function () { if (!ui.modal) { follow(); } });
  }
  function signedOut() {
    store.set(TOKEN, null);
    state.me = null; state.notes = []; state.unseen = 0; state.waiting = 0; state.follows = {}; state.ignores = {};
    state.queue = null; state.account = null; state.saved = null;
    ui.ownAvatar = null;
    ui.draft = blankDraft(); ui.reply = null; ui.quote = null; ui.picked = {}; ui.shown = {};      // what he was writing does not stay for the next one at this computer
    ui.shots = { reply: null, compose: null, edit: undefined };
  }
  /** What the visitor was on the way to when the board asked him to sign in. */
  function follow() {
    var after = ui.after;
    ui.after = "";
    if (after === "new") { openCompose(); }
    else if (after && after.charAt(0) === "#" && location.hash !== after) { location.hash = after; }
  }
  function refreshMe() {
    if (!store.get(TOKEN)) { return Promise.resolve(); }
    return api("GET", "/me").then(took, function (error) { if (error.code !== "expired") { throw error; } });
  }
  /** The board's settings (Google's client, the limits, the key of the notifications): asked once, when first needed. */
  var configuring = null;
  function configure() {
    if (!configuring) {
      configuring = API == null ? Promise.reject(failure("not_configured")) : api("GET", "/config").then(function (config) { state.config = config; });
      configuring.catch(function () { configuring = null; });          // a failure is asked again the next time
    }
    return configuring;
  }

  /* ---------- the account, in the top bar (the site's own top bar, on every page) ---------- */
  function renderUser() {
    var el = document.getElementById("user"), board = document.getElementById("board");
    if (board) { board.setAttribute("data-me", state.me ? "1" : ""); }
    el.removeAttribute("data-pending");                // site.js hides the top bar's "כניסה" of a member until this script knows him
    // what the site offers only a visitor ("הרשמה" beside "לפורום"; site.css .for-visitors) goes away for a member
    if (state.me) { document.documentElement.setAttribute("data-member", ""); } else { document.documentElement.removeAttribute("data-member"); }
    if (!state.me) { el.innerHTML = GUEST; return; }
    var me = state.me, unseen = state.unseen, waiting = isMod() ? state.waiting : 0;
    el.innerHTML = '<button type="button" class="ib" data-act="bell" aria-haspopup="true" aria-expanded="false" title="התראות" aria-label="התראות' +
        (unseen ? ": " + unseen + " שלא נקראו" : "") + '">' + icon(unseen ? "notifications-fill" : "notifications") + (unseen ? '<span class="counter">' + unseen + "</span>" : "") + "</button>" +
      '<button type="button" class="me" data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="החשבון שלי" title="' + esc(me.name) + '">' +
        face(me) + (waiting ? '<span class="counter">' + waiting + "</span>" : "") + "</button>";
  }

  /* ---------- what floats next to what opened it: a menu, the bell's list, the signs ---------- */
  function openFloat(key, anchor, html, kind) {
    if (ui.float && ui.float.key === key) { closeFloat(true); return; }       // a second press closes it
    closeFloat();
    var layer = document.getElementById("float");
    layer.innerHTML = '<div class="float ' + (kind || "menu") + '" role="' + (kind ? "dialog" : "menu") + '">' + html + "</div>";
    var box = layer.firstChild, rect = anchor.getBoundingClientRect();
    var left = rect.left, top = rect.bottom + 4;
    if (left + box.offsetWidth > window.innerWidth - 8) { left = rect.right - box.offsetWidth; }
    if (top + box.offsetHeight > window.innerHeight - 8) { top = rect.top - box.offsetHeight - 4; }
    box.style.left = Math.max(8, left) + "px";
    box.style.top = Math.max(8, top) + "px";
    ui.float = { key: key, anchor: anchor };
    anchor.setAttribute("aria-expanded", "true");
    var first = box.querySelector("a, button");
    if (first) { first.focus(); }
  }
  function closeFloat(refocus) {
    if (!ui.float) { return; }
    var anchor = ui.float.anchor;
    ui.float = null;
    document.getElementById("float").innerHTML = "";
    if (anchor && document.body.contains(anchor)) {
      anchor.setAttribute("aria-expanded", "false");
      if (refocus) { anchor.focus(); }
    }
  }
  function menuItem(act, iconId, label, attrs, more, danger) {
    return '<button type="button" class="menu__item' + (danger ? " menu__item--danger" : "") + '" role="menuitem" data-act="' + act + '"' + (attrs || "") + ">" +
      icon(iconId) + "<span>" + label + "</span>" + (more || "") + "</button>";
  }
  function menuLink(href, iconId, label, more) {
    return '<a class="menu__item" role="menuitem" href="' + href + '">' + icon(iconId) + "<span>" + label + "</span>" + (more || "") + "</a>";
  }

  var NOTE_ICON = { reply: "chat-bubble", mention: "alternate-email", like: "thumb-up", answer: "check-circle", status: "info", approved: "check", topic: "forum" };
  function noteText(note) {
    var topic = "״" + name(note.title) + "״", actor = name(note.name);
    if (note.kind === "reply") { return "תגובה חדשה מאת " + actor + " בנושא " + topic; }
    if (note.kind === "mention") { return actor + " מזכיר אתכם בנושא " + topic; }
    if (note.kind === "like") { return "לייק מאת " + actor + " על ההודעה שלכם בנושא " + topic; }
    if (note.kind === "answer") { return "ההודעה שלכם סומנה כתשובה בנושא " + topic; }
    if (note.kind === "status") { return "הנושא שלכם " + topic + " סומן: " + esc(STATUS[note.extra] || note.extra); }
    if (note.kind === "approved") { return "ההודעה שלכם בנושא " + topic + " אושרה ופורסמה"; }
    if (note.kind === "topic") { return "נושא חדש מאת " + actor + ": " + topic; }
    return topic;
  }
  function bellPanel() {
    var rows = state.notes.map(function (note) {
      return '<a class="note' + (note.seen ? "" : " note--new") + '" href="' + FORUM_PAGE + '#t=' + Number(note.topic) + (note.post ? "&p=" + Number(note.post) : "") + '">' +
        icon(NOTE_ICON[note.kind] || "notifications") + "<div><b>" + noteText(note) + "</b><span>" + ago(note.at) + "</span></div></a>";
    }).join("");
    return '<div class="menu__title"><span>התראות</span>' +
      (state.unseen ? '<button type="button" class="mb mb--text mb--small" data-act="notes-seen">סימון הכול כנקרא</button>' : "") + "</div>" +
      (rows || '<p class="notes__empty">אין התראות. כשיגיבו בנושא שאתם עוקבים אחריו, או יזכירו אתכם, זה יופיע כאן.</p>');
  }
  function accountMenu() {
    var me = state.me;
    return '<div class="menu__head">' + face(me) + "<div><b>" + name(me.name) + "</b><span>" +
        (me.admin ? "יוצר מובידוס" : me.mod ? "מנהל" : me.google ? "מחוברים עם Google" : "מחוברים בשם ובסיסמה") + "</span></div></div>" +
      '<hr class="hr">' +
      menuLink(FORUM_PAGE + "#u=" + Number(me.id), "person", "הדף שלי") +
      menuLink(FORUM_PAGE + "#me", "settings", "הגדרות החשבון", me.pendingAvatar ? '<span class="lbl lbl--wait">תמונה ממתינה</span>' : "") +
      menuLink(FORUM_PAGE + "#saved", "bookmarks", "הודעות ששמרתי") +
      (isMod() ? menuLink(FORUM_PAGE + "#admin", "admin-panel-settings", "ניהול", state.waiting ? '<span class="counter">' + state.waiting + "</span>" : "") : "") +
      '<hr class="hr">' + menuItem("logout", "logout", "יציאה");
  }

  /* ---------- dialogs ---------- */
  function field(id, label, attrs, hint) {
    return '<div><label class="tf"><input id="' + id + '" placeholder=" " ' + (attrs || "") + '><span class="tf__label">' + label + "</span></label>" +
      (hint ? '<small class="tf__hint" id="' + id + '-hint">' + hint + "</small>" : "") + "</div>";
  }
  function ownerField() {
    return OWNER ? field("owner-code", "קוד בעלים", 'type="password" autocomplete="off"') : "";
  }
  function passwordPair(first, second) {
    return '<div class="pair">' + field("auth-pass", first, 'type="password" autocomplete="new-password" required', "לפחות 8 תווים.") +
      field("auth-pass2", second, 'type="password" autocomplete="new-password" required') + "</div>";
  }
  function authModal() {
    var tab = ui.authTab;
    var title = tab === "reset" ? "איפוס סיסמה" : "הפורום של מובידוס";
    var lede = ui.authNote || (tab === "reset" ? "עם קוד שנשלח לכתובת המייל של החשבון, או עם קוד שחזור - אם יצרתם כזה בהגדרות החשבון." : "");
    var tabs = tab === "reset" ? "" : '<div class="tabs" role="tablist">' +
      [["login", "כניסה"], ["register", "הרשמה"]].map(function (t) {
        return '<button type="button" class="tab" role="tab" data-act="auth" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</div>";
    var who = field("auth-name", tab === "reset" ? "שם משתמש, או המייל שבחשבון" : "שם משתמש",
      (tab === "reset" ? "" : 'maxlength="24" ') + 'autocomplete="username" value="' + esc(ui.authName) + '" required',
      tab === "register" ? "השם שיוצג ליד ההודעות שלכם." : "");
    var form;
    if (tab === "register") {
      form = '<form data-form="register" novalidate><div class="fields">' + who +
        field("auth-mail", "כתובת מייל", 'type="email" dir="ltr" autocomplete="email" maxlength="254" value="' + esc(ui.authMail) + '" required',
          "נשלח אליה קוד אימות. היא לא מוצגת לאיש, ונשמרת אצלנו מוצפנת.") +
        passwordPair("סיסמה", "הסיסמה שוב") +
        '<label class="check"><input type="checkbox" id="auth-notify"' + (ui.authNotify ? " checked" : "") + "><span>לשלוח לי מייל כשמגיבים לי או מזכירים אותי</span></label>" +
        '<input class="hp" id="auth-site" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' + ownerField() +
        '<p class="form-error" role="alert"></p><button class="mb mb--filled mb--block">המשך</button></div></form>';
    } else if (tab === "reset") {
      form = '<form data-form="reset" novalidate><div class="fields">' + who +
        field("auth-code", "הקוד מהמייל, או קוד שחזור", 'dir="ltr" autocomplete="off" required') +
        '<div class="row"><button type="button" class="mb mb--text mb--small" data-act="reset-code">' + icon("mail") + "שלחו לי קוד למייל שבחשבון</button></div>" +
        passwordPair("סיסמה חדשה", "הסיסמה החדשה שוב") +
        '<p class="form-error" role="alert"></p><button class="mb mb--filled mb--block">איפוס הסיסמה</button></div>' +
        '<p class="dialog__fine"><button type="button" class="mb mb--text mb--small" data-act="auth" data-tab="login">חזרה לכניסה</button></p></form>';
    } else {
      form = '<form data-form="login" novalidate><div class="fields">' + who +
        field("auth-pass", "סיסמה", 'type="password" autocomplete="current-password" required') +
        '<p class="form-error" role="alert"></p><button class="mb mb--filled mb--block">כניסה</button></div>' +
        '<p class="dialog__fine"><button type="button" class="mb mb--text mb--small" data-act="auth" data-tab="reset">שכחתי סיסמה</button></p></form>';
    }
    var google = tab === "reset" || !state.config.google ? "" :
      '<div class="or"><span>או</span></div><div class="gsi" id="gsi"></div>' +
      '<p class="dialog__fine">בכניסה עם Google לא נשמר אצלנו דבר מהחשבון, מלבד סימנים מוצפנים שמזהים אותו. כתובת המייל עצמה נשמרת רק אם תבחרו לקבל מיילים.</p>';
    var privacy = '<p class="dialog__fine"><a href="' + FORUM_PAGE + '#privacy">מה נשמר עליכם ולמה: פרטיות</a></p>';
    return '<h2 id="dialog-title">' + title + "</h2>" + (lede ? '<p class="dialog__text">' + esc(lede) + "</p>" : "") + tabs + form + google + privacy;
  }
  /** The second step of a sign-up: the code that was mailed to the address. */
  function signupModal() {
    return '<div class="dialog__icon">' + icon("mail") + '</div><h2 id="dialog-title">הקלידו את הקוד מהמייל</h2>' +
      '<p class="dialog__text">שלחנו קוד בן 6 ספרות אל <span class="ltr">' + esc(ui.signup.pending) + "</span>. הוא תקף לרבע שעה. אם הוא לא הגיע, בדקו גם בתיקיית הספאם.</p>" +
      '<form data-form="signup-code" novalidate><div class="fields">' +
      field("signup-code", "הקוד מהמייל", 'inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="8" required') +
      '<p class="form-error" role="alert"></p><button class="mb mb--filled mb--block">אימות וסיום ההרשמה</button></div>' +
      '<p class="dialog__fine"><button type="button" class="mb mb--text mb--small" data-act="signup-again">שליחת קוד חדש</button>' +
      '<button type="button" class="mb mb--text mb--small" data-act="signup-back">חזרה לטופס</button></p></form>';
  }
  /** Asks the board to mail the code of a sign-up (the first time, and again), and shows where to type it. */
  function askSignupCode(body) {
    return api("POST", "/auth/register", body).then(function (out) {
      ui.signup = { ticket: out.ticket, pending: out.pending, body: body };
      ui.modal = "signup";
      renderModal();
      if (out.code) { toast("מצב ניסיון, בלי מייל. הקוד: " + out.code); }      // only where the board has no mail set up
    });
  }
  function googleNameModal() {
    return '<h2 id="dialog-title">איך יקראו לכם בפורום?</h2><p class="dialog__text">השם יוצג ליד ההודעות שלכם: שם פרטי, כינוי, או כל שם אחר.</p>' +
      '<form data-form="google-name" novalidate><div class="fields">' + field("g-name", "שם משתמש", 'maxlength="24" value="' + esc(ui.suggestion) + '" required') +
      (ui.googleMail ? '<label class="check"><input type="checkbox" id="g-keep" checked><span>לשלוח לי מייל כשמגיבים לי או מזכירים אותי, אל <span class="ltr">' + esc(ui.googleMail) +
        "</span> (הכתובת נשמרת בחשבון רק אם הסימון נשאר)</span></label>" : "") + ownerField() + '<p class="form-error" role="alert"></p></div>' +
      '<div class="dialog__acts"><button type="button" class="mb mb--text" data-act="close">ביטול</button><button class="mb mb--filled">המשך</button></div></form>';
  }
  function googleMailModal() {
    return '<h2 id="dialog-title">הכתובת של חשבון ה-Google</h2><p class="dialog__text">אשרו שוב את חשבון ה-Google שלכם, והכתובת שלו תישמר בחשבון בלי קוד אימות.</p>' +
      '<div class="fields"><div class="gsi" id="gsi"></div></div>' +
      '<div class="dialog__acts"><button type="button" class="mb mb--text" data-act="close">ביטול</button></div>';
  }
  function recoveryModal() {
    return '<div class="dialog__icon">' + icon("key") + '</div><h2 id="dialog-title">שמרו את קוד השחזור</h2>' +
      '<p class="dialog__text">עם הקוד הזה מאפסים סיסמה שנשכחה, גם בלי גישה למייל. הוא מוצג רק עכשיו.</p>' +
      '<div class="codebox"><span class="code ltr">' + esc(ui.recovery) + "</span>" +
      '<button type="button" class="mb mb--tonal mb--small" data-act="copy-code">' + icon("content-copy") + "העתקה</button></div>" +
      '<div class="dialog__acts"><button type="button" class="mb mb--filled" data-act="saved-code" data-first>שמרתי את הקוד</button></div>';
  }
  /* The tools of a text being written - shared by the writing box and by the reply bar of a topic. */
  function writeTool(id, kind, iconId, title, more) {
    return '<button type="button" class="ib ib--small" data-act="tool" data-tool="' + kind + '" data-for="' + id + '" title="' + title + '" aria-label="' + title + '">' + icon(iconId, more) + "</button>";
  }
  function textTools(id) {
    return writeTool(id, "bold", "format-bold", "מודגש") + writeTool(id, "italic", "format-italic", "נטוי") + writeTool(id, "list", "format-list-bulleted", "רשימה", "mi--flip") +
      writeTool(id, "code", "code", "קוד") + writeTool(id, "link", "add-link", "קישור") + writeTool(id, "mention", "alternate-email", "אזכור משתמש");
  }
  function fileButton(where, look) {
    return '<label class="ib ' + (look || "ib--small") + ' filebtn" title="צירוף תמונה">' + icon("image") + '<span class="sr-only">צירוף תמונה</span>' +
      '<input type="file" class="sr-only" accept="image/*" data-change="attach" data-where="' + where + '"></label>';
  }
  function previewButton(id) {
    return '<button type="button" class="mb mb--text mb--small" data-act="preview" data-for="' + id + '">' + icon("visibility") + "תצוגה מקדימה</button>";
  }
  /** What is being written: the text field with its tools, the suggestions of names, the preview and the attached picture. */
  function writerBox(where, id, label, text, hint) {
    return '<div class="composer" data-writer="' + where + '">' +
      '<div class="writer__field"><label class="tf"><textarea id="' + id + '" placeholder=" " maxlength="' + state.config.limits.body + '" data-mentions>' + esc(text) + '</textarea><span class="tf__label">' + label + "</span></label>" +
        (hint ? '<small class="tf__hint" id="' + id + '-hint">' + hint + "</small>" : "") + "</div>" +
      '<div class="preview rt" id="' + id + '-preview" hidden></div>' +
      '<div class="suggest" id="' + id + '-suggest"></div>' +
      '<div class="toolbar">' + textTools(id) + writeTool(id, "emoji", "mood", "סמיילי") + fileButton(where) + '<span class="grow"></span>' + previewButton(id) + "</div>" +
      attachBox(where) + "</div>";
  }
  function tagsBox() {
    var limits = state.config.limits, tags = ui.draft.tags;
    var cloud = ((state.list && state.list.tags) || []).map(function (item) { return item.tag; })
      .filter(function (tag) { return tags.indexOf(tag) === -1; }).slice(0, 8);
    return '<div class="tagsfield" data-act="tags-focus">' + tags.map(function (tag, index) {
        return '<span class="chip chip--plain chip--on">' + name(tag) + '<button type="button" class="chip__x" data-act="tag-remove" data-index="' + index +
          '" aria-label="הסרת התגית ' + esc(tag) + '">' + icon("close") + "</button></span>";
      }).join("") +
      (tags.length < limits.tags ? '<input id="tag-input" maxlength="' + limits.tag + '" autocomplete="off" aria-label="תגית" placeholder="' +
        (tags.length ? "עוד תגית" : "תגיות (לא חובה): מכשיר, מסך, נושא…") + '">' : "") + "</div>" +
      (cloud.length && tags.length < limits.tags ? '<p class="tf__hint" style="margin-top:10px">תגיות שכבר יש בפורום, לבחירה:</p><div class="chips" style="margin-top:6px;padding-inline:4px">' + cloud.map(function (tag) {
        return '<button type="button" class="chip" data-act="tag-add" data-tag="' + esc(tag) + '">' + icon("add") + name(tag) + "</button>";
      }).join("") + "</div>" : "");
  }
  function pollBox() {
    var limits = state.config.limits, poll = ui.draft.poll;
    if (!poll) { return '<button type="button" class="mb mb--text" data-act="poll-toggle">' + icon("ballot") + "הוספת סקר</button>"; }
    return '<div class="pollbox"><div class="row row--between"><b>סקר</b><button type="button" class="mb mb--text mb--small" data-act="poll-toggle">הסרת הסקר</button></div>' +
      field("poll-q", "שאלת הסקר (לא חובה)", 'maxlength="' + limits.pollQuestion + '" value="' + esc(poll.question) + '"') +
      poll.options.map(function (text, index) {
        return '<div class="pollbox__opt">' + field("poll-o" + index, "אפשרות " + (index + 1), 'maxlength="' + limits.pollOption + '" value="' + esc(text) + '"') +
          (poll.options.length > 2 ? '<button type="button" class="ib" data-act="poll-less" data-index="' + index + '" aria-label="הסרת האפשרות" title="הסרת האפשרות">' + icon("close") + "</button>" : "<span></span>") + "</div>";
      }).join("") +
      (poll.options.length < limits.pollOptions ? '<div><button type="button" class="mb mb--text mb--small" data-act="poll-more">' + icon("add") + "אפשרות נוספת</button></div>" : "") +
      '<label class="check"><input type="checkbox" id="poll-multi"' + (poll.multi ? " checked" : "") + "><span>אפשר לבחור כמה תשובות</span></label></div>";
  }
  function composeModal() {
    var draft = ui.draft, limits = state.config.limits;
    return '<h2 id="dialog-title">נושא חדש</h2><form data-form="topic" novalidate><div class="fields">' +
      '<div class="seg seg--block" role="group" aria-label="סוג הנושא">' + ["idea", "question", "bug"].map(function (kind) {
        return '<button type="button" class="seg__b" data-act="kind" data-value="' + kind + '" aria-pressed="' + (draft.kind === kind) + '">' + icon(KIND_ICON[kind]) + KINDS[kind] + "</button>";
      }).join("") + "</div>" +
      field("new-title", "כותרת", 'maxlength="' + limits.title + '" value="' + esc(draft.title) + '" required', HINTS[draft.kind][0]) +
      writerBox("compose", "new-text", "פירוט", draft.body, HINTS[draft.kind][1]) +
      '<div id="tags-box">' + tagsBox() + '</div><div id="poll-box">' + pollBox() + "</div>" +
      '<p class="form-error" role="alert"></p></div>' +
      '<div class="dialog__acts"><button type="button" class="mb mb--text" data-act="close">ביטול</button>' +
      '<button class="mb mb--filled">' + icon("send", "mi--flip") + "פרסום</button></div></form>";
  }
  /** A small dialog that asks one thing and then does it:
   *  { title, text, icon, fields: [{ id, label, type, value, options, hint, max }], ok, danger, run(values) -> promise }.
   *  title and text are markup: what a user wrote goes into them through name() / esc(). */
  function ask(question) {
    closeFloat();
    ui.ask = question;
    ui.modal = "ask";
    renderModal();
  }
  function askModal() {
    var q = ui.ask;
    var fields = (q.fields || []).map(function (f) {
      var id = "ask-" + f.id;
      if (f.type === "select") {
        return '<label class="tf"><select id="' + id + '">' + f.options.map(function (option) {
          return '<option value="' + esc(option[0]) + '"' + (String(option[0]) === String(f.value) ? " selected" : "") + ">" + esc(option[1]) + "</option>";
        }).join("") + '</select><span class="tf__label">' + f.label + "</span>" + icon("expand-more") + "</label>";
      }
      if (f.type === "textarea") {
        return '<div><label class="tf"><textarea id="' + id + '" placeholder=" "' + (f.max ? ' maxlength="' + f.max + '"' : "") + ">" + esc(f.value || "") +
          '</textarea><span class="tf__label">' + f.label + "</span></label>" + (f.hint ? '<small class="tf__hint">' + f.hint + "</small>" : "") + "</div>";
      }
      return field(id, f.label, 'type="' + (f.type || "text") + '"' + (f.max ? ' maxlength="' + f.max + '"' : "") + ' value="' + esc(f.value || "") + '" ' + (f.attrs || ""), f.hint);
    }).join("");
    return (q.icon ? '<div class="dialog__icon">' + icon(q.icon) + "</div>" : "") + '<h2 id="dialog-title">' + q.title + "</h2>" +
      (q.text ? '<p class="dialog__text">' + q.text + "</p>" : "") +
      '<form data-form="ask" novalidate>' + (fields ? '<div class="fields">' + fields + "</div>" : "") + '<p class="form-error" role="alert"></p>' +
      '<div class="dialog__acts"><button type="button" class="mb mb--text" data-act="close">ביטול</button>' +
      '<button class="mb mb--filled' + (q.danger ? " mb--danger" : "") + '"' + (fields ? "" : " data-first") + ">" + q.ok + "</button></div></form>";
  }
  function historyModal() {
    var rows = (ui.history || []).map(function (edit) {
      return '<div class="versions__item"><span class="small muted">' + when(edit.at) + " · נערך על ידי " + name(edit.name) + "</span>" +
        (edit.title ? "<p><b>" + name(edit.title) + "</b></p>" : "") + "<p>" + esc(edit.body) + "</p></div>";
    }).join("");
    return '<h2 id="dialog-title">מה נכתב לפני העריכה</h2><p class="dialog__text">הגרסאות הקודמות של ההודעה, מהאחרונה לראשונה. רואים אותן רק מי שכתב אותה והמנהלים.</p>' +
      '<div class="versions">' + (rows || '<p class="muted">אין גרסאות קודמות.</p>') + "</div>" +
      '<div class="dialog__acts"><button type="button" class="mb mb--text" data-act="close" data-first>סגירה</button></div>';
  }
  /** Draws the dialog that ui.modal names, or removes it. Called only when the dialog itself changes: a redraw empties its fields. */
  function renderModal() {
    var el = document.getElementById("modal"), kind = ui.modal;
    if (kind === "zoom") {              // the picture of a message, large
      el.innerHTML = '<div class="lightbox is-open" data-act="backdrop"><div class="lb-stage"><img class="lb-img" src="' + esc(API + "/image/" + ui.zoom) +
        '" alt="התמונה בגודל מלא"></div><button type="button" class="lb-btn lb-close" data-act="close" aria-label="סגירה">' + icon("close") + "</button></div>";
      document.body.classList.add("is-locked");
      el.querySelector(".lb-close").focus();
      return;
    }
    var builder = { auth: authModal, signup: signupModal, "google-name": googleNameModal, "google-mail": googleMailModal, recovery: recoveryModal, compose: composeModal, ask: askModal, history: historyModal }[kind];
    var html = builder ? builder() : "";
    document.body.classList.toggle("is-locked", !!html);
    if (!html) { el.innerHTML = ""; return; }
    var size = kind === "compose" ? " dialog__box--wide" : kind === "auth" ? "" : kind === "history" ? " dialog__box--wide dialog__box--small" : " dialog__box--small";
    el.innerHTML = '<div class="dialog" data-act="backdrop"><div class="dialog__box' + size + '" role="dialog" aria-modal="true" aria-labelledby="dialog-title">' +
      (kind === "recovery" ? "" : '<button type="button" class="ib dialog__close" data-act="close" aria-label="סגירה" title="סגירה">' + icon("close") + "</button>") + html + "</div></div>";
    if (kind === "auth" || kind === "google-mail") { drawGoogle(); }
    fitAll();
    var first = el.querySelector("[data-first]") || el.querySelector(".tf input, .tf textarea, .tf select") || el.querySelector(".dialog__box .mb--filled");
    if (first) { first.focus(); }
  }
  /** What was typed into the new-topic dialog, kept: the dialog can be closed, or a part of it drawn again. */
  function keepDraft() {
    var pressed = document.querySelector('#modal [data-act="kind"][aria-pressed="true"]');
    if (!pressed) { return; }
    var draft = ui.draft;
    draft.kind = pressed.getAttribute("data-value");
    draft.title = value("new-title");
    draft.body = value("new-text");
    if (draft.poll) {
      draft.poll.question = value("poll-q");
      draft.poll.options = draft.poll.options.map(function (text, index) { return value("poll-o" + index); });
      draft.poll.multi = !!(document.getElementById("poll-multi") || {}).checked;
    }
  }
  function redrawPart(id, html) { var el = document.getElementById(id); if (el) { el.innerHTML = html; } }
  /** A tall text field is as tall as its text (the style sheet sets where it starts and where it stops growing). */
  function fit(area) { area.style.height = "auto"; area.style.height = area.scrollHeight + "px"; }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll("#view textarea, #modal textarea"), fit); }
  function addTag(text) {
    var tag = String(text).replace(/^[#\s]+/, "").replace(/\s+/g, " ").trim(), tags = ui.draft.tags;
    var same = function (other) { return other.toLowerCase() === tag.toLowerCase(); };
    if (tag && tags.length < state.config.limits.tags && !tags.some(same)) { tags.push(tag); }
    redrawPart("tags-box", tagsBox());
    var input = document.getElementById("tag-input");
    if (input) { input.focus(); }
  }
  function closeModal() {
    if (!ui.modal || ui.modal === "recovery") { return; }       // the recovery code is closed only by "I saved the code"
    if (ui.modal === "compose") { keepDraft(); }                // what was typed waits for the next time
    ui.modal = "";
    ui.ask = null;
    ui.googleFor = "";
    renderModal();
  }
  function openAuth(tab, note) {
    if (state.me) { return; }
    if (!state.config) { configure().then(function () { openAuth(tab, note); }, say); return; }
    var box = document.getElementById("auth-notify");
    if (ui.modal === "auth") { ui.authName = value("auth-name"); ui.authMail = value("auth-mail") || ui.authMail; if (box) { ui.authNotify = box.checked; } }      // switching tabs keeps what was typed
    else { ui.authNote = note || ""; ui.authName = ""; ui.authMail = ""; ui.authNotify = true; }
    closeFloat();
    // the top bar's "כניסה / הרשמה": the tab this browser most likely wants - "כניסה" where a member was signed in before
    if (tab === "auto") { tab = store.get(KNOWN) ? "login" : "register"; }
    ui.authTab = tab || "login";
    ui.modal = "auth";
    renderModal();
  }
  /** A new account: welcomed - and on another page of the site, offered the way to the forum. */
  function greet() { toast("נרשמתם. ברוכים הבאים!", FORUM ? null : ["to-forum", "לפורום"]); }
  function openCompose() {
    closeFloat();
    ui.modal = "compose";
    renderModal();
  }
  /** True for a signed-in visitor. Otherwise opens the sign-up dialog, remembering what he was on the way to. */
  function needLogin(note, after) {
    if (state.me) { return true; }
    ui.after = after || "";
    openAuth("register", note);
    return false;
  }

  /* ---------- "Sign in with Google" ---------- */
  var GSI = "https://accounts.google.com/gsi/client";
  function drawGoogle(tries) {
    var slot = document.getElementById("gsi");
    if (!slot) { return; }
    if (!window.google || !google.accounts || !google.accounts.id) {
      if (!document.querySelector('script[src="' + GSI + '"]')) {      // a page that does not load Google's script itself (the site's front page): now
        var script = document.createElement("script");
        script.src = GSI;
        script.async = true;
        document.head.appendChild(script);
      }
      if ((tries || 0) < 50) { setTimeout(function () { drawGoogle((tries || 0) + 1); }, 200); }
      else { slot.textContent = "הכניסה עם Google אינה זמינה כרגע."; }
      return;
    }
    if (!ui.googleReady) {
      google.accounts.id.initialize({ client_id: state.config.google, callback: onGoogle, ux_mode: "popup", auto_select: false });
      ui.googleReady = true;
    }
    google.accounts.id.renderButton(slot, {
      type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "he",
      width: Math.max(220, Math.min(400, Math.floor(slot.clientWidth)))
    });
  }
  function onGoogle(response) {
    if (ui.googleFor === "mail") {                  // a signed-in Google user keeps his own address
      api("POST", "/me/mail/google", { credential: response.credential }).then(function (account) {
        state.account = account;
        state.me.mail = !!account.mail;
        closeModal();
        toast("הכתובת נשמרה בחשבון.");
        render();
      }, say);
      return;
    }
    ui.credential = response.credential;
    api("POST", "/auth/google", { credential: ui.credential }).then(function (data) {
      if (!data.needName) { return signedIn(data); }
      ui.suggestion = data.suggestion || "";
      ui.googleMail = data.mail || "";
      ui.modal = "google-name";
      renderModal();
      var input = document.getElementById("g-name");
      if (input) { input.select(); }
    }).catch(say);
  }

  /* ---------- the list ---------- */
  // The logo's line map, as it runs behind the top of the site's own front page: the users' line in blue, the
  // developer's in orange joining it at a station, and a thin third one. A line either leaves the band at its edge
  // or ends at a station, and no station is cut.
  var ART = '<svg class="welcome__art" viewBox="0 0 560 150" aria-hidden="true" focusable="false">' +
    '<path class="art-line art-thin" d="M430 46l56 56h44"/><path class="art-line art-orange" d="M-30 112H264l66-66"/><path class="art-line art-blue" d="M-30 46H520"/>' +
    '<circle class="art-stop" cx="70" cy="46" r="8"/><circle class="art-stop" cx="190" cy="46" r="8"/><circle class="art-stop" cx="430" cy="46" r="8"/>' +
    '<circle class="art-stop" cx="520" cy="46" r="8"/><circle class="art-stop" cx="60" cy="112" r="8"/><circle class="art-stop" cx="170" cy="112" r="8"/>' +
    '<circle class="art-stop" cx="530" cy="102" r="6.5"/><circle class="art-stop" cx="330" cy="46" r="12.5"/></svg>';
  /** The top of the forum: its name over the line map. A visitor is also invited to sign up; a member gets the slim band. */
  function welcome() {
    var words = "<h1>רעיונות ודיונים</h1><p>מציעים רעיונות לאפליקציה, שואלים, מדווחים על תקלות ועוזרים זה לזה.</p>";
    if (state.me) { return '<section class="welcome welcome--slim"><div>' + words + "</div>" + ART + "</section>"; }
    return '<section class="welcome"><div>' + words +
      '<div class="row"><button type="button" class="mb mb--filled" data-act="auth" data-tab="register">הרשמה</button>' +
      '<button type="button" class="mb mb--text" data-act="auth" data-tab="login">כניסה</button></div>' +
      '<p class="welcome__note">נרשמים עם חשבון Google, או עם כתובת מייל וסיסמה. לקרוא אפשר גם בלי להירשם.</p></div>' + ART + "</section>";
  }
  function statusLabel(status) {
    return STATUS[status] ? '<span class="lbl lbl--' + esc(status) + '">' + STATUS[status] + "</span>" : "";
  }
  function stateLabels(topic) {
    return statusLabel(topic.status) +
      (topic.state === "held" ? '<span class="lbl lbl--wait">ממתין לאישור</span>' : "") +
      (topic.state === "hidden" ? '<span class="lbl lbl--wait">מוסתר</span>' : "");
  }
  function byline(user, linked) {
    var both = face(user, "xs") + name(user.name);
    return (linked ? '<a class="by who" href="#u=' + Number(user.id) + '">' + both + "</a>" : '<span class="by">' + both + "</span>") +
      (user.admin ? '<span class="lbl lbl--dev">יוצר מובידוס</span>' : "");
  }
  function voteLabel(topic) { return topic.kind === "bug" ? "קורה גם אצלי" : "תמיכה ברעיון"; }
  function votedLabel(topic) { return topic.kind === "bug" ? "סימנתם שקורה גם אצלכם" : "תמכתם ברעיון"; }
  /** The words under the number of votes (the number itself stands above them, large). */
  function votersLine(topic) {
    var n = topic.votes;
    if (topic.kind === "bug") { return n === 0 ? "עוד לא דווח שזה קורה אצל אחרים" : n === 1 ? "משתמש שזה קורה גם אצלו" : "משתמשים שזה קורה גם אצלם"; }
    return n === 0 ? "עוד אין תומכים ברעיון" : n === 1 ? "תומך ברעיון" : "תומכים ברעיון";
  }
  /** Is there something in the topic its reader did not reach yet? Signed in: the board counts for him.
   *  A visitor: by what this browser has shown. */
  function isNew(topic) {
    if (state.me) { return topic.unread > 0 && topic.watch !== -1; }
    return topic.lastAt > (memory.read[topic.id] || memory.seen[topic.id] || memory.last);
  }
  function topicRow(topic, plain) {
    var fresh = isNew(topic), n = state.me ? topic.unread : 0;
    var news = n && topic.watch !== -1 ? '<span class="lbl lbl--new">' + (n === 1 ? "הודעה חדשה" : n + " חדשות") + "</span>"
      : !state.me && fresh ? '<span class="lbl lbl--new">חדש</span>' : "";
    var voted = !!(state.list && state.list.voted[topic.id]);
    var vote = plain || topic.kind === "question" || topic.state !== "ok" ? "" :
      '<button type="button" class="chip" data-act="vote" data-id="' + topic.id + '" aria-pressed="' + voted + '" title="' + voteLabel(topic) +
        '" aria-label="' + voteLabel(topic) + ": " + topic.votes + '">' + icon("arrow-upward") + '<span class="chip__n">' + topic.votes + "</span></button>";
    return '<li class="item trow' + (fresh ? " trow--unread" : "") + (topic.watch === -1 ? " trow--muted" : "") + '">' + kindCircle(topic.kind) + "<div>" +
      '<a class="trow__title" href="#t=' + topic.id + '">' +
        (topic.pinned ? icon("push-pin-fill") + '<span class="sr-only">נעוץ: </span>' : "") + (topic.locked ? icon("lock") + '<span class="sr-only">נעול: </span>' : "") +
        '<span class="sr-only">' + (KINDS[topic.kind] || "") + ": </span>" + name(topic.title) + "</a>" +
      '<div class="trow__meta">' + stateLabels(topic) + news + (topic.poll ? '<span class="lbl">' + icon("ballot") + "סקר</span>" : "") + byline(topic.author) + DOT +
        "<span>" + (topic.replies ? "תגובה אחרונה " : "") + ago(topic.lastAt) + "</span>" +
        (topic.tags || []).map(function (tag) { return '<a class="tagchip" href="#tag=' + encodeURIComponent(tag) + '">#' + name(tag) + "</a>"; }).join("") + "</div></div>" +
      '<div class="trow__end">' + vote + '<span class="count" title="תגובות">' + icon("chat-bubble") + "<span>" + topic.replies +
        '</span><span class="sr-only"> תגובות</span></span></div></li>';
  }
  function searchForm(text) {
    return '<form class="search" data-form="search" role="search">' + icon("search") +
      '<input id="search-text" type="search" maxlength="60" placeholder="חיפוש בדיונים" aria-label="חיפוש בדיונים" value="' + esc(text || "") + '">' +
      (text ? '<a class="ib" href="' + (ui.listHash || "#") + '" aria-label="ניקוי החיפוש" title="ניקוי החיפוש">' + icon("close") + "</a>" : "") + "</form>";
  }
  function sameTag(a, b) { return String(a).replace(/[\s._-]/g, "").toLowerCase() === String(b).replace(/[\s._-]/g, "").toLowerCase(); }
  function listTitle(route) {
    if (route.tag) { return "תגית: " + name(route.tag); }
    var found = (route.filter ? MINE : NAV).filter(function (item) { return item[0] === (route.filter || route.kind); })[0];
    return found ? found[1] : NAV[0][1];
  }
  function drawer() {
    var route = ui.route, list = state.list, counts = list.counts || {};
    var nav = NAV.map(function (item) {
      var on = !route.filter && !route.tag && route.kind === item[0];
      return '<a class="navitem" href="' + (item[0] ? "#k=" + item[0] : "#") + '"' + (on ? ' aria-current="true"' : "") + ">" + icon(item[2]) + "<span>" + item[1] +
        '</span><span class="navitem__n">' + (counts[item[3]] || 0) + "</span></a>";
    }).join("");
    var mine = !state.me ? "" : '<hr class="hr">' + MINE.map(function (item) {
      return '<a class="navitem" href="#f=' + item[0] + '"' + (route.filter === item[0] ? ' aria-current="true"' : "") + ">" + icon(item[2]) + "<span>" + item[1] + "</span>" +
        (item[0] === "unread" && list.waiting ? '<span class="counter">' + list.waiting + "</span>" : "<span></span>") + "</a>";
    }).join("") + '<a class="navitem" href="#saved">' + icon("bookmarks") + "<span>הודעות ששמרתי</span><span></span></a>";
    var tags = (list.tags || []).length ? '<hr class="hr"><p class="navlabel">תגיות</p><div class="chips">' + list.tags.map(function (item) {
      return '<a class="chip' + (route.tag && sameTag(route.tag, item.tag) ? " chip--on" : "") + '" href="#tag=' + encodeURIComponent(item.tag) + '">' + name(item.tag) +
        '<span class="chip__n">' + item.n + "</span></a>";
    }).join("") + "</div>" : "";
    var wanted = (list.wanted || []).length ? '<hr class="hr"><p class="navlabel">הרעיונות עם הכי הרבה תומכים</p><ol class="wanted">' + list.wanted.map(function (topic) {
      return '<li><a href="#t=' + Number(topic.id) + '"><span class="lbl lbl--idea" title="תומכים">' + Number(topic.votes) + "</span><span>" + name(topic.title) + "</span></a></li>";
    }).join("") + "</ol>" : "";
    return '<aside class="drawer">' +
      '<button type="button" class="fab" data-act="new">' + icon("add") + "נושא חדש</button>" +
      '<nav class="navlist" aria-label="סינון הנושאים">' + nav + mine + "</nav>" + tags + wanted + "</aside>";
  }
  function listView() {
    var route = ui.route, list = state.list, topics = list.topics, counts = list.counts || {};
    // on a narrow window the drawer is not shown: its destinations come as a row of chips
    var chips = NAV.map(function (item) {
      var on = !route.filter && !route.tag && route.kind === item[0];
      return '<a class="chip' + (on ? " chip--on" : "") + '" href="' + (item[0] ? "#k=" + item[0] : "#") + '">' + icon(item[2]) + item[1] + '<span class="chip__n">' + (counts[item[3]] || 0) + "</span></a>";
    }).concat(!state.me ? [] : MINE.map(function (item) {
      return '<a class="chip' + (route.filter === item[0] ? " chip--on" : "") + '" href="#f=' + item[0] + '">' + icon(item[2]) + item[1] +
        (item[0] === "unread" && list.waiting ? '<span class="chip__n">' + list.waiting + "</span>" : "") + "</a>";
    }), route.tag ? ['<a class="chip chip--on" href="#">' + icon("sell") + name(route.tag) + icon("close") + "</a>"] : []).join("");
    var sorts = route.filter === "unread" ? "" : '<div class="sortbar"><span class="sortbar__label" id="sort-label">מיון לפי</span>' +
      '<div class="seg" role="group" aria-labelledby="sort-label">' + SORTS.map(function (sort) {
        return '<button type="button" class="seg__b" data-act="sort" data-value="' + sort[0] + '" aria-pressed="' + (ui.sort === sort[0]) + '" title="' + sort[2] + '">' +
          sort[1] + "</button>";
      }).join("") + "</div></div>";
    var body;
    if (topics.length) {
      body = '<ul class="group">' + topics.map(function (topic) { return topicRow(topic); }).join("") + "</ul>" +
        (list.more ? '<div class="more"><button type="button" class="mb mb--tonal" data-act="more">הצגת נושאים נוספים</button></div>' : "");
    } else if (!counts.all && !route.filter && !route.tag) {
      body = '<div class="empty"><span class="empty__icon">' + icon("forum") + "</span><h2>עוד לא נפתח כאן אף נושא</h2><p>היו הראשונים. מה תרצו לכתוב?</p>" +
        '<div class="row">' + STARTERS.map(function (row) {
          return '<button type="button" class="mb mb--tonal" data-act="new" data-kind="' + row[0] + '">' + icon(KIND_ICON[row[0]]) + row[1] + "</button>";
        }).join("") + "</div></div>";
    } else {
      var own = STARTERS.filter(function (row) { return row[0] === route.kind; })[0];
      body = '<div class="empty"><span class="empty__icon">' + icon(route.filter === "unread" ? "done-all" : "forum") + "</span><h2>" +
        (route.filter === "unread" ? "קראתם הכול" : "אין כאן נושאים") + "</h2><p>" +
        (route.filter === "unread" ? "אין נושאים עם הודעות שעוד לא קראתם."
          : route.filter === "watching" ? "נושא נכנס למעקב כשכותבים בו, או כשבוחרים ״במעקב״ בדף הנושא."
          : route.filter === "mine" ? "עוד לא פתחתם נושא." : route.tag ? "אין נושאים עם התגית הזו." : "עוד לא נפתחו נושאים מהסוג הזה.") + "</p>" +
        (own ? '<div class="row"><button type="button" class="mb mb--tonal" data-act="new" data-kind="' + own[0] + '">' + icon("add") + own[1] + "</button></div>" : "") + "</div>";
    }
    return welcome() + '<div class="shell">' + drawer() + '<div class="main">' + searchForm("") +
      '<nav class="kindchips" aria-label="סינון הנושאים">' + chips + "</nav>" +
      '<div class="listbar"><h2 class="listbar__sum">' + listTitle(route) + "</h2>" + sorts + "</div>" + body + "</div></div>" +
      '<button type="button" class="fab fab--float" data-act="new">' + icon("add") + "נושא חדש</button>";
  }

  /* ---------- one topic ---------- */
  function cite(quote) {
    if (!quote) { return ""; }
    if (quote.gone) { return '<blockquote class="cite cite--gone">ההודעה שצוטטה כאן הוסרה.</blockquote>'; }
    var who = quote.topic        // the quoted message moved to another topic since
      ? '<a class="cite__who" href="#t=' + Number(quote.topic) + "&p=" + Number(quote.post) + '">' + icon("format-quote") + name(quote.name) + "</a>"
      : '<button type="button" class="cite__who" data-act="goto" data-id="' + Number(quote.post) + '" title="אל ההודעה המצוטטת">' + icon("format-quote") + name(quote.name) + "</button>";
    return '<blockquote class="cite">' + who + "<p>" + esc(quote.text) + "</p></blockquote>";
  }
  function quoteSlot() {
    var quote = ui.quote;
    return !quote ? "" : '<div class="cite cite--draft"><b class="cite__who">' + icon("format-quote") + name(quote.name) + "</b><p>" + esc(quote.text) + "</p>" +
      '<button type="button" class="ib ib--small" data-act="unquote" aria-label="הסרת הציטוט" title="הסרת הציטוט">' + icon("close") + "</button></div>";
  }
  function picture(image) {
    return !image ? "" : '<button type="button" class="pic" data-act="zoom" data-key="' + esc(image.key) + '" aria-label="הגדלת התמונה">' +
      '<img src="' + esc(API + "/image/" + image.key) + '" width="' + Number(image.w) + '" height="' + Number(image.h) + '" alt="תמונה שצורפה להודעה" loading="lazy"></button>';
  }
  function pollView(poll) {
    var total = poll.options.reduce(function (sum, option) { return sum + option.votes; }, 0);
    return '<div class="poll' + (poll.multi ? " poll--multi" : "") + '">' + (poll.question ? '<p class="poll__q">' + name(poll.question) + "</p>" : "") +
      poll.options.map(function (option) {
        var share = total ? Math.round(option.votes * 100 / total) : 0;
        return '<button type="button" class="poll__opt" data-act="poll" data-id="' + option.id + '" aria-pressed="' + !!option.mine + '"' + (poll.closed ? " disabled" : "") + ">" +
          '<span class="poll__bar" style="width:' + share + '%"></span><span class="poll__mark"></span><span>' + name(option.text) + "</span>" +
          '<span class="poll__pct">' + option.votes + " · " + share + "%</span></button>";
      }).join("") +
      '<p class="poll__foot">' + count(poll.voters, "משתתף אחד", "משתתפים", "עוד לא הצביעו") +
        (poll.closed ? " · הסקר נסגר" : poll.multi ? " · אפשר לבחור כמה תשובות" : " · תשובה אחת") + "</p></div>";
  }
  function editForm(post) {
    var topic = state.current.topic, limits = state.config.limits;
    return '<form class="fields" style="margin-top:12px" data-form="edit" data-id="' + post.id + '" novalidate>' +
      (post.first ? field("edit-title", "כותרת", 'maxlength="' + limits.title + '" value="' + esc(topic.title) + '"') : "") +
      writerBox("edit", "edit-text", "ההודעה", post.body) +
      (post.first ? field("edit-tags", "תגיות, מופרדות בפסיקים", 'value="' + esc(topic.tags.join(", ")) + '"', "עד " + limits.tags + " תגיות.") : "") +
      '<p class="form-error" role="alert"></p><div class="row row--end"><button type="button" class="mb mb--text" data-act="edit-cancel">ביטול</button>' +
      '<button class="mb mb--filled">שמירה</button></div></form>';
  }
  function postView(post) {
    var data = state.current, topic = data.topic, me = state.me, mod = isMod();
    var own = !!me && me.id === post.author.id, like = state.config.reactions[0];
    var where = ' id="p' + post.id + '" data-id="' + post.id + '" data-at="' + post.created + '"';
    if (state.ignores[post.author.id] && !ui.shown[post.id]) {
      return '<li class="post post--folded"' + where + '><div class="row row--between"><span>הודעה של ' + name(post.author.name) + ", שבחרתם להתעלם ממנו.</span>" +
        '<button type="button" class="mb mb--text mb--small" data-act="unfold" data-id="' + post.id + '">הצגה</button></div></li>';
    }
    var answer = topic.answer === post.id;
    var labels = (post.state === "held" ? '<span class="lbl lbl--wait">' + icon("hourglass-empty") + "ממתינה לאישור" + (WAIT_WHY[post.why] ? ": " + WAIT_WHY[post.why] : "") + "</span>" : "") +
      (post.state === "hidden" ? '<span class="lbl lbl--wait">' + icon("visibility-off") + "מוסתרת</span>" : "") +
      (answer ? '<span class="lbl lbl--answer">' + icon("check-circle-fill") + "התשובה</span>" : "") +
      (post.author.banned ? '<span class="lbl lbl--wait">חסום</span>' : "");
    var edited = !post.edited ? "" : post.edits && (own || mod)
      ? '<button type="button" class="mb mb--text mb--small" data-act="history" data-id="' + post.id + '" title="מה נכתב לפני העריכה">נערך</button>' : "<span>(נערך)</span>";
    var head = '<div class="post__head">' + faceLink(post.author, "s") + '<a class="who post__name ' + hue(post.author) + '" href="#u=' + Number(post.author.id) + '">' + name(post.author.name) + "</a>" + marks(post.author) +
      '<a class="post__time" href="#t=' + topic.id + "&p=" + post.id + '" title="קישור להודעה">' + when(post.created) + "</a>" + edited + labels +
      '<button type="button" class="ib" data-act="post-menu" data-id="' + post.id + '" aria-haspopup="true" aria-expanded="false" aria-label="פעולות על ההודעה" title="עוד">' + icon("more-vert") + "</button></div>";
    var body;
    if (ui.editing === post.id) {
      body = editForm(post);
    } else {
      body = cite(post.quote) + (post.body ? '<div class="rt">' + window.BoardText.render(post.body, { mentions: post.mentions }) + "</div>" : "") + picture(post.image) +
        (post.first && data.poll ? pollView(data.poll) : "") + (post.sig ? '<p class="post__sig">' + name(post.sig) + "</p>" : "");
    }
    // the signs a message got, each with its count - the like among them; and the small tools of a message
    var reactions = post.reactions || {}, mine = post.mine || [], liked = mine.indexOf(like) !== -1, acts = "";
    function sign(emoji, drawn, title) {
      return '<button type="button" class="react" data-act="react" data-id="' + post.id + '" data-emoji="' + emoji + '" aria-pressed="' + (mine.indexOf(emoji) !== -1) + '"' + (own ? " disabled" : "") +
        (title ? ' title="' + title + '" aria-label="' + title + ": " + reactions[emoji] + '"' : "") + ">" + drawn + reactions[emoji] + "</button>";
    }
    function tool(act, iconId, title, more) {
      return '<button type="button" class="ib ib--small" data-act="' + act + '" data-id="' + post.id + '" title="' + title + '" aria-label="' + title + '"' + (more || "") + ">" + icon(iconId) + "</button>";
    }
    var signs = (reactions[like] ? sign(like, icon("thumb-up-fill"), "אהבתי") : "") +
      state.config.reactions.slice(1).filter(function (emoji) { return reactions[emoji]; }).map(function (emoji) { return sign(emoji, "<b>" + emoji + "</b>"); }).join("");
    if (post.state === "ok" && ui.editing !== post.id) {
      acts = '<div class="post__acts" role="toolbar" aria-label="פעולות על ההודעה">' +
        (own ? "" : tool("react", liked ? "thumb-up-fill" : "thumb-up", "אהבתי", ' data-emoji="' + like + '" aria-pressed="' + liked + '"') +
          tool("react-menu", "add-reaction", "סימן אחר", ' aria-haspopup="true" aria-expanded="false"')) +
        (post.body && !(topic.locked && !mod) ? tool("quote", "format-quote", "ציטוט (אפשר לסמן מילים בהודעה ולצטט רק אותן)") : "") +
        tool("save", post.saved ? "bookmark-fill" : "bookmark", post.saved ? "הסרה מההודעות ששמרתי" : "שמירת ההודעה", ' aria-pressed="' + !!post.saved + '"') + "</div>";
    } else if (mod && post.state !== "ok") {
      acts = '<div class="post__acts" style="margin-inline-start:0;gap:8px">' +
        '<button type="button" class="mb mb--tonal mb--small" data-act="post-state" data-id="' + post.id + '" data-state="ok">' + (post.state === "held" ? "אישור ופרסום" : "החזרה למקומה") + "</button>" +
        (post.state === "held" ? '<button type="button" class="mb mb--text mb--small" data-act="post-state" data-id="' + post.id + '" data-state="hidden">הסתרה</button>' : "") + "</div>";
    }
    var shape = post.first ? " post--first" : " post--reply" + (own ? " post--mine" : "") + (ui.editing === post.id ? " post--editing" : "");
    return '<li class="post' + shape + (post.author.admin ? " post--dev" : "") + (answer ? " post--answer" : "") + (post.state !== "ok" ? " post--off" : "") + '"' + where + ">" +
      faceLink(post.author, "", "post__lead") + '<div class="post__main">' + head + body + (signs ? '<div class="post__reacts">' + signs + "</div>" : "") + acts + "</div></li>";
  }
  function postMenu(post) {
    var topic = state.current.topic, me = state.me, mod = isMod(), own = !!me && me.id === post.author.id, id = ' data-id="' + post.id + '"';
    var items = [menuItem("copy-link", "link", "העתקת קישור להודעה", id)];
    var inTime = Date.now() - post.created < state.config.limits.editMinutes * MIN;
    var hands = mod && !(post.author.admin && !me.admin);       // what the developer wrote is his alone to change, hide or delete
    var hisTopic = post.first && !!me && !me.admin && state.current.posts.some(function (other) { return other.author.admin; });      // and so is a topic he wrote in
    if (hands || (own && inTime && !topic.locked)) { items.push(menuItem("edit", "edit", "עריכה", id)); }
    if (post.edits && (own || mod)) { items.push(menuItem("history", "history", "מה נכתב לפני העריכה", id)); }
    if (me && topic.kind === "question" && !post.first && post.state === "ok" && (topic.author.id === me.id || mod)) {
      items.push(menuItem("answer", "check-circle", topic.answer === post.id ? "ביטול הסימון כתשובה" : "סימון כתשובה לשאלה", id + ' data-on="' + (topic.answer === post.id ? "" : "1") + '"'));
    }
    if (me && !own && !post.author.admin && post.state === "ok" && !mod) { items.push(menuItem("report", "flag", "דיווח למנהלים", id)); }
    if (hands && !own && post.state === "ok") { items.push(menuItem("post-state", "visibility-off", "הסתרת ההודעה", id + ' data-state="hidden"')); }
    if (mod && !post.first && post.state === "ok") { items.push(menuItem("split", "call-split", "פיצול לנושא חדש מכאן", id)); }
    if (own || (hands && !hisTopic)) { items.push(menuItem("delete", "delete", post.first ? "מחיקת הנושא כולו" : "מחיקה", id, "", true)); }
    return items.join("");
  }
  function topicMenu() {
    var data = state.current, topic = data.topic, id = ' data-id="' + topic.id + '"';
    var items = [menuItem("copy-link", "link", "העתקת קישור לנושא", "")];
    if (isMod()) {
      items.push('<hr class="hr">',
        menuItem("flag-topic", topic.pinned ? "push-pin-fill" : "push-pin", topic.pinned ? "ביטול הנעיצה" : "נעיצה בראש הרשימה", id + ' data-field="pinned" data-on="' + (topic.pinned ? "" : "1") + '"'),
        menuItem("flag-topic", topic.locked ? "lock-open" : "lock", topic.locked ? "פתיחת הנושא לתגובות" : "נעילת הנושא לתגובות", id + ' data-field="locked" data-on="' + (topic.locked ? "" : "1") + '"'),
        menuItem("status", "info", "סטטוס…", id), menuItem("move", "swap-horiz", "שינוי הסוג…", id), menuItem("retag", "sell", "תגיות…", id));
      if (data.poll) {
        items.push(menuItem("poll-admin", "ballot", data.poll.closed ? "פתיחת הסקר מחדש" : "סגירת הסקר", id + ' data-op="' + (data.poll.closed ? "open" : "close") + '"'),
          menuItem("poll-admin", "delete", "הסרת הסקר", id + ' data-op="remove"', "", true));
      }
      items.push(menuItem("merge", "call-merge", "מיזוג לתוך נושא אחר…", id));
    }
    return items.join("");
  }
  // the first stop of a topic's route, before it has a status - by kind
  var ROUTE = { idea: ["מסלול הרעיון", "הוצע"], question: ["מסלול השאלה", "נשאלה"], bug: ["מסלול התקלה", "דווחה"] };
  /** The status of a topic as a small route, like the lines of the logo: the stops of its kind (the board's own
   *  list of statuses) and where the topic stands - what it passed, where it is, what is still ahead. */
  function routeView(topic) {
    var stops = state.config.statuses[topic.kind], words = ROUTE[topic.kind];
    if (!stops || !words) { return ""; }
    var here = Math.max(0, stops.indexOf(topic.status));
    return '<div class="routecard"><p class="panel__title">' + words[0] + '</p><ol class="route route--' + esc(topic.kind) + '">' + stops.map(function (status, index) {
      return "<li" + (index < here ? ' data-stop="was"' : index === here ? ' data-stop="now" aria-current="step"' : "") + ">" + (STATUS[status] || words[1]) + "</li>";
    }).join("") + "</ol></div>";
  }
  function personLink(user) {
    return '<a class="facelink" href="#u=' + Number(user.id) + '" title="' + esc(user.name) + '">' + face(user, "s") + '<span class="sr-only">' + esc(user.name) + "</span></a>";
  }
  /** The others who read the open topic right now (the page's own check brings them). */
  function hereView() {
    return !state.here.length ? "" : '<div class="panel hererow"><p class="panel__title">קוראים עכשיו</p><div class="people">' + state.here.map(personLink).join("") + "</div></div>";
  }
  /** "Somebody is writing": the three dots and the names - the dots say it, the words are for a screen reader only. */
  function typingView() {
    return !state.typing.length ? "" : '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span><span class="sr-only">כותבים עכשיו: </span>' +
      state.typing.map(name).join(", ") + "</span>";
  }
  /** Where a reply is written: a bar that stays at the bottom of the window, like the one of a chat - always at
   *  hand. One line that grows with its text; the picture button before it, the "A" (the tools of the text) and
   *  the smileys inside it, the send button after it. What is typed is kept in ui.reply. */
  function composerView() {
    var topic = state.current.topic, me = state.me, id = "reply-text";
    if (me && topic.locked && !isMod()) { return '<li id="composer"><p class="banner">' + icon("lock") + "<span>הנושא נעול: אי אפשר להוסיף בו תגובות.</span></p></li>"; }
    if (!me) {
      return '<li id="composer" class="dock"><div class="dock__typing" id="typing-slot" role="status">' + typingView() + '</div><button type="button" class="replybar" data-act="reply-open">' +
        "<span>כתיבת תגובה…</span>" + icon("send", "mi--flip") + "</button></li>";
    }
    var typed = ui.reply && ui.reply.id === topic.id ? ui.reply.text : "";
    return '<li id="composer" class="dock"><form class="dock__form' + (typed.trim() || ui.shots.reply ? " is-ready" : "") + '" data-form="reply" data-id="' + topic.id + '" novalidate>' +
      '<div class="dock__typing" id="typing-slot" role="status">' + typingView() + "</div>" +
      '<div id="quote-slot">' + quoteSlot() + "</div>" +
      '<div class="toolbar dock__tools" id="reply-tools" hidden>' + textTools(id) + '<span class="grow"></span>' + previewButton(id) + "</div>" +
      '<div class="suggest" id="' + id + '-suggest"></div>' +
      '<div class="dock__row">' + fileButton("reply", "dock__add") +
        '<div class="dock__pill"><div class="preview rt" id="' + id + '-preview" hidden></div>' +
          '<div class="writer__field"><textarea id="' + id + '" rows="1" placeholder="כתיבת תגובה…" aria-label="תגובה" maxlength="' + state.config.limits.body + '" data-mentions>' + esc(typed) + "</textarea></div>" +
          '<button type="button" class="ib ib--small" data-act="format" aria-pressed="false" aria-controls="reply-tools" title="עיצוב הטקסט" aria-label="עיצוב הטקסט">' + icon("text-format") + "</button>" +
          writeTool(id, "emoji", "mood", "סמיילי") + "</div>" +
        '<button class="dock__send" title="שליחה (Ctrl+Enter)" aria-label="שליחה">' + icon("send", "mi--flip") + "</button></div>" +
      attachBox("reply") + '<p class="form-error" role="alert"></p></form></li>';
  }
  /** The send button of the reply bar wakes up when there is something to send. */
  function dockReady() {
    var input = document.getElementById("reply-text");
    if (input && input.form) { input.form.classList.toggle("is-ready", !!input.value.trim() || !!ui.shots.reply); }
  }
  function watchLevel() { return state.current ? state.current.watch || 0 : 0; }
  function watchMenu() {
    var level = watchLevel();
    return WATCH.map(function (item) {
      return '<button type="button" class="menu__item" role="menuitemradio" aria-checked="' + (level === item[0]) + '" data-act="watch" data-level="' + item[0] + '">' + icon(item[3]) +
        "<span><span>" + item[1] + '</span><br><span class="small muted">' + item[2] + "</span></span></button>";
    }).join("");
  }
  function topicView() {
    var data = state.current, topic = data.topic, me = state.me, mod = isMod();
    if (ui.quote && ui.quote.topic !== topic.id) { ui.quote = null; }                    // what was being written belongs to another topic
    if (ui.shots.reply && ui.shots.reply.topic !== topic.id) { ui.shots.reply = null; }
    var votable = topic.kind !== "question" && topic.state === "ok";
    function voteButton(block) {
      return !votable ? "" : '<button type="button" class="mb ' + (data.voted ? "mb--tonal" : "mb--filled") + (block ? " mb--block mb--large" : "") + '" data-act="vote" data-id="' + topic.id +
        '" aria-pressed="' + !!data.voted + '">' + icon(data.voted ? "check" : "arrow-upward") + (data.voted ? votedLabel(topic) : voteLabel(topic)) + "</button>";
    }
    var level = WATCH.filter(function (item) { return item[0] === watchLevel(); })[0];
    function watchButton(block) {
      return '<button type="button" class="mb mb--outlined' + (block ? " mb--block" : "") + '" data-act="watch-menu" aria-haspopup="true" aria-expanded="false">' +
        icon(level[3]) + level[1] + icon("expand-more") + "</button>";
    }
    var first = data.posts[0], marked = false;
    var divides = !!first && (first.created <= data.since || (!!me && me.id === first.author.id));      // a topic never opened has no "new from here"
    var posts = data.posts.map(function (post) {
      var line = "";
      if (divides && !marked && post.created > data.since && !(me && me.id === post.author.id)) {
        marked = true;
        line = '<li class="newline"><span>הודעות חדשות</span></li>';
      }
      return line + postView(post);
    }).join("");
    var composer = composerView();
    var people = [], seen = {};
    data.posts.forEach(function (post) {
      if (post.state === "ok" && !seen[post.author.id] && people.length < 14) { seen[post.author.id] = true; people.push(post.author); }
    });
    // the pane beside the topic, one group: the votes (large, with their button), the route of its status, the level
    // of following, two figures, who reads it now, who takes part
    var side = '<aside class="side" aria-label="על הנושא">' +
      (votable ? '<div class="votecard' + (topic.kind === "bug" ? " votecard--bug" : "") + '">' + (topic.votes ? '<b class="votecard__n">' + topic.votes + "</b>" : "") +
        '<p class="votecard__line">' + votersLine(topic) + "</p>" + voteButton(true) + "</div>" : "") + routeView(topic) +
      (me ? '<button type="button" class="watchrow' + (level[0] === 1 ? " watchrow--on" : "") + '" data-act="watch-menu" aria-haspopup="true" aria-expanded="false">' + icon(level[3]) +
        "<span><b>" + level[1] + "</b><span>" + level[2] + "</span></span>" + icon("expand-more") + "</button>" : "") +
      '<p class="factline"><span>' + repliesCount(topic.replies) + "</span>" + DOT + "<span>" + count(topic.views, "צפייה אחת", "צפיות", "בלי צפיות") + "</span></p>" +
      '<div id="here-slot">' + hereView() + "</div>" +
      (people.length > 1 ? '<div class="panel"><p class="panel__title">משתתפים</p><div class="people">' + people.map(personLink).join("") + "</div></div>" : "") + "</aside>";
    var answerLink = topic.answer ? '<button type="button" class="chip" data-act="goto" data-id="' + topic.answer + '">' + icon("check-circle") + "אל התשובה</button>" : "";
    return '<div class="tv"><div class="tv__main"><header class="tv__head"><div class="tv__top">' +
        '<a class="ib" href="' + (ui.listHash || "#") + '" aria-label="חזרה לרשימת הנושאים" title="חזרה לרשימה">' + icon("arrow-forward") + "</a>" +
        '<span class="lbl lbl--' + esc(topic.kind) + '">' + icon(KIND_ICON[topic.kind] || "forum") + (KINDS[topic.kind] || "") + "</span>" + stateLabels(topic) +
        (topic.pinned ? '<span class="lbl">' + icon("push-pin-fill") + "נעוץ</span>" : "") + (topic.locked ? '<span class="lbl">' + icon("lock") + "נעול</span>" : "") +
        '<span class="grow"></span>' +
        '<button type="button" class="ib" data-act="topic-menu" aria-haspopup="true" aria-expanded="false" aria-label="פעולות על הנושא" title="עוד">' + icon("more-vert") + "</button></div>" +
      '<h1 class="tv__title">' + name(topic.title) + "</h1>" +
      '<div class="tv__meta">' + byline(topic.author, true) + DOT + "<span>" + ago(topic.created) + "</span>" + DOT + "<span>" + repliesCount(topic.replies) + "</span>" +
        topic.tags.map(function (tag) { return '<a class="tagchip" href="#tag=' + encodeURIComponent(tag) + '">#' + name(tag) + "</a>"; }).join("") + "</div>" +
      '<div class="tv__acts">' + voteButton(false) + (me ? watchButton(false) : "") + "</div>" +
      (answerLink ? '<div class="row" style="margin-top:12px">' + answerLink + "</div>" : "") + "</header>" +
      '<ol class="thread">' + posts + composer + "</ol></div>" + side + "</div>";
  }

  /* ---------- a search, the kept messages ---------- */
  function hitRow(post, words) {
    return '<li><a class="item item--link hit" href="#t=' + Number(post.topic) + "&p=" + Number(post.id) + '">' +
      '<span class="hit__top"><span class="lbl lbl--' + esc(post.kind) + '">' + (KINDS[post.kind] || "") + "</span>" +
        (post.author ? '<span class="by">' + face(post.author, "xs") + name(post.author.name) + "</span>" + DOT : "") + "<span>" + ago(post.created) + "</span></span>" +
      '<span class="hit__title">' + name(post.title) + "</span>" +
      (post.text ? '<span class="hit__text">' + window.BoardText.mark(post.text, words) + "</span>" : "") + "</a></li>";
  }
  function pageHead(title, back) {
    return '<div class="pagehead"><a class="ib" href="' + (back || ui.listHash || "#") + '" aria-label="חזרה" title="חזרה" style="margin-inline-start:-8px">' + icon("arrow-forward") + "</a><h1>" + title + "</h1></div>";
  }
  function searchView() {
    var found = state.found, q = ui.route.q;
    var none = !found.topics.length && !found.posts.length;
    return '<div class="narrow">' + pageHead("חיפוש") + searchForm(q) +
      (none ? '<div class="empty" style="margin-top:16px"><span class="empty__icon">' + icon("search") + "</span><h2>" + (found.words.length ? "לא נמצא כלום" : "מה לחפש?") + "</h2><p>" +
          (found.words.length ? "אין נושא או הודעה עם כל המילים האלה. אפשר לנסות מילה אחת, או חלק ממילה." : "כותבים מילה של שתי אותיות לפחות.") + "</p></div>" : "") +
      (found.topics.length ? '<h2 class="group__title" style="margin-top:20px">נושאים</h2><ul class="group">' + found.topics.map(function (topic) { return topicRow(topic, true); }).join("") + "</ul>" : "") +
      (found.posts.length ? '<h2 class="group__title">הודעות</h2><ul class="group">' + found.posts.map(function (post) { return hitRow(post, found.words); }).join("") + "</ul>" : "") + "</div>";
  }
  function savedView() {
    var posts = state.saved || [];
    return '<div class="narrow">' + pageHead("הודעות ששמרתי") +
      (posts.length ? '<ul class="group">' + posts.map(function (post) { return hitRow(post, []); }).join("") + "</ul>"
        : '<div class="empty"><span class="empty__icon">' + icon("bookmarks") + "</span><h2>עוד לא שמרתם הודעות</h2><p>בכל הודעה יש סימנייה. הודעה שסימנתם נשמרת כאן, ורק אתם רואים אותה.</p></div>") + "</div>";
  }

  /* ---------- a user as others see him ---------- */
  function userView() {
    var data = state.profile, user = data.user, me = state.me, self = !!me && me.id === user.id, mod = isMod();
    var relation = data.relation, now = Date.now();
    var acts = self ? '<a class="mb mb--tonal" href="#me">' + icon("settings") + "הגדרות החשבון</a>" : !me ? "" :
      '<button type="button" class="mb ' + (relation === 1 ? "mb--tonal" : "mb--filled") + '" data-act="relate" data-id="' + user.id + '" data-kind="' + (relation === 1 ? 0 : 1) + '">' +
        icon(relation === 1 ? "check" : "person-add") + (relation === 1 ? "במעקב" : "מעקב") + "</button>" +
      (user.admin ? "" : '<button type="button" class="mb mb--text" data-act="relate" data-id="' + user.id + '" data-kind="' + (relation === -1 ? 0 : -1) + '">' +
        icon("block") + (relation === -1 ? "ביטול ההתעלמות" : "התעלמות") + "</button>");
    var banned = user.banned === 1 || user.banned > now;
    var manage = !mod || self || user.admin ? "" : '<div class="panel" style="margin-top:12px"><p class="panel__title">ניהול</p><div class="row">' +
      (banned ? '<span class="lbl lbl--wait">חסום' + (user.banned > 1 ? " עד " + dateOf(user.banned) : " לצמיתות") + "</span>" : "") +
      '<button type="button" class="mb mb--outlined mb--small" data-act="ban" data-id="' + user.id + '" data-on="' + (banned ? "" : "1") + '">' + icon("block") + (banned ? "ביטול החסימה" : "חסימה…") + "</button>" +
      (user.av ? '<button type="button" class="mb mb--outlined mb--small" data-act="avatar-wipe" data-id="' + user.id + '">הסרת תמונת הפרופיל</button>' : "") +
      (me.admin ? '<button type="button" class="mb mb--outlined mb--small" data-act="role" data-id="' + user.id + '" data-role="' + (user.mod ? "user" : "mod") + '">' +
          icon("shield-person") + (user.mod ? "ביטול המינוי למנהל" : "מינוי למנהל…") + "</button>" +
        '<button type="button" class="mb mb--outlined mb--small" data-act="badge" data-id="' + user.id + '">תואר ליד השם…</button>' : "") + "</div></div>";
    var seen = Math.floor((now - user.seen) / DAY);
    return '<div class="narrow">' + pageHead("דף משתמש") +
      '<section class="phead">' + face(user, "xl") + "<div><h1>" + name(user.name) + '</h1><div class="row" style="margin-top:6px">' + marks(user) +
        '<span class="small muted">בפורום מאז ' + dateOf(user.joined) + " " + DOT + " פעילות אחרונה: " + (seen <= 0 ? "היום" : seen === 1 ? "אתמול" : "לפני " + seen + " ימים") + "</span></div>" +
        (user.about ? '<p class="phead__about">' + esc(user.about) + "</p>" : "") +
        (acts ? '<div class="row" style="margin-top:14px">' + acts + "</div>" : "") + "</div></section>" + manage +
      '<div class="stats"><div class="stat"><b>' + data.stats.topics + "</b><span>נושאים</span></div><div class=\"stat\"><b>" + data.stats.posts + "</b><span>הודעות</span></div>" +
        '<div class="stat"><b>' + data.stats.likes + '</b><span>לייקים</span></div><div class="stat"><b>' + data.stats.followers + '</b><span>עוקבים</span></div><div class="stat"><b>' + data.stats.following + "</b><span>עוקב אחרי</span></div>" +
        '<div class="stat"><b>' + data.stats.views + "</b><span>צפיות בדף</span></div></div>" +
      (data.posts.length ? '<h2 class="group__title">הודעות אחרונות</h2><ul class="group">' + data.posts.map(function (post) { return hitRow(post, []); }).join("") + "</ul>"
        : '<p class="muted" style="padding-inline:16px">עוד לא כתב הודעות.</p>') + "</div>";
  }

  /* ---------- the account's own settings ---------- */
  function switchRow(act, on, title, text, disabled, more) {
    return '<li class="item srow"><div class="srow__text"><b>' + title + "</b>" + (text ? "<span>" + text + "</span>" : "") + "</div>" +
      '<button type="button" class="switch" role="switch" aria-checked="' + !!on + '" data-act="' + act + '" aria-label="' + esc(title) + '"' + (disabled ? " disabled" : "") + (more || "") + "></button></li>";
  }
  // the mails that can be turned off one by one - the bits are those of the board (rules.js MAIL_KINDS, OWNER_MAILS)
  var MAIL_KINDS = [
    [1, "תגובה בנושא שאני עוקב אחריו", "מייל אחד לנושא, עד שאכנס אליו."],
    [2, "כשמזכירים אותי", "מישהו כתב @ ואת השם שלי."],
    [4, "עדכון על מה שכתבתי", "הודעה שלי סומנה כתשובה או אושרה, או שהנושא שלי קיבל סטטוס."]
  ];
  var OWNER_MAILS = [[1, "נושא חדש"], [2, "תגובה חדשה"], [4, "הודעה או תמונה שממתינה לאישור"], [8, "דיווח על הודעה"], [16, "תמונת פרופיל חדשה"]];
  function kindRows(act, kinds, off) {
    return kinds.map(function (kind) { return switchRow(act, !(off & kind[0]), kind[1], kind[2] || "", false, ' data-bit="' + kind[0] + '"'); }).join("");
  }
  /** Saves what arrives by mail: the whole of it goes each time, with one thing changed. */
  function savePrefs(change) {
    var account = state.account, body = { notify: account.notify, digest: account.digest, off: account.off || 0 };
    if (state.me.admin) { body.ownerOff = account.ownerOff || 0; }
    Object.keys(change).forEach(function (key) { body[key] = change[key]; });
    api("POST", "/me/prefs", body).then(function (saved) { state.account = saved; render(); }, say);
  }
  function accountView() {
    var account = state.account, me = state.me, limits = state.config.limits, own = ui.ownAvatar || {};
    var portrait = own.data ? '<img src="data:' + esc(own.mime) + ";base64," + esc(own.data) + '" alt="">' : esc(initial(me.name));
    var profile = '<h2 class="group__title">הפרופיל</h2><ul class="group">' +
      '<li class="item srow">' + '<span class="avatar avatar--l ' + hue(me) + '" aria-hidden="true">' + portrait + "</span>" +
        '<div class="srow__text"><b>תמונת פרופיל</b><span>' + (own.pending ? "התמונה ממתינה לאישור. עד אז רואים אותה רק אתם." : "נחתכת לריבוע ומוקטנת. כל אחד רואה אותה ליד ההודעות שלכם.") + "</span></div>" +
        '<label class="mb mb--tonal mb--small filebtn">בחירת תמונה<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" data-change="avatar"></label>' +
        (own.data ? '<button type="button" class="mb mb--text mb--small" data-act="avatar-remove">הסרה</button>' : "") + "</li>" +
      '<li class="item srow srow--stack"><form class="fields" data-form="profile" novalidate>' +
        '<div><label class="tf"><textarea id="about" placeholder=" " maxlength="' + limits.about + '" style="min-height:88px">' + esc(account.about) + '</textarea><span class="tf__label">כמה מילים עליכם</span></label>' +
          '<small class="tf__hint">מוצג בדף המשתמש שלכם. בלי קישורים, טלפונים וכתובות מייל.</small></div>' +
        field("signature", "חתימה", 'maxlength="' + limits.signature + '" value="' + esc(account.signature) + '"', "שורה אחת שמוצגת מתחת לכל הודעה שלכם.") +
        '<p class="form-error" role="alert"></p><div class="row row--end"><button class="mb mb--filled">שמירה</button></div></form></li></ul>';

    var mail;
    if (account.pending) {              // a code is on its way to an address (a first one, or one that replaces the one kept)
      mail = '<li class="item srow srow--stack"><div class="srow__text"><b>שלחנו קוד אל <span class="ltr">' + esc(account.pending) + "</span></b><span>הקוד בן 6 ספרות ותקף לרבע שעה. אם הוא לא הגיע, בדקו גם בתיקיית הספאם.</span></div>" +
        '<form class="row" data-form="mail-code" novalidate><div class="grow" style="min-width:160px">' + field("mail-code", "הקוד מהמייל", 'inputmode="numeric" autocomplete="one-time-code" dir="ltr" maxlength="8"') + "</div>" +
        '<button class="mb mb--filled">אימות</button><button type="button" class="mb mb--text" data-act="mail-cancel">ביטול</button><p class="form-error" role="alert" style="flex-basis:100%"></p></form></li>';
    } else if (account.mail && !ui.mailChange) {
      // a password account always has an address (it can be replaced); the address of a Google account can go
      mail = '<li class="item srow"><div class="srow__text"><b class="ltr" style="text-align:right">' + esc(account.mail) + "</b><span>הכתובת מאומתת. היא לא מוצגת לאיש, ונשמרת אצלנו מוצפנת.</span></div>" +
          (account.password ? '<button type="button" class="mb mb--text mb--small" data-act="mail-change">החלפת הכתובת</button>'
            : '<button type="button" class="mb mb--text mb--small mb--danger" data-act="mail-remove">הסרת הכתובת</button>') + "</li>" +
        switchRow("pref-notify", account.notify, "מייל כשיש חדש בשבילי", "אפשר לבחור למטה על מה יישלח מייל.") +
        (account.notify ? kindRows("mail-kind", MAIL_KINDS, account.off) : "") +
        switchRow("pref-digest", account.digest, "סיכום שבועי", "פעם בשבוע: הנושאים החדשים בפורום.");
    } else {
      mail = '<li class="item srow srow--stack"><div class="srow__text"><b>' + (account.mail ? "כתובת מייל חדשה" : account.password ? "כתובת מייל" : "כתובת מייל (לא חובה)") +
        "</b><span>" + (account.mail ? "הכתובת תוחלף אחרי שתקלידו את הקוד שיישלח לכתובת החדשה." :
          "לאיפוס סיסמה שנשכחה, ולקבלת מייל כשעונים לכם. הכתובת לא מוצגת לאיש, ונשמרת רק אחרי שתקלידו את הקוד שיישלח אליה.") + "</span></div>" +
        '<form class="row" data-form="mail" novalidate><div class="grow" style="min-width:200px">' + field("mail-address", "כתובת מייל", 'type="email" dir="ltr" autocomplete="email" maxlength="254"') + "</div>" +
        '<button class="mb mb--filled">שליחת קוד אימות</button>' + (account.mail ? '<button type="button" class="mb mb--text" data-act="mail-keep">ביטול</button>' : "") +
        '<p class="form-error" role="alert" style="flex-basis:100%"></p></form>' +
        (account.google && state.config.google ? '<div><button type="button" class="mb mb--text mb--small" data-act="google-mail">שימוש בכתובת של חשבון ה-Google שלי</button></div>' : "") + "</li>";
    }
    // the owner's own mails about the life of the board (they go to the board's own address)
    var ownerMails = !me.admin ? "" : '<h2 class="group__title">מיילים אליי על מה שקורה בפורום</h2><ul class="group">' + kindRows("owner-mail", OWNER_MAILS, account.ownerOff) + "</ul>";
    var push = !pushSupported() ? "" : switchRow("push", ui.pushOn, "התראות בדפדפן הזה", "הודעה קופצת מהדפדפן כשיש חדש בשבילכם, גם כשהפורום סגור.");
    var notices = '<h2 class="group__title">מייל והתראות</h2>' +
      (state.config.mail ? "" : '<p class="banner banner--warn" style="margin-bottom:8px">' + icon("info") + "<span>המיילים של הפורום עוד לא הופעלו כאן: קודים ומיילים לא יישלחו.</span></p>") +
      '<ul class="group">' + mail + push + "</ul>" + ownerMails +
      '<h2 class="group__title">פרטיות</h2><ul class="group">' +
      switchRow("pref-unseen", account.unseen, "לא להציג אותי בין הקוראים", "אחרים לא יראו שאתם קוראים נושא עכשיו, וגם לא שאתם כותבים בו תגובה.") + "</ul>";

    var security = '<h2 class="group__title">כניסה ואבטחה</h2><ul class="group">' +
      (account.password
        ? '<li class="item srow"><div class="srow__text"><b>סיסמה</b><span>הסיסמה עצמה לא נשמרת אצלנו ואף לא מגיעה אלינו.</span></div><button type="button" class="mb mb--tonal mb--small" data-act="password">שינוי סיסמה</button></li>' +
          '<li class="item srow"><div class="srow__text"><b>קוד שחזור</b><span>הקוד שמאפס סיסמה שנשכחה. קוד חדש מבטל את הקודם.</span></div><button type="button" class="mb mb--tonal mb--small" data-act="recovery-new">קוד חדש</button></li>'
        : '<li class="item srow"><div class="srow__text"><b>מחוברים עם Google</b><span>לחשבון הזה אין סיסמה בפורום: נכנסים אליו עם חשבון ה-Google.</span></div></li>') +
      '<li class="item srow"><div class="srow__text"><b>' + count(account.sessions, "מכשיר אחד מחובר", "מכשירים ודפדפנים מחוברים") + "</b><span>כולל הדפדפן הזה.</span></div>" +
        '<button type="button" class="mb mb--tonal mb--small" data-act="sessions-clear"' + (account.sessions > 1 ? "" : " disabled") + ">יציאה מכל האחרים</button></li></ul>";

    function people(list, kind, emptyText) {
      return list.length ? list.map(function (user) {
        return '<li class="item srow">' + face(user, "s") + '<div class="srow__text"><b>' + who(user) + "</b></div>" +
          '<button type="button" class="mb mb--text mb--small" data-act="relate" data-id="' + user.id + '" data-kind="0">' + (kind === 1 ? "הפסקת המעקב" : "ביטול ההתעלמות") + "</button></li>";
      }).join("") : '<li class="item srow"><div class="srow__text"><span>' + emptyText + "</span></div></li>";
    }
    var relations = '<h2 class="group__title">משתמשים שאני עוקב אחריהם</h2><ul class="group">' + people(account.follows, 1, "כשעוקבים אחרי משתמש (בדף שלו), מקבלים התראה כשהוא פותח נושא.") + "</ul>" +
      '<h2 class="group__title">משתמשים שאני מתעלם מהם</h2><ul class="group">' + people(account.ignores, -1, "ההודעות של משתמש שמתעלמים ממנו מוצגות מקופלות, והוא לא מפעיל אצלכם התראות.") + "</ul>";

    var danger = me.admin ? "" : '<h2 class="group__title">מחיקת החשבון</h2><ul class="group"><li class="item srow"><div class="srow__text"><b>מחיקת החשבון</b>' +
      "<span>השם, התמונה, הכתובת וההגדרות נמחקים. ההודעות שכתבתם נשארות בפורום בלי השם שלכם.</span></div>" +
      '<button type="button" class="mb mb--outlined mb--small mb--danger" data-act="delete-account">מחיקה…</button></li></ul>';

    return '<div class="narrow">' + pageHead("הגדרות החשבון") + profile + notices + security + relations + danger + "</div>";
  }

  /* ---------- the moderators' page ---------- */
  function megabytes(bytes) { return bytes < 1e6 ? Math.max(1, Math.round(bytes / 1e3)) + "KB" : (bytes / 1e6).toFixed(1) + "MB"; }
  function adminView() {
    var q = state.queue, owner = !!state.me.admin;
    function group(title, rows, none) {
      return '<h2 class="group__title">' + title + (rows.length ? ' <span class="counter">' + rows.length + "</span>" : "") + '</h2><ul class="group">' +
        (rows.join("") || '<li class="item srow"><div class="srow__text"><span>' + none + "</span></div></li>") + "</ul>";
    }
    function shot(key) { return key ? '<img class="arow__shot" src="' + esc(API + "/image/" + key) + '" alt="התמונה שצורפה להודעה">' : ""; }
    var held = q.held.map(function (item) {
      return '<li class="item arow"><b>' + (item.first ? "נושא חדש: ״" : "תגובה בנושא ״") + name(item.title) + "״</b>" +
        '<span class="small muted">' + name(item.name) + " · " + ago(item.created) + " · " + (WAIT_WHY[item.why] || "ממתינה") + '</span><p class="arow__quote">' + esc(item.body) + "</p>" + shot(item.image) +
        '<div class="row"><button type="button" class="mb mb--filled mb--small" data-act="post-state" data-id="' + Number(item.id) + '" data-state="ok">אישור ופרסום</button>' +
        '<button type="button" class="mb mb--text mb--small" data-act="post-state" data-id="' + Number(item.id) + '" data-state="hidden">הסתרה</button>' +
        '<a class="mb mb--text mb--small" href="#u=' + Number(item.uid) + '">הכותב</a><a class="mb mb--text mb--small" href="#t=' + Number(item.topic) + "&p=" + Number(item.id) + '">לנושא</a></div></li>';
    });
    var avatars = q.avatars.map(function (item) {
      return '<li class="item srow"><span class="avatar avatar--l"><img src="data:' + esc(item.mime) + ";base64," + esc(item.data) + '" alt=""></span><div class="srow__text"><b>' + name(item.name) + "</b></div>" +
        '<button type="button" class="mb mb--filled mb--small" data-act="avatar-review" data-id="' + Number(item.uid) + '" data-ok="1">אישור</button>' +
        '<button type="button" class="mb mb--text mb--small" data-act="avatar-review" data-id="' + Number(item.uid) + '" data-ok="">דחייה</button></li>';
    });
    var reports = q.reports.map(function (item) {
      return '<li class="item arow"><b>הודעה של ' + name(item.author) + " בנושא ״" + name(item.title) + "״</b>" +
        '<span class="small muted">דיווח מאת ' + name(item.reporter) + " · " + ago(item.created) + '</span><p class="arow__quote">' + esc(item.body) + "</p>" + shot(item.image) +
        '<div class="row"><button type="button" class="mb mb--filled mb--small" data-act="post-state" data-id="' + Number(item.post) + '" data-state="hidden">הסתרת ההודעה</button>' +
        '<button type="button" class="mb mb--text mb--small" data-act="report-done" data-id="' + Number(item.id) + '">סגירת הדיווח</button>' +
        '<a class="mb mb--text mb--small" href="#t=' + Number(item.topic) + "&p=" + Number(item.post) + '">לנושא</a></div></li>';
    });
    var people = (q.people || []).map(function (user) {
      return '<li><a class="item item--link srow" href="#u=' + Number(user.id) + '">' + face(user, "s") + '<div class="srow__text"><b>' + name(user.name) + "</b><span>הצטרף " + ago(user.created) + " · " +
        count(user.posts, "הודעה אחת", "הודעות", "בלי הודעות") + "</span></div>" + marks(user) + (user.banned ? '<span class="lbl lbl--wait">חסום</span>' : "") + "</a></li>";
    });
    var ownerPart = "";
    if (owner && q.stats) {
      var s = q.stats, top = Math.max.apply(null, q.days.map(function (day) { return day.n; }).concat([1]));
      var today = Math.floor(Date.now() / DAY), bars = [];
      for (var day = today - 13; day <= today; day++) {
        var hit = q.days.filter(function (item) { return Math.floor(item.day) === day; })[0];
        bars.push('<i style="height:' + Math.round((hit ? hit.n : 0) * 100 / top) + '%" title="' + (hit ? hit.n : 0) + '"></i>');
      }
      var mail = !q.mailOn ? "המיילים עוד לא הוגדרו: מה שקורה בפורום מופיע רק כאן, ולמשתמשים לא נשלחים קודים והתראות."
        : q.failedMails ? count(q.failedMails, "מייל אחד נכשל", "מיילים נכשלו") + " בשבוע האחרון (" + esc(q.mailError) + ")."
        : "המיילים פעילים. היום נשלחו " + s.mailsToday + (s.mailsWaiting ? ", ועוד " + s.mailsWaiting + " ממתינים" : "") + ".";
      var states = { sent: "נשלח", queued: "ממתין", failed: "נכשל", off: "לא הוגדר", skipped: "דולג" };
      var kinds = { owner: "אליך", code: "קוד", note: "התראה", digest: "סיכום" };
      ownerPart = '<h2 class="group__title">הפורום במספרים</h2><div class="stats" style="margin-top:0"><div class="stat"><b>' + s.users + "</b><span>משתמשים (" + s.usersWeek + " השבוע)</span></div>" +
          '<div class="stat"><b>' + s.topics + '</b><span>נושאים</span></div><div class="stat"><b>' + s.posts + "</b><span>הודעות (" + s.postsWeek + " השבוע)</span></div>" +
          '<div class="stat"><b>' + s.withMail + "</b><span>הוסיפו מייל</span></div></div>" +
        '<div class="panel"><p class="panel__title">הודעות ביום, שבועיים אחרונים</p><div class="spark">' + bars.join("") + "</div></div>" +
        '<h2 class="group__title">מיילים</h2><ul class="group"><li class="item srow"><div class="srow__text"><b>' + mail + "</b>" +
          (ui.mailTest ? "<span>" + esc(ui.mailTest) + "</span>" : "") + "</div>" +
          (q.mailOn ? '<button type="button" class="mb mb--tonal mb--small" data-act="mail-test">מייל ניסיון</button>' : "") + "</li>" +
          (q.mailLog.length ? '<li class="item"><div class="maillog">' + q.mailLog.map(function (row) {
            return "<span>" + (kinds[row.kind] || esc(row.kind)) + (row.name ? ": " + name(row.name) : "") + "</span><span>" + (row.subject ? name(row.subject) : "קוד אימות") +
              '</span><span class="muted">' + (states[row.state] || "בשליחה") + " · " + ago(row.created) + "</span>";
          }).join("") + "</div></li>" : "") +
          '<li class="item srow"><div class="srow__text"><b>התראות דפדפן</b><span>' + (q.pushOn ? "פעילות. " + count(s.browsers, "דפדפן אחד נרשם", "דפדפנים נרשמו", "עוד לא נרשם דפדפן") + "." : "לא הוגדרו (חסר מפתח VAPID).") + "</span></div></li></ul>" +
        (q.storage && q.storage.bytes ? '<h2 class="group__title">אחסון</h2><ul class="group"><li class="item srow"><div class="srow__text"><b>המסד תופס ' + megabytes(q.storage.bytes) + " מתוך 500MB</b><span>" +
          count(q.storage.images, "תמונה אחת צורפה", "תמונות צורפו", "לא צורפו תמונות") + " להודעות.</span></div></li></ul>" : "");
    }
    return '<div class="narrow">' + pageHead("ניהול") +
      group("הודעות שממתינות לאישור", held, "אין הודעות שממתינות.") +
      (avatars.length || state.config.avatarReview ? group("תמונות פרופיל שממתינות לאישור", avatars, "אין תמונות שממתינות.") : "") +      // pictures wait only when AVATAR_REVIEW is on
      group("דיווחים פתוחים", reports, "אין דיווחים פתוחים.") + ownerPart +
      '<h2 class="group__title">הנרשמים האחרונים</h2><ul class="group">' + people.join("") + "</ul></div>";
  }

  function render() {
    var view = document.getElementById("view");
    var place = ui.view + (ui.view === "topic" ? state.current.topic.id : "");
    var arrived = place !== ui.place;            // a new place slides in; a redraw of the place one is at does not
    ui.place = place;
    view.classList.remove("view--in");
    // on the next frame, so that land() - which runs first - measures the page where it will rest
    if (arrived && !document.hidden) { requestAnimationFrame(function () { view.classList.add("view--in"); }); }
    document.getElementById("board").setAttribute("data-view", ui.view);
    document.body.classList.toggle("has-dock", ui.view === "topic");      // the snackbar rises above the reply bar
    document.title = ui.view === "topic" ? state.current.topic.title + " - מובידוס" : ui.view === "privacy" ? "פרטיות - מובידוס" : TITLE;
    if (ui.view === "list") { view.innerHTML = listView(); }
    else if (ui.view === "topic") { view.innerHTML = topicView(); setTimeout(reached, 300); }
    else if (ui.view === "search") { view.innerHTML = searchView(); }
    else if (ui.view === "saved") { view.innerHTML = savedView(); }
    else if (ui.view === "user") { view.innerHTML = userView(); }
    else if (ui.view === "account") { view.innerHTML = accountView(); }
    else if (ui.view === "admin") { view.innerHTML = adminView(); }
    else if (ui.view === "privacy") {        // what the forum keeps and why: the text of forum.html's #privacy-text
      view.innerHTML = '<div class="narrow">' + pageHead("פרטיות") + '<div class="prose">' + document.getElementById("privacy-text").innerHTML + "</div></div>";
    }
    else if (ui.view === "missing") {
      view.innerHTML = '<div class="narrow">' + pageHead("לא נמצא") + '<div class="empty"><span class="empty__icon">' + icon("search") + "</span><h2>לא נמצא</h2><p>" + ERRORS.not_found + "</p></div></div>";
    } else if (ui.view === "failed") {
      view.innerHTML = '<div class="narrow"><div class="empty"><span class="empty__icon">' + icon("error") + "</span><h2>הפורום לא נטען</h2><p>" + explain(ui.failure) + "</p>" +
        (ui.failure.code === "network" ? '<p>כתובת הפורום: <span class="ltr">' + esc(API || location.origin) + "</span></p>" : "") +
        (ui.failure.code === "not_configured" ? "" : '<div class="row"><button type="button" class="mb mb--tonal" data-act="retry">' + icon("refresh") + "ניסיון נוסף</button></div>") + "</div></div>";
    } else { view.innerHTML = '<p class="bstate">טוען…</p>'; }
    fitAll();
    renderUser();
    renderPill();
  }
  /** "There is something new" - a button that floats over the page until it is pressed. */
  function renderPill() {
    var old = document.getElementById("pill");
    if (old) { old.parentNode.removeChild(old); }
    if (!ui.fresh) { return; }
    var pill = document.createElement("button");
    pill.type = "button";
    pill.id = "pill";
    pill.className = "mb mb--filled pill";
    pill.setAttribute("data-act", "pill");
    pill.innerHTML = icon("arrow-downward") + esc(ui.fresh);
    document.body.appendChild(pill);
  }
  /** One message drawn again in place: after a sign, a save, an unfolding. */
  function redrawPost(id) {
    var el = document.getElementById("p" + id), post = postOf(id);
    if (el && post) { el.outerHTML = postView(post); }
  }
  function postOf(id) {
    return state.current ? state.current.posts.filter(function (post) { return post.id === id; })[0] : null;
  }

  /* ---------- writing: the tools of a text field, and names after an "@" ---------- */
  function typedInto(input, text, from, to, selectFrom, selectTo) {
    input.value = input.value.slice(0, from) + text + input.value.slice(to);
    input.focus();
    input.setSelectionRange(selectFrom, selectTo);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /** Puts `before` and `after` around what is marked in the field (or around a sample word, left marked). */
  function wrapSelection(input, before, after, sample) {
    var from = input.selectionStart, to = input.selectionEnd, chosen = input.value.slice(from, to) || sample;
    typedInto(input, before + chosen + after, from, to, from + before.length, from + before.length + chosen.length);
  }
  var tools = {
    bold: function (input) { wrapSelection(input, "**", "**", "מודגש"); },
    italic: function (input) { wrapSelection(input, "*", "*", "נטוי"); },
    code: function (input) { wrapSelection(input, "`", "`", "קוד"); },
    link: function (input) {
      var from = input.selectionStart, to = input.selectionEnd, chosen = input.value.slice(from, to) || "מילים";
      var text = "[" + chosen + "](https://)";
      typedInto(input, text, from, to, from + text.length - 1, from + text.length - 1);      // the cursor waits after "https://"
    },
    list: function (input) {             // every marked line becomes an item
      var text = input.value, from = text.lastIndexOf("\n", input.selectionStart - 1) + 1, to = input.selectionEnd;
      var lines = text.slice(from, to).split("\n").map(function (line) { return /^\s*[-*•]\s/.test(line) ? line : "- " + line; }).join("\n");
      typedInto(input, lines, from, to, from + lines.length, from + lines.length);
    },
    mention: function (input) {
      var at = input.selectionStart, alone = !at || /\s/.test(input.value.charAt(at - 1));
      typedInto(input, (alone ? "" : " ") + "@", at, input.selectionEnd, at + (alone ? 1 : 2), at + (alone ? 1 : 2));
    },
    emoji: function (input, el) {
      openFloat("emoji:" + input.id, el, EMOJIS.map(function (emoji) {
        return '<button type="button" data-act="emoji-pick" data-for="' + input.id + '" data-emoji="' + emoji + '">' + emoji + "</button>";
      }).join(""), "emojis");
    }
  };
  /** Whom a message can mention without asking the board: the writers of the open topic, and whoever was picked from the suggestions. */
  function known() {
    var out = [], seen = {};
    function add(user) { if (user && !seen[user.id]) { seen[user.id] = true; out.push({ id: user.id, name: user.name, av: user.av }); } }
    if (state.current) { state.current.posts.forEach(function (post) { add(post.author); }); }
    Object.keys(ui.picked).forEach(function (key) { add(ui.picked[key]); });
    return out;
  }
  function mentionIds(text) {
    var lower = String(text).toLowerCase();
    return known().filter(function (user) { return lower.indexOf("@" + user.name.toLowerCase()) !== -1; }).map(function (user) { return user.id; }).slice(0, state.config.limits.mentions);
  }
  var suggestTimer = 0;
  function drawSuggest(slot, id, users) {
    slot.innerHTML = users.map(function (user) {
      return '<button type="button" class="chip" data-act="mention-pick" data-for="' + id + '" data-id="' + Number(user.id) + '" data-name="' + esc(user.name) + '">' + face(user, "xs") + name(user.name) + "</button>";
    }).join("");
  }
  /** While an "@" and the beginning of a name stand before the cursor: the names it may be, as chips under the field. */
  function suggest(input) {
    var slot = document.getElementById(input.id + "-suggest");
    if (!slot) { return; }
    var match = state.me ? /(^|[\s(])@([^\s@]{0,24})$/.exec(input.value.slice(0, input.selectionStart)) : null;
    clearTimeout(suggestTimer);
    if (!match) { slot.innerHTML = ""; return; }
    var typed = match[2].toLowerCase();
    var local = known().filter(function (user) { return user.id !== state.me.id && user.name.toLowerCase().indexOf(typed) === 0; }).slice(0, 6);
    drawSuggest(slot, input.id, local);
    if (typed.length < 2) { return; }
    suggestTimer = setTimeout(function () {
      api("GET", "/users?q=" + encodeURIComponent(typed)).then(function (out) {
        var seen = {};
        drawSuggest(slot, input.id, local.concat(out.users).filter(function (user) {
          if (user.id === state.me.id || seen[user.id]) { return false; }
          seen[user.id] = true;
          return true;
        }).slice(0, 8));
      }, function () { /* the local names stay */ });
    }, 280);
  }

  /* ---------- browser notifications ---------- */
  function pushSupported() {
    return !!state.config && !!state.config.push && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  function pushSubscription() {
    return navigator.serviceWorker.getRegistration().then(function (registration) { return registration ? registration.pushManager.getSubscription() : null; });
  }
  /** Is this browser one that gets the board's notifications? */
  function pushState() {
    ui.pushOn = false;
    if (!pushSupported()) { return Promise.resolve(); }
    return pushSubscription().then(function (subscription) { ui.pushOn = !!subscription && Notification.permission === "granted"; }, function () { /* stays off */ });
  }
  function pushKey() {
    var raw = atob(state.config.push.replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { out[i] = raw.charCodeAt(i); }
    return out;
  }
  function pushOn() {
    return Notification.requestPermission().then(function (answer) {
      if (answer !== "granted") { throw failure("denied"); }
      return navigator.serviceWorker.register("board-sw.js?api=" + encodeURIComponent(API));
    }).then(function () { return navigator.serviceWorker.ready; }).then(function (registration) {
      return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey() });
    }).then(function (subscription) { return api("POST", "/me/push", { endpoint: subscription.endpoint }); });
  }
  /** This browser stops being knocked on (when its user asks, and when he signs out: the next one here is someone else). */
  function pushOff() {
    if (!("serviceWorker" in navigator)) { return Promise.resolve(); }
    return pushSubscription().then(function (subscription) {
      if (!subscription) { return null; }
      return api("DELETE", "/me/push", { endpoint: subscription.endpoint }).catch(function () { /* gone with the session anyway */ })
        .then(function () { return subscription.unsubscribe(); });
    }).catch(function () { /* nothing to stop */ });
  }

  /* ---------- actions ---------- */
  function formError(form, text) { var el = form.querySelector(".form-error"); if (el) { el.textContent = text || ""; } }
  /** Runs the work of a form with its button disabled, and writes a failure under the form. */
  function busy(form, work) {
    var button = form.querySelector("button.mb--filled");
    formError(form, "");
    if (button) { button.disabled = true; }
    return work().catch(function (error) {
      if (button) { button.disabled = false; }
      if (error !== SAID) { formError(form, explain(error)); }
    });
  }
  var SAID = failure("said");            // a refusal the form already explained in its own words
  // The board never sees a password, so only the page can refuse one that is guessed first: the well-known ones,
  // one character repeated, a run of the keyboard or of digits, the user's own name.
  var COMMON = ["password", "password1", "password123", "passw0rd", "iloveyou", "qwertyui", "qwertyuiop", "qwerty123", "1q2w3e4r", "1qaz2wsx",
    "abcd1234", "abc12345", "a1234567", "aa123456", "12341234", "11223344", "12121212", "123123123", "asdfghjk", "zxcvbnm1", "סיסמה123", "אבגדהוזח"];
  function weak(pass, who) {
    var flat = pass.toLowerCase().trim(), mine = String(who || "").toLowerCase().replace(/\s+/g, "");
    return COMMON.indexOf(flat) !== -1 || /^(.)\1*$/.test(flat) || "01234567890123456789".indexOf(flat) !== -1 || "98765432109876543210".indexOf(flat) !== -1 ||
      (mine.length > 3 && flat.replace(/\s+/g, "") === mine);
  }
  function newPassword(form, first, second) {
    var pass = value(first || "auth-pass");
    if (pass.length < 8) { formError(form, "הסיסמה קצרה מדי: לפחות 8 תווים."); return ""; }
    if (weak(pass, state.me ? state.me.name : value("auth-name"))) { formError(form, "את הסיסמה הזו קל מדי לנחש. בחרו סיסמה אחרת."); return ""; }
    if (pass !== value(second || "auth-pass2")) { formError(form, "שתי הסיסמאות אינן זהות."); return ""; }
    return pass;
  }
  function ownerCode(body) { if (OWNER && value("owner-code")) { body.owner = value("owner-code"); } return body; }
  function splitTags(text) { return String(text).split(/[,،]/).map(function (tag) { return tag.trim(); }).filter(Boolean); }
  /** After something changed on the board: the same place again, without the loading line. */
  function again() { return show(true); }
  function idOf(el) { return Number(el.getAttribute("data-id")); }

  var forms = {
    login: function (form) {
      var who = value("auth-name"), pass = value("auth-pass");
      if (!who.trim() || !pass) { formError(form, "ממלאים שם משתמש וסיסמה."); return; }
      busy(form, function () {
        return api("POST", "/auth/salt", { name: who }).then(function (salt) {
          return deriveKey(pass, salt.salt, salt.iterations);
        }).then(function (key) { return api("POST", "/auth/login", { name: who, key: key }); }).then(signedIn);
      });
    },
    register: function (form) {
      var pass = newPassword(form), mail = value("auth-mail").trim();
      ui.authNotify = document.getElementById("auth-notify").checked;
      if (!pass) { return; }
      if (!mail) { formError(form, "כותבים כתובת מייל: נשלח אליה קוד אימות."); return; }
      busy(form, function () {
        return newKey(pass).then(function (made) {
          return askSignupCode(ownerCode({ name: value("auth-name"), mail: mail, salt: made.salt, key: made.key, website: value("auth-site") }));
        });
      });
    },
    "signup-code": function (form) {
      busy(form, function () {
        return api("POST", "/auth/register/verify", { ticket: ui.signup.ticket, code: value("signup-code"), notify: ui.authNotify }).then(function (data) {
          ui.signup = null;
          greet();
          return signedIn(data);
        });
      });
    },
    reset: function (form) {
      var pass = newPassword(form);
      if (!pass) { return; }
      busy(form, function () {
        return newKey(pass).then(function (made) {
          return api("POST", "/auth/reset", { name: value("auth-name"), code: value("auth-code"), salt: made.salt, key: made.key });
        }).then(signedIn);
      });
    },
    "google-name": function (form) {
      var keep = document.getElementById("g-keep");
      busy(form, function () {
        return api("POST", "/auth/google", ownerCode({ credential: ui.credential, name: value("g-name"), keepMail: !!(keep && keep.checked) }))
          .then(function (data) { greet(); return signedIn(data); });        // a new account through Google
      });
    },
    topic: function (form) {
      keepDraft();
      var draft = ui.draft, typedTag = value("tag-input").trim();
      var body = withShot({ kind: draft.kind, title: draft.title, body: draft.body, tags: draft.tags.concat(typedTag ? [typedTag] : []), mentions: mentionIds(draft.body) }, "compose");
      if (draft.poll) { body.poll = draft.poll; }
      busy(form, function () {
        return api("POST", "/topics", body).then(function (made) {
          ui.draft = blankDraft();
          ui.shots.compose = null;
          ui.modal = "";
          renderModal();
          toast(made.state === "held" ? "הנושא נשלח וממתין לאישור." : "הנושא פורסם.");
          if (location.hash === "#t=" + made.id) { return show(); }
          location.hash = "t=" + made.id;
        });
      });
    },
    reply: function (form) {
      if (!needLogin("כדי להגיב נרשמים או נכנסים.")) { return; }
      var text = value("reply-text");
      var body = withShot({ body: text, mentions: mentionIds(text) }, "reply");
      if (ui.quote) { body.quote = { post: ui.quote.post, text: ui.quote.marked }; }
      busy(form, function () {
        return api("POST", "/topics/" + idOf(form) + "/posts", body).then(function (made) {
          ui.reply = null;
          ui.quote = null;
          ui.shots.reply = null;
          ui.typedAt = 0;                          // no longer writing
          ui.liveUntil = Date.now() + 2 * MIN;
          toast(made.state === "held" ? "ההודעה נשלחה וממתינה לאישור." : "ההודעה פורסמה.");
          ui.route.post = made.id;                 // the page lands on what was just written
          return again().then(land);
        });
      });
    },
    edit: function (form) {
      var text = value("edit-text");
      var body = withShot({ body: text, mentions: mentionIds(text) }, "edit");
      if (document.getElementById("edit-title")) { body.title = value("edit-title"); body.tags = splitTags(value("edit-tags")); }
      busy(form, function () {
        return api("PUT", "/posts/" + idOf(form), body).then(function (out) {
          ui.editing = 0;
          ui.shots.edit = undefined;
          if (out.state === "held") { toast("ההודעה נשמרה וממתינה לאישור."); }
          return again();
        });
      });
    },
    search: function () {
      var text = value("search-text").trim();
      if (text) { location.hash = "q=" + encodeURIComponent(text); }
      else if (ui.view === "search") { location.hash = ui.listHash.slice(1); }
    },
    ask: function (form) {
      var question = ui.ask, values = {};
      (question.fields || []).forEach(function (f) { values[f.id] = value("ask-" + f.id); });
      busy(form, function () {
        return Promise.resolve(question.run(values, form)).then(function (keep) { if (keep !== true && ui.modal === "ask") { closeModal(); } });
      });
    },
    profile: function (form) {
      busy(form, function () {
        return api("POST", "/me/profile", { about: value("about"), signature: value("signature") }).then(function (out) {
          state.account.about = out.about;
          state.account.signature = out.signature;
          toast("הפרופיל נשמר.");
          form.querySelector("button.mb--filled").disabled = false;
        });
      });
    },
    mail: function (form) {
      busy(form, function () {
        return api("POST", "/me/mail", { address: value("mail-address") }).then(function (out) {
          ui.mailChange = false;
          state.account.pending = out.pending;
          render();
          if (out.code) { toast("מצב ניסיון, בלי מייל. הקוד: " + out.code); }      // only where the board has no mail set up
          var input = document.getElementById("mail-code");
          if (input) { input.focus(); }
        });
      });
    },
    "mail-code": function (form) {
      busy(form, function () {
        return api("POST", "/me/mail/verify", { code: value("mail-code") }).then(function (account) {
          state.account = account;
          state.me.mail = true;
          toast("הכתובת אומתה ונשמרה.");
          render();
        });
      });
    }
  };

  var acts = {
    auth: function (el) { openAuth(el.getAttribute("data-tab")); },
    "to-forum": function () { location.href = FORUM_PAGE || "forum.html"; },      // the welcome of a new account, on another page
    close: closeModal,
    backdrop: function (el, event) { if (event.target === el || event.target.classList.contains("lb-stage")) { closeModal(); } },
    bell: function (el) { openFloat("bell", el, bellPanel(), "notes"); },
    menu: function (el) { openFloat("menu", el, accountMenu()); },
    "notes-seen": function () {
      api("POST", "/me/notes", {}).then(function () {
        state.notes.forEach(function (note) { note.seen = true; });
        state.unseen = 0;
        closeFloat();
        renderUser();
      }, say);
    },
    "copy-code": function () {
      if (navigator.clipboard) { navigator.clipboard.writeText(ui.recovery).then(function () { toast("הקוד הועתק."); }, function () { toast("ההעתקה לא הצליחה. סמנו והעתיקו ידנית."); }); }
      else { toast("סמנו את הקוד והעתיקו אותו."); }
    },
    "signup-again": function () { askSignupCode(ui.signup.body).then(function () { toast("נשלח קוד חדש."); }, say); },
    "signup-back": function () {
      ui.authTab = "register"; ui.authName = ui.signup.body.name; ui.authMail = ui.signup.body.mail;
      ui.modal = "auth";
      renderModal();
    },
    "saved-code": function () {
      ui.recovery = "";
      ui.modal = "";
      renderModal();
      follow();
    },
    "reset-code": function () {
      var who = value("auth-name").trim();
      if (!who) { formError(document.querySelector('[data-form="reset"]'), "קודם כותבים את שם המשתמש, או את כתובת המייל שבחשבון."); return; }
      api("POST", "/auth/reset-code", { name: who }).then(function (out) {
        toast("אם לחשבון הזה יש כתובת מייל, נשלח אליה עכשיו קוד בן 6 ספרות.");
        if (out.code) { document.getElementById("auth-code").value = out.code; }       // only where the board has no mail set up
        document.getElementById("auth-code").focus();
      }, say);
    },
    logout: function () {
      closeFloat();
      pushOff().then(function () { return api("POST", "/auth/logout"); }).catch(function () { /* the session is dropped here anyway */ }).then(function () {
        signedOut();
        if (FORUM && ui.view !== "list" && ui.view !== "topic" && ui.view !== "user" && ui.view !== "search") { location.hash = ""; return null; }
        return show();
      });
    },
    "new": function (el) {
      if (!state.config) { return; }
      var kind = el.getAttribute("data-kind"), untouched = !ui.draft.title && !ui.draft.body;
      if (kind) { ui.draft.kind = kind; }
      else if (untouched && KINDS[ui.route.kind]) { ui.draft.kind = ui.route.kind; }
      if (untouched && ui.route.tag && !ui.draft.tags.length) { ui.draft.tags = [ui.route.tag]; }
      if (needLogin("כדי לפתוח נושא נרשמים או נכנסים.", "new")) { openCompose(); }
    },
    kind: function (el) {
      Array.prototype.forEach.call(el.parentNode.children, function (other) { other.setAttribute("aria-pressed", other === el); });
      var hints = HINTS[el.getAttribute("data-value")];
      document.getElementById("new-title-hint").textContent = hints[0];
      document.getElementById("new-text-hint").textContent = hints[1];
    },
    "tags-focus": function (el, event) { var input = document.getElementById("tag-input"); if (input && event.target === el) { input.focus(); } },
    "tag-add": function (el) { addTag(el.getAttribute("data-tag")); },
    "tag-remove": function (el) { ui.draft.tags.splice(Number(el.getAttribute("data-index")), 1); redrawPart("tags-box", tagsBox()); },
    "poll-toggle": function () {
      keepDraft();
      ui.draft.poll = ui.draft.poll ? null : { question: "", options: ["", ""], multi: false };
      redrawPart("poll-box", pollBox());
      var input = document.getElementById("poll-q");
      if (input) { input.focus(); }
    },
    "poll-more": function () {
      keepDraft();
      ui.draft.poll.options.push("");
      redrawPart("poll-box", pollBox());
      document.getElementById("poll-o" + (ui.draft.poll.options.length - 1)).focus();
    },
    "poll-less": function (el) {
      keepDraft();
      ui.draft.poll.options.splice(Number(el.getAttribute("data-index")), 1);
      redrawPart("poll-box", pollBox());
    },
    retry: function () { ui.view = "loading"; render(); boot(); },
    sort: function (el) {
      ui.sort = el.getAttribute("data-value");
      memory.sort = ui.sort;
      remember();
      again();
    },
    more: function (el) {
      el.disabled = true;
      api("GET", listPath(ui.route, state.list.next)).then(function (out) {       // `next`: pinned topics are not counted in a page
        out.topics.forEach(function (topic) { if (!state.list.topics.some(function (t) { return t.id === topic.id; })) { state.list.topics.push(topic); } });
        out.voted.forEach(function (id) { state.list.voted[id] = true; });
        state.list.more = out.more;
        state.list.next = out.next;
        render();
      }, function (error) { el.disabled = false; say(error); });
    },
    pill: function () { ui.fresh = ""; again().then(function () { if (ui.view === "topic") { land(); } else { jump(0); } }); },
    vote: function (el) {
      if (!needLogin("כדי לתמוך נרשמים או נכנסים.")) { return; }
      var id = idOf(el), wanted = el.getAttribute("aria-pressed") !== "true";
      api("POST", "/topics/" + id + "/vote", { on: wanted }).then(function (out) {
        if (state.list) {
          state.list.voted[id] = out.voted;
          state.list.topics.forEach(function (topic) { if (topic.id === id) { topic.votes = out.votes; } });
        }
        if (state.current && state.current.topic.id === id) { state.current.topic.votes = out.votes; state.current.voted = out.voted; }
        render();
        var same = document.querySelector('[data-act="vote"][data-id="' + id + '"]');
        if (same) { same.focus(); }
      }, say);
    },
    "topic-menu": function (el) { openFloat("topic", el, topicMenu()); },
    "post-menu": function (el) { openFloat("post:" + idOf(el), el, postMenu(postOf(idOf(el)))); },
    "watch-menu": function (el) { if (needLogin("כדי לעקוב אחרי נושא נרשמים או נכנסים.")) { openFloat("watch", el, watchMenu()); } },
    watch: function (el) {
      var level = Number(el.getAttribute("data-level"));
      api("POST", "/topics/" + state.current.topic.id + "/watch", { level: level }).then(function (out) {
        state.current.watch = out.watch;
        closeFloat();
        render();
        toast(level === 1 ? "הנושא במעקב." : level === 0 ? "הנושא יצא מהמעקב." : "הנושא הושתק.");
      }, say);
    },
    "react-menu": function (el) {
      var post = postOf(idOf(el)), mine = post.mine || [];
      openFloat("react:" + post.id, el, state.config.reactions.slice(1).map(function (emoji) {
        return '<button type="button" data-act="react" data-id="' + post.id + '" data-emoji="' + emoji + '" aria-pressed="' + (mine.indexOf(emoji) !== -1) + '">' + emoji + "</button>";
      }).join(""), "emojis");
    },
    react: function (el) {
      if (!needLogin("כדי לסמן הודעה נרשמים או נכנסים.")) { return; }
      var id = idOf(el), post = postOf(id), emoji = el.getAttribute("data-emoji");
      var wanted = (post.mine || []).indexOf(emoji) === -1;
      if (wanted && (post.mine || []).length >= state.config.limits.reactions) { closeFloat(); toast("אפשר לשים עד " + state.config.limits.reactions + " סימנים על הודעה."); return; }
      api("POST", "/posts/" + id + "/react", { emoji: emoji, on: wanted }).then(function (out) {
        post.reactions = out.reactions;
        post.mine = out.mine;
        closeFloat();
        redrawPost(id);
      }, say);
    },
    save: function (el) {
      if (!needLogin("כדי לשמור הודעה נרשמים או נכנסים.")) { return; }
      var id = idOf(el), post = postOf(id);
      api("POST", "/posts/" + id + "/save", { on: !post.saved }).then(function (out) {
        post.saved = out.saved;
        redrawPost(id);
        toast(out.saved ? "ההודעה נשמרה. היא ב״הודעות ששמרתי״." : "ההודעה הוסרה מהשמורות.");
      }, say);
    },
    unfold: function (el) { ui.shown[idOf(el)] = true; redrawPost(idOf(el)); },
    edit: function (el) {
      closeFloat();
      ui.editing = idOf(el);
      ui.shots.edit = undefined;
      render();
      var input = document.getElementById("edit-text");
      if (input) { input.focus(); input.scrollIntoView({ block: "center" }); }
    },
    "edit-cancel": function () { ui.editing = 0; ui.shots.edit = undefined; render(); },
    quote: function (el) {
      if (!needLogin("כדי להגיב נרשמים או נכנסים.")) { return; }
      var id = idOf(el), post = postOf(id);
      var words = el.closest(".post").querySelector(".rt"), chosen = window.getSelection ? window.getSelection() : null, marked = "";
      if (chosen && !chosen.isCollapsed && words && words.contains(chosen.anchorNode) && words.contains(chosen.focusNode)) { marked = String(chosen); }
      // what is shown here is cut like the board will cut it; what is sent is the words as marked ("" = the whole message)
      var flat = (marked || window.BoardText.plain(post.body)).replace(/\s+/g, " ").trim(), chars = Array.from(flat), max = state.config.limits.quote;
      ui.quote = { topic: state.current.topic.id, post: id, name: post.author.name, marked: marked,
        text: chars.length > max ? chars.slice(0, max).join("") + "…" : flat };
      var slot = document.getElementById("quote-slot"), input = document.getElementById("reply-text");
      if (!slot || !input) { return; }
      slot.innerHTML = quoteSlot();
      input.focus();
    },
    "reply-open": function () { needLogin("כדי להגיב נרשמים או נכנסים."); },      // the bar of a visitor
    format: function (el) {                           // the "A" of the reply bar: the tools of the text
      var row = document.getElementById(el.getAttribute("aria-controls")), on = row.hidden;
      row.hidden = !on;
      el.setAttribute("aria-pressed", on);
    },
    unquote: function () { ui.quote = null; document.getElementById("quote-slot").innerHTML = ""; },
    "goto": function (el) {
      var target = document.getElementById("p" + idOf(el));
      if (!target) { return; }
      target.scrollIntoView({ block: "center" });
      flash(target);
    },
    zoom: function (el) { ui.zoom = el.getAttribute("data-key"); ui.modal = "zoom"; renderModal(); },
    detach: function (el) { var where = el.getAttribute("data-where"); ui.shots[where] = null; redrawAttach(where); dockReady(); },
    "copy-link": function (el) {
      var id = idOf(el), link = location.href.split("#")[0] + "#t=" + state.current.topic.id + (id ? "&p=" + id : "");
      closeFloat();
      if (navigator.clipboard) { navigator.clipboard.writeText(link).then(function () { toast("הקישור הועתק."); }, function () { toast(link); }); }
      else { toast(link); }
    },
    history: function (el) {
      closeFloat();
      api("GET", "/posts/" + idOf(el) + "/edits").then(function (out) { ui.history = out.edits; ui.modal = "history"; renderModal(); }, say);
    },
    "delete": function (el) {
      var id = idOf(el), post = postOf(id);
      ask({
        icon: "delete", title: post.first ? "למחוק את הנושא כולו?" : "למחוק את ההודעה?", ok: "מחיקה", danger: true,
        text: post.first ? "הנושא וכל ההודעות שבו יימחקו. אי אפשר לבטל את זה." : "ההודעה תימחק. אי אפשר לבטל את זה.",
        run: function () {
          return api("DELETE", "/posts/" + id).then(function () {
            toast(post.first ? "הנושא נמחק." : "ההודעה נמחקה.");
            if (post.first) { location.hash = ui.listHash.slice(1); return null; }
            return again();
          });
        }
      });
    },
    report: function (el) {
      closeFloat();
      api("POST", "/posts/" + idOf(el) + "/report").then(function () { toast("תודה, הדיווח נשלח."); }, say);
    },
    "post-state": function (el) {
      closeFloat();
      api("POST", "/admin/posts/" + idOf(el), { state: el.getAttribute("data-state") }).then(again, say);
    },
    answer: function (el) {
      closeFloat();
      api("POST", "/topics/" + state.current.topic.id + "/answer", { post: el.getAttribute("data-on") ? idOf(el) : 0 }).then(again, say);
    },
    poll: function (el) {
      if (!needLogin("כדי להצביע בסקר נרשמים או נכנסים.")) { return; }
      var poll = state.current.poll, id = idOf(el);
      var chosen = poll.options.filter(function (option) { return option.mine; }).map(function (option) { return option.id; });
      var had = chosen.indexOf(id) !== -1;
      chosen = poll.multi ? (had ? chosen.filter(function (other) { return other !== id; }) : chosen.concat([id])) : had ? [] : [id];
      api("POST", "/topics/" + state.current.topic.id + "/poll", { options: chosen }).then(function (out) {
        state.current.poll = out.poll;
        redrawPost(state.current.posts[0].id);
      }, say);
    },
    "poll-admin": function (el) {
      closeFloat();
      api("POST", "/admin/topics/" + idOf(el), { poll: el.getAttribute("data-op") }).then(again, say);
    },
    "flag-topic": function (el) {
      var body = {};
      body[el.getAttribute("data-field")] = !!el.getAttribute("data-on");
      closeFloat();
      api("POST", "/admin/topics/" + idOf(el), body).then(again, say);
    },
    status: function (el) {
      var topic = state.current.topic;
      ask({
        title: "סטטוס הנושא", ok: "שמירה",
        fields: [{ id: "status", label: "סטטוס", type: "select", value: topic.status,
          options: state.config.statuses[topic.kind].map(function (status) { return [status, STATUS[status] || "בלי סטטוס"]; }) }],
        run: function (values) { return api("POST", "/admin/topics/" + idOf(el), { status: values.status }).then(again); }
      });
    },
    move: function (el) {
      ask({
        title: "סוג הנושא", ok: "שמירה", text: "סטטוס שלא מתאים לסוג החדש יוסר.",
        fields: [{ id: "kind", label: "סוג", type: "select", value: state.current.topic.kind, options: Object.keys(KINDS).map(function (kind) { return [kind, KINDS[kind]]; }) }],
        run: function (values) { return api("POST", "/admin/topics/" + idOf(el), { kind: values.kind }).then(again); }
      });
    },
    retag: function (el) {
      ask({
        title: "תגיות הנושא", ok: "שמירה",
        fields: [{ id: "tags", label: "תגיות, מופרדות בפסיקים", value: state.current.topic.tags.join(", "), hint: "עד " + state.config.limits.tags + " תגיות." }],
        run: function (values) { return api("POST", "/admin/topics/" + idOf(el), { tags: splitTags(values.tags) }).then(again); }
      });
    },
    merge: function (el) {
      ask({
        icon: "call-merge", title: "מיזוג לתוך נושא אחר", ok: "מיזוג", danger: true,
        text: "כל ההודעות של הנושא הזה יעברו לנושא האחר, לפי סדר הכתיבה. אי אפשר לבטל את זה.",
        fields: [{ id: "into", label: "מספר הנושא האחר", type: "number", hint: "המספר שאחרי t= בכתובת של הנושא האחר.", attrs: 'dir="ltr" min="1"' }],
        run: function (values) {
          return api("POST", "/admin/topics/" + idOf(el) + "/merge", { into: Number(values.into) }).then(function (out) { location.hash = "t=" + out.into; });
        }
      });
    },
    split: function (el) {
      ask({
        icon: "call-split", title: "פיצול לנושא חדש", ok: "פיצול",
        text: "ההודעה הזו וכל מה שנכתב אחריה יעברו לנושא חדש.",
        fields: [{ id: "title", label: "כותרת הנושא החדש", max: state.config.limits.title },
          { id: "kind", label: "סוג", type: "select", value: state.current.topic.kind, options: Object.keys(KINDS).map(function (kind) { return [kind, KINDS[kind]]; }) }],
        run: function (values) {
          return api("POST", "/admin/posts/" + idOf(el) + "/split", { title: values.title, kind: values.kind }).then(function (out) { location.hash = "t=" + out.id; });
        }
      });
    },
    relate: function (el) {
      if (!needLogin("כדי לעקוב אחרי משתמש נרשמים או נכנסים.")) { return; }
      var id = idOf(el), kind = Number(el.getAttribute("data-kind"));
      api("POST", "/users/" + id + "/relation", { kind: kind }).then(function (out) {
        delete state.follows[id];
        delete state.ignores[id];
        if (out.relation === 1) { state.follows[id] = true; }
        if (out.relation === -1) { state.ignores[id] = true; }
        toast(out.relation === 1 ? "תקבלו התראה כשהמשתמש יפתח נושא." : out.relation === -1 ? "ההודעות שלו יוצגו מקופלות, והוא לא יפעיל אצלכם התראות." : "בוטל.");
        return again();
      }, say);
    },
    ban: function (el) {
      var id = idOf(el);
      if (!el.getAttribute("data-on")) { api("POST", "/admin/users/" + id, { banned: false }).then(function () { toast("החסימה בוטלה."); return again(); }, say); return; }
      ask({
        icon: "block", title: "חסימת המשתמש", ok: "חסימה", danger: true, text: "משתמש חסום מנותק מהפורום ולא יכול להיכנס אליו עד שהחסימה מסתיימת.",
        fields: [{ id: "days", label: "לכמה זמן", type: "select", value: "7", options: [["1", "יום אחד"], ["7", "שבוע"], ["30", "חודש"], ["forever", "לצמיתות"]] }],
        run: function (values) {
          return api("POST", "/admin/users/" + id, { banned: values.days === "forever" ? true : Number(values.days) }).then(function () { toast("המשתמש נחסם."); return again(); });
        }
      });
    },
    role: function (el) {
      var id = idOf(el), role = el.getAttribute("data-role");
      function set() {
        return api("POST", "/admin/users/" + id, { role: role }).then(function (out) {
          toast(out.role === "mod" ? "המשתמש מונה למנהל." : "המינוי בוטל.");
          return again();
        });
      }
      if (role !== "mod") { set().catch(say); return; }
      ask({             // what a moderator is, before one is made
        icon: "shield-person", title: "למנות את " + name(state.profile.user.name) + " למנהל?", ok: "מינוי",
        text: "מנהל עוזר לשמור על הפורום: הוא רואה את ההודעות שממתינות לאישור ואת הדיווחים, ויכול להסתיר הודעות, לנעול ולנעוץ נושאים, לסמן סטטוס ולחסום משתמשים. " +
          "במה שיוצר מובידוס כתב הוא לא יכול לגעת. את המינוי אפשר לבטל בכל רגע.",
        run: set
      });
    },
    badge: function (el) {
      ask({
        title: "תואר ליד השם", ok: "שמירה", text: "כמה מילים שיופיעו ליד השם של המשתמש בכל הודעה שלו. שדה ריק מסיר את התואר.",
        fields: [{ id: "badge", label: "תואר", max: state.config.limits.badge, value: state.profile.user.badge || "" }],
        run: function (values) { return api("POST", "/admin/users/" + idOf(el), { badge: values.badge }).then(again); }
      });
    },
    "avatar-wipe": function (el) {
      api("DELETE", "/admin/avatars/" + idOf(el)).then(function () { toast("תמונת הפרופיל הוסרה."); return again(); }, say);
    },
    "report-done": function (el) { api("POST", "/admin/reports/" + idOf(el), {}).then(again, say); },
    "avatar-review": function (el) { api("POST", "/admin/avatars/" + idOf(el), { ok: !!el.getAttribute("data-ok") }).then(again, say); },
    "mail-test": function (el) {
      el.disabled = true;
      ui.mailTest = "שולח מייל ניסיון…";
      render();
      api("POST", "/admin/mail-test", {}).then(function (out) {
        ui.mailTest = out.ok ? "מייל הניסיון נשלח. הוא אמור להגיע לתיבה בתוך דקה." : "השליחה נכשלה: " + (out.error || "");
      }, function (error) { ui.mailTest = explain(error); }).then(function () { if (ui.view === "admin") { render(); } });
    },
    "avatar-remove": function () {
      api("DELETE", "/me/avatar").then(function () { ui.ownAvatar = {}; toast("התמונה הוסרה."); return refreshMe(); }).then(render).catch(say);
    },
    tool: function (el) {
      var input = document.getElementById(el.getAttribute("data-for")), tool = tools[el.getAttribute("data-tool")];
      if (input && tool) { tool(input, el); }
    },
    "emoji-pick": function (el) {
      var input = document.getElementById(el.getAttribute("data-for")), emoji = el.getAttribute("data-emoji");
      closeFloat();
      if (input) { typedInto(input, emoji, input.selectionStart, input.selectionEnd, input.selectionStart + emoji.length, input.selectionStart + emoji.length); }
    },
    "mention-pick": function (el) {
      var input = document.getElementById(el.getAttribute("data-for")), who = el.getAttribute("data-name");
      var before = input.value.slice(0, input.selectionStart), at = before.lastIndexOf("@");
      if (at === -1) { return; }
      ui.picked[who.toLowerCase()] = { id: idOf(el), name: who };
      typedInto(input, "@" + who + " ", at, input.selectionStart, at + who.length + 2, at + who.length + 2);
    },
    preview: function (el) {
      var id = el.getAttribute("data-for"), input = document.getElementById(id), box = document.getElementById(id + "-preview");
      var on = el.getAttribute("data-on") !== "1";
      el.setAttribute("data-on", on ? "1" : "");
      el.innerHTML = icon(on ? "edit" : "visibility") + (on ? "חזרה לכתיבה" : "תצוגה מקדימה");      // the button says what a press will do
      box.hidden = !on;
      input.closest(".writer__field").hidden = on;    // the field itself steps aside for what it will look like
      if (on) { box.innerHTML = window.BoardText.render(input.value, { mentions: known() }); } else { fit(input); input.focus(); }
    },
    "mail-remove": function () {
      ask({
        icon: "mail", title: "להסיר את כתובת המייל?", ok: "הסרה", danger: true,
        text: "לא יישלחו אליכם עוד מיילים, ואי אפשר יהיה לאפס דרכה סיסמה שנשכחה.",
        run: function () { return api("DELETE", "/me/mail").then(function (account) { state.account = account; state.me.mail = false; render(); }); }
      });
    },
    "mail-cancel": function () { api("DELETE", "/me/mail").then(function (account) { state.account = account; render(); }, say); },
    "google-mail": function () { ui.googleFor = "mail"; ui.modal = "google-mail"; renderModal(); },
    "pref-notify": function () { savePrefs({ notify: !state.account.notify }); },
    "pref-digest": function () { savePrefs({ digest: !state.account.digest }); },
    "pref-unseen": function () { savePrefs({ unseen: !state.account.unseen }); },
    "mail-kind": function (el) { savePrefs({ off: (state.account.off || 0) ^ Number(el.getAttribute("data-bit")) }); },
    "owner-mail": function (el) { savePrefs({ ownerOff: (state.account.ownerOff || 0) ^ Number(el.getAttribute("data-bit")) }); },
    "mail-change": function () { ui.mailChange = true; render(); },
    "mail-keep": function () { ui.mailChange = false; render(); },
    push: function (el) {
      el.disabled = true;
      (ui.pushOn ? pushOff() : pushOn()).then(function () {
        ui.pushOn = !ui.pushOn;
        toast(ui.pushOn ? "ההתראות הופעלו בדפדפן הזה." : "ההתראות כובו בדפדפן הזה.");
      }, function (error) {
        toast(error && error.code === "denied" ? "הדפדפן לא מרשה לאתר הזה להציג התראות." : "לא הצלחנו להפעיל התראות בדפדפן הזה.");
      }).then(render);
    },
    password: function () {
      ask({
        icon: "password", title: "שינוי סיסמה", ok: "שינוי הסיסמה", text: "בשאר המכשירים והדפדפנים יהיה צריך להיכנס מחדש.",
        fields: [{ id: "old", label: "הסיסמה הנוכחית", type: "password", attrs: 'autocomplete="current-password"' },
          { id: "pass", label: "סיסמה חדשה", type: "password", hint: "לפחות 8 תווים.", attrs: 'autocomplete="new-password"' },
          { id: "pass2", label: "הסיסמה החדשה שוב", type: "password", attrs: 'autocomplete="new-password"' }],
        run: function (values, form) {
          if (!newPassword(form, "ask-pass", "ask-pass2")) { return Promise.reject(SAID); }
          return Promise.all([currentKey(values.old), newKey(values.pass)]).then(function (keys) {
            return api("POST", "/me/password", { key: keys[0], newSalt: keys[1].salt, newKey: keys[1].key });
          }).then(function () { toast("הסיסמה שונתה."); return again(); });
        }
      });
    },
    "recovery-new": function () {
      ask({
        icon: "key", title: "קוד שחזור חדש", ok: "קוד חדש", text: "הקוד הקודם יפסיק לפעול.",
        fields: [{ id: "old", label: "הסיסמה הנוכחית", type: "password", attrs: 'autocomplete="current-password"' }],
        run: function (values) {
          return currentKey(values.old).then(function (key) { return api("POST", "/me/recovery", { key: key }); }).then(function (out) {
            ui.recovery = out.recovery;
            ui.modal = "recovery";
            renderModal();
            return true;                              // the dialog was replaced by the one that shows the code
          });
        }
      });
    },
    "sessions-clear": function () {
      api("POST", "/me/sessions", {}).then(function (out) { toast(count(out.ended, "מכשיר אחד נותק.", "מכשירים נותקו.", "לא היו מכשירים אחרים.")); return again(); }, say);
    },
    "delete-account": function () {
      var me = state.me;
      ask({
        icon: "delete-forever", title: "למחוק את החשבון?", ok: "מחיקת החשבון", danger: true,
        text: "השם, התמונה, כתובת המייל וההגדרות יימחקו, והשם לא יהיה פנוי לאחרים. ההודעות שכתבתם יישארו בפורום בלי השם שלכם. אי אפשר לבטל את זה.",
        fields: [me.password ? { id: "old", label: "הסיסמה שלכם", type: "password", attrs: 'autocomplete="current-password"' }
          : { id: "name", label: "שם המשתמש שלכם, לאישור", attrs: 'autocomplete="off"' }],
        run: function (values) {
          var proof = me.password ? currentKey(values.old).then(function (key) { return { key: key }; }) : Promise.resolve({ name: values.name });
          return proof.then(function (body) { return api("POST", "/me/delete", body); }).then(function () {
            signedOut();
            toast("החשבון נמחק.");
            location.hash = "";
          });
        }
      });
    }
  };

  var changes = {
    attach: function (el) {
      var file = el.files && el.files[0];
      if (file) { attach(el.getAttribute("data-where"), file); }
      el.value = "";
    },
    avatar: function (el) {
      var file = el.files && el.files[0];
      if (!file) { return; }
      squareJpeg(file).then(function (data) {
        return api("POST", "/me/avatar", { data: data }).then(function (out) {
          toast(out.pending ? "התמונה נשלחה. היא תוצג לאחרים אחרי אישור." : "התמונה עודכנה.");
          return Promise.all([api("GET", "/me/avatar"), refreshMe()]);
        });
      }).then(function (results) {
        ui.ownAvatar = results[0];
        render();
      }).catch(say);
    }
  };

  /* ---------- what the page listens to ---------- */
  /** The address changed (or was pressed again): what was read is kept, the new place is loaded, and the page stands where it should. */
  function moved() {
    var wasList = ui.view === "list";
    if (wasList) { ui.listScroll = window.pageYOffset; }
    ui.editing = 0;
    ui.fresh = "";
    closeFloat();
    closeModal();                                             // the recovery code stays until it is acknowledged
    return saveRead().then(function () { return show(); }).then(function () {    // the list that comes next already counts what was read
      if (ui.view === "topic") { land(); } else { jump(ui.view === "list" && !wasList ? ui.listScroll : 0); }
    });
  }
  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-act]");
    var act = el && el.getAttribute("data-act");
    if (ui.float && !event.target.closest(".float") && !(el && ui.float.anchor === el)) { closeFloat(); }      // a click elsewhere closes the menu
    if (act && acts[act]) { acts[act](el, event); return; }
    var link = event.target.closest("a[href^='#']");
    if (link) {
      closeFloat();
      if (FORUM && link.getAttribute("href") === (location.hash || "#")) { event.preventDefault(); moved(); }      // the place one is already at: again
    }
  });
  document.addEventListener("change", function (event) {
    var kind = event.target.getAttribute && event.target.getAttribute("data-change");
    if (kind && changes[kind]) { changes[kind](event.target); }
  });
  document.addEventListener("input", function (event) {
    var input = event.target;
    if (input.id === "reply-text" && state.current) { ui.reply = { id: state.current.topic.id, text: input.value }; }      // a reply being written survives a redraw of the topic
    if (input.id === "reply-text") {
      dockReady();
      var began = Date.now() - ui.typedAt > 8000;       // the first key after a rest: the others are told at once
      ui.typedAt = Date.now();
      ui.liveUntil = ui.typedAt + 2 * MIN;
      if (began && state.me) { pulse(); }
    }
    if (input.tagName === "TEXTAREA") { fit(input); }
    if (input.hasAttribute && input.hasAttribute("data-mentions")) { suggest(input); }
    if (input.id === "tag-input" && /[,،]/.test(input.value)) { addTag(input.value.replace(/[,،]/g, "")); }
  });
  document.addEventListener("paste", function (event) {      // a picture pasted into a message is attached to it
    var where = { "reply-text": "reply", "new-text": "compose", "new-title": "compose", "edit-text": "edit" }[event.target.id];
    var files = (event.clipboardData && event.clipboardData.files) || [];
    var file = where && Array.prototype.filter.call(files, function (item) { return /^image\//.test(item.type); })[0];
    if (file) { event.preventDefault(); attach(where, file); }
  });
  var scrolling = 0;
  window.addEventListener("scroll", function () {            // reading on: the point reached moves with the screen
    ui.active = Date.now();
    closeFloat();
    clearTimeout(scrolling);
    scrolling = setTimeout(reached, 150);
  }, { passive: true });
  window.addEventListener("resize", function () { closeFloat(); });
  document.addEventListener("submit", function (event) {
    var kind = event.target.getAttribute("data-form");
    if (!kind || !forms[kind]) { return; }
    event.preventDefault();
    forms[kind](event.target);
  });
  document.addEventListener("keydown", function (event) {
    ui.active = Date.now();
    var target = event.target;
    if (event.key === "Escape") {
      if (ui.float) { closeFloat(true); }
      else if (ui.modal) { closeModal(); }
      return;
    }
    if (target.id === "reply-text" && event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); forms.reply(target.form); return; }
    if (target.id === "tag-input") {
      if (event.key === "Enter") { event.preventDefault(); if (target.value.trim()) { addTag(target.value); } return; }      // a tag, not the whole form
      if (event.key === "Backspace" && !target.value && ui.draft.tags.length) { ui.draft.tags.pop(); redrawPart("tags-box", tagsBox()); document.getElementById("tag-input").focus(); return; }
    }
    if (ui.float && (event.key === "ArrowDown" || event.key === "ArrowUp")) {      // the arrows walk a menu
      var items = Array.prototype.slice.call(document.querySelectorAll(".float a, .float button"));
      var at = items.indexOf(document.activeElement), next = items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length];
      if (next) { event.preventDefault(); next.focus(); }
      return;
    }
    if (event.key !== "Tab" || !ui.modal) { return; }
    var box = document.querySelector(".dialog__box");      // Tab stays inside the open dialog
    if (!box) { return; }
    var stops = Array.prototype.filter.call(box.querySelectorAll("a[href], button, input, textarea, select, iframe"), function (node) {
      return !node.disabled && node.tabIndex !== -1 && node.offsetParent !== null;
    });
    if (!stops.length) { return; }
    var first = stops[0], last = stops[stops.length - 1];
    if (!box.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  /** The ink of a press (Material's ripple): a circle that grows from where a control was touched, and fades when it is let go. */
  var INK = ".mb, .ib, .fab, .chip:not(.chip--plain), .navitem, .menu__item, .item--link, .seg__b, .tab, .poll__opt, .watchrow, .replybar, .dock__send, .react, .trow";
  var STILL = !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ink(event) {
    var host = event.target.closest ? event.target.closest(INK) : null;
    if (STILL || !host || host.disabled || event.button > 0) { return; }
    var box = host.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
    var reach = Math.sqrt(Math.pow(Math.max(x, box.width - x), 2) + Math.pow(Math.max(y, box.height - y), 2));
    var drop = document.createElement("span"), born = Date.now();
    drop.className = "ink";
    drop.style.cssText = "width:" + 2 * reach + "px;height:" + 2 * reach + "px;left:" + (x - reach) + "px;top:" + (y - reach) + "px";
    host.appendChild(drop);
    function letGo() {
      window.removeEventListener("pointerup", letGo);
      window.removeEventListener("pointercancel", letGo);
      setTimeout(function () {                                  // a quick tap still shows its ink
        drop.classList.add("ink--out");
        setTimeout(function () { if (drop.parentNode) { drop.parentNode.removeChild(drop); } }, 400);
      }, Math.max(0, 220 - (Date.now() - born)));
    }
    window.addEventListener("pointerup", letGo);
    window.addEventListener("pointercancel", letGo);
  }
  document.addEventListener("pointerdown", function (event) { ui.active = Date.now(); ink(event); }, { passive: true });
  if (FORUM) { window.addEventListener("hashchange", moved); }      // on the site's other pages the address is theirs
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { saveRead(true); return; }           // leaving the tab: how far he got is kept
    var typing = document.activeElement && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName);
    // back after a while: bring what is new - but not over a page of forms, where something may be half typed
    if (!typing && !ui.editing && !ui.modal && !ui.float && ui.view !== "account" && Date.now() - ui.loaded > MIN) { again(); }
  });

  /** Once a minute, while the page is in front and in use: is there something new? The bell, and the place that is open. */
  function pulse() {
    if (document.hidden || !state.config || ui.modal || Date.now() - ui.active > 30 * MIN) { return; }
    if (["list", "topic", "search", "saved", "user", "account", "admin", "home"].indexOf(ui.view) === -1) { return; }
    if (ui.view === "home" && !state.me) { return; }          // another page of the site: only the bell, which a visitor has not
    var path = "/pulse";
    if (ui.view === "topic" && state.current) {
      var posts = state.current.posts;
      path += "?t=" + state.current.topic.id + "&at=" + (posts.length ? posts[posts.length - 1].created : 0) +
        (Date.now() - ui.typedAt < 8000 ? "&typing=1" : "");
    }
    var asked = ui.view === "topic" && state.current ? state.current.topic.id : 0;
    api("GET", path).then(function (out) {
      if (state.me && (out.unseen !== state.unseen || (out.waiting !== undefined && out.waiting !== state.waiting))) {
        refreshMe().then(function () { if (!ui.float) { renderUser(); } });
      }
      if (asked && ui.view === "topic" && state.current && state.current.topic.id === asked) {
        state.here = out.here || [];
        state.typing = out.typing || [];
        if (state.typing.length || out.fresh) { ui.liveUntil = Date.now() + 2 * MIN; }      // somebody writes, or just wrote: stay close
        redrawPart("here-slot", hereView());
        redrawPart("typing-slot", typingView());
      }
      var fresh = "";
      if (out.fresh) { fresh = count(out.fresh, "הודעה חדשה בנושא", "הודעות חדשות בנושא"); }
      else if (ui.view === "list" && state.list && out.latest > state.list.latest && !ui.route.filter && !ui.route.tag && window.pageYOffset < 200) { fresh = "יש חדש בפורום"; }
      if (fresh !== ui.fresh) { ui.fresh = fresh; renderPill(); }
    }, function () { /* the next minute */ });
  }
  setInterval(pulse, MIN);
  setInterval(function () { if (ui.view === "topic" && Date.now() < ui.liveUntil) { pulse(); } }, 10000);

  function boot() {
    if (!FORUM) {                     // another page of the site: a member's bell and menu; a visitor costs the board nothing
      ui.view = "home";
      if (!store.get(TOKEN)) { return; }              // the "כניסה" of the page's markup stays as it is
      configure().then(refreshMe).then(renderUser, renderUser);
      return;
    }
    if (API == null) { ui.view = "failed"; ui.failure = { code: "not_configured" }; state.config = null; render(); return; }
    if (!window.crypto || !crypto.subtle) { ui.view = "failed"; ui.failure = { code: "server" }; render(); return; }
    configure().then(refreshMe).then(function () { return show(); }, function (error) { ui.view = "failed"; ui.failure = error; render(); })
      .then(function () { if (ui.view === "topic") { land(); } });
  }
  boot();
  // site.js loads this script on the site's other pages when "כניסה" is pressed there, and then opens it through this
  window.MoovidosBoard = { auth: function (tab) { openAuth(tab); } };
})();
