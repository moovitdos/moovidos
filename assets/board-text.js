/* The text of a message as markup: paragraphs, lists, quoted lines, code, bold and italic, links and mentions,
   and spoilers - words covered until a press (||words||), or a block that opens (a line of || above and below).
   A message is kept on the board as the plain text its writer typed; this is the only place where it becomes
   HTML, and every character of it passes through esc() exactly once. The only tags that come out are the ones
   written here; the only addresses that become links begin with http:// or https://.
   No document and no network: test/text.test.js runs this file under node, and the Worker itself imports it
   (src/rules.js) for the plain words of a message - one source for both sides. ES2017 only, like board.js. */
(function (root) {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // a character that belongs to a word (Latin, Greek, Cyrillic, Hebrew, Arabic, digits): what an "@name" may not touch
  var WORD = /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-׿؀-ۿ]/;

  /** An address as it was meant. A scheme that stands twice - "https://https://…", an address pasted after the
   *  "https://" the link tool leaves ready, or "https://https//…", what a browser's address bar makes of that -
   *  is one scheme: as written, such a link leads to a site called "https". */
  function address(url) {
    return url.replace(/^(?:https?:\/\/)+(?=https?:\/\/)/i, "").replace(/^https?:\/\/(https?)\/\/(?=[^\/])/i, "$1://");
  }
  /** A link. One into the forum itself (`home`: the address of the page that shows the message, without its "#")
   *  stays in the page - the place after the "#" is opened there; any other opens apart and is never trusted. */
  function link(url, words, home) {
    url = address(url);
    var shown = words != null ? words : url.length > 64 ? url.slice(0, 48) + "…" : url;
    var cut = url.indexOf("#");
    if (home && cut !== -1 && url.slice(0, cut) === home) { return '<a class="inlink" href="' + esc(url.slice(cut)) + '">' + esc(shown) + "</a>"; }
    return '<a class="ext" href="' + esc(url) + '" target="_blank" rel="nofollow noopener noreferrer ugc">' + esc(shown) + "</a>";
  }

  /** The words of one line as markup. mentions: [{ id, name }] - the users the board confirmed the message mentions.
   *  home: the forum's own address (see link). */
  function inline(text, mentions, home) {
    var kept = [];                                  // markup that is ready: set aside, so that no later rule looks inside it
    function keep(html) { kept.push(html); return "\u0000" + (kept.length - 1) + "\u0000"; }
    var out = String(text);
    out = out.replace(/`([^`\n]+)`/g, function (all, code) { return keep("<code>" + esc(code) + "</code>"); });
    // (a link never reaches into markup that is already set aside: \u0000 ends its words and its address)
    // (a "|" ends an address too: it is no part of one as typed - it is written %7C - and "||" closes a spoiler)
    out = out.replace(/\[([^\]\n\u0000]{1,200})\]\((https?:\/\/[^\s()<>"'|\u0000]{1,600})\)/g, function (all, words, url) { return keep(link(url, words, home)); });
    out = out.replace(/(^|[^0-9A-Za-z@\/.])((?:https?:\/\/|www\.)[^\s<>"'|\u0000]{2,600})/g, function (all, before, url) {
      var tail = "";                                // the full stop or bracket after an address is not part of it
      while (/[.,;:!?)\]״׳]$/.test(url) && !(url.slice(-1) === ")" && url.indexOf("(") !== -1)) { tail = url.slice(-1) + tail; url = url.slice(0, -1); }
      return before + keep(link(/^www\./.test(url) ? "https://" + url : url, /^www\./.test(url) ? url : null, home)) + tail;
    });
    (mentions || []).slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (person) {
      var needle = ("@" + person.name).toLowerCase(), result = "", last = 0, at = out.indexOf("@");
      while (at !== -1) {
        var found = out.substr(at, needle.length);
        if (found.toLowerCase() === needle && !WORD.test(at ? out.charAt(at - 1) : "") && !WORD.test(out.charAt(at + needle.length))) {
          result += out.slice(last, at) + keep('<a class="mention" href="#u=' + Number(person.id) + '">' + esc(found) + "</a>");
          last = at + needle.length;
          at = out.indexOf("@", last);
        } else {
          at = out.indexOf("@", at + 1);
        }
      }
      out = result + out.slice(last);
    });
    out = esc(out);                                 // whatever is still plain text
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[\s(>])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?=$|[\s.,;:!?)<])/g, "$1<em>$2</em>");
    // a spoiler inside a line: a button that says "ספוילר" until a press shows the words (board.js opens it; the
    // page's own script, so no script here - the button's look, its eye and its word are board.css)
    out = out.replace(SPOILER_INLINE, '<span class="spoiler" role="button" tabindex="0" aria-expanded="false" aria-label="ספוילר, לחיצה מציגה" data-act="spoiler"><span class="spoiler__text">$1</span></span>');
    return out.replace(/\u0000(\d+)\u0000/g, function (all, index) { return kept[Number(index)] || ""; });
  }

  var BULLET = /^\s{0,3}[-*•]\s+(?=\S)/, NUMBER = /^\s{0,3}(\d{1,3})[.)]\s+(?=\S)/, QUOTED = /^\s{0,3}>\s?/, FENCE = /^\s{0,3}```/;
  // a spoiler block: a line of "||" - alone, or with a title after it - opens it, the next line of "||" alone closes it
  var SPOILER_OPEN = /^\s{0,3}\|\|(?:\s+([^|]*\S))?\s*$/, SPOILER_CLOSE = /^\s{0,3}\|\|\s*$/, SPOILER_INLINE = /\|\|([^|\n]+?)\|\|/g;
  var VEIL = "[ספוילר]";                           // what stands for a spoiler where the message is read from outside

  /** A whole message as markup. options.mentions: [{ id, name }]; options.home: the forum's own address, without
   *  its "#" - a link there stays in the page. */
  function render(text, options) {
    var mentions = options && options.mentions, home = options && options.home;
    var lines = String(text == null ? "" : text).replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n");
    var html = [], i = 0;
    function kind(line) {
      return FENCE.test(line) ? "fence" : SPOILER_OPEN.test(line) ? "spoiler" : BULLET.test(line) ? "bullet" : NUMBER.test(line) ? "number" : QUOTED.test(line) ? "quote" : line.trim() ? "text" : "";
    }
    while (i < lines.length) {
      var what = kind(lines[i]), group = [];
      if (!what) { i++; continue; }
      if (what === "fence") {
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) { group.push(lines[i++]); }
        i++;                                        // the closing fence, or the end of the message
        html.push('<pre class="code" dir="ltr"><code>' + esc(group.join("\n")) + "</code></pre>");
        continue;
      }
      if (what === "spoiler") {                     // a block that opens on a press: whatever is inside, as a message of its own
        var title = SPOILER_OPEN.exec(lines[i])[1] || "";
        i++;
        while (i < lines.length && !SPOILER_CLOSE.test(lines[i])) { group.push(lines[i++]); }
        i++;
        html.push('<details class="spoiler"><summary>' + (title ? esc(title) : "ספוילר") + '</summary><div class="spoiler__body">' + render(group.join("\n"), options) + "</div></details>");
        continue;
      }
      while (i < lines.length && kind(lines[i]) === what) { group.push(lines[i++]); }
      if (what === "bullet") {
        html.push("<ul>" + group.map(function (line) { return "<li>" + inline(line.replace(BULLET, ""), mentions, home) + "</li>"; }).join("") + "</ul>");
      } else if (what === "number") {               // each item keeps the number its writer gave it
        html.push("<ol>" + group.map(function (line) {
          return '<li value="' + Number(NUMBER.exec(line)[1]) + '">' + inline(line.replace(NUMBER, ""), mentions, home) + "</li>";
        }).join("") + "</ol>");
      } else if (what === "quote") {
        html.push("<blockquote>" + group.map(function (line) { return inline(line.replace(QUOTED, ""), mentions, home); }).join("<br>") + "</blockquote>");
      } else {
        html.push("<p>" + group.map(function (line) { return inline(line, mentions, home); }).join("<br>") + "</p>");
      }
    }
    return html.join("");
  }

  /** A message as plain words: the signs of its formatting go, the words stay. What a quote, a snippet and a mail
   *  carry - and what a reader marks on the screen, where the signs are not shown either.
   *  veiled: a spoiler stays covered - "[ספוילר]" stands for it - for what is read outside the message (the
   *  list, a search, a look at a topic, a mail); otherwise its words stay, as a quote of them would. */
  function plain(text, veiled) {
    var lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n"), out = [], i = 0;
    while (i < lines.length) {
      if (!SPOILER_OPEN.test(lines[i])) { out.push(lines[i++]); continue; }
      var inner = [];
      i++;
      while (i < lines.length && !SPOILER_CLOSE.test(lines[i])) { inner.push(lines[i++]); }
      i++;
      if (veiled) { out.push(VEIL); } else { out.push.apply(out, inner); }
    }
    return out.join("\n")
      .replace(SPOILER_INLINE, veiled ? VEIL : "$1")
      .replace(/^[ \t]{0,3}```.*$/gm, "")
      .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()<>"'|]{1,600})\)/g, "$1")
      .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
      .replace(/(^|[\s(])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?=$|[\s.,;:!?)])/gm, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/^[ \t]{0,3}(?:[-*•][ \t]+|\d{1,3}[.)][ \t]+|>[ \t]?)/gm, "");
  }

  /** A plain text with the words of a search marked in it. */
  function mark(text, words) {
    var list = (words || []).filter(Boolean).map(function (word) { return String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    if (!list.length) { return esc(text); }
    return String(text == null ? "" : text).split(new RegExp("(" + list.join("|") + ")", "gi")).map(function (piece, index) {
      return index % 2 ? "<mark>" + esc(piece) + "</mark>" : esc(piece);
    }).join("");
  }

  root.BoardText = { esc: esc, render: render, mark: mark, plain: plain };
})(typeof window !== "undefined" ? window : globalThis);
