// Floating screen switcher — prototype navigation helper only (skipped on Figma import).
(function () {
  var screens = [
    ["overview.html", "1", "Dashboard"],
    ["projects.html", "2", "Projects"],
    ["project-detail.html", "3", "Project detail"],
    ["parts-list.html", "4", "Parts"],
    ["part-detail.html", "5", "Part detail"],
    ["issues-list.html", "6", "Issue inbox"],
    ["issue-detail.html", "7", "Issue detail"],
    ["revision-history.html", "8", "Revision history"],
    ["revision-diff.html", "9", "Revision compare"],
    ["magic-link-view.html", "R", "Reviewer portal"],
    ["activity.html", "A", "Activity"],
    ["team.html", "T", "Team"],
    ["magic-links.html", "K", "Magic links"],
    ["settings.html", "G", "Settings"],
    ["create-project.html", "+", "New project"],
    ["user-flow.html", "F", "Workflow"],
    ["login.html", "L", "Login"],
    ["signup.html", "S", "Sign up"],
  ];
  var here = location.pathname.split("/").pop() || "login.html";
  var el = document.createElement("div");
  el.className = "switcher";
  el.setAttribute("data-figma-skip", "true");
  el.innerHTML =
    '<span class="lbl">Screens</span>' +
    screens
      .map(function (s) {
        var active = s[0] === here ? ' style="background:rgba(255,255,255,.16);color:#fff"' : "";
        return '<a href="' + s[0] + '" title="' + s[2] + '"' + active + ">" + s[1] + "</a>";
      })
      .join("");
  document.body.appendChild(el);
  if (/noswitch/.test(location.hash)) el.style.display = 'none';
})();

// --- Mockup interactivity: make pagers, filter chips, dropdowns, copy buttons and dead "#" links feel live ---
(function () {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function flash(el, msg) { var t = el.textContent; el.textContent = msg; el.style.opacity = '.8'; setTimeout(function () { el.textContent = t; el.style.opacity = ''; }, 1100); }
  var txt = function (el) { return (el.textContent || '').trim(); };

  var MENUS = {
    'Last 30 days': ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year'],
    'Project': ['All projects', 'TM-4 Bike Program', 'Cargo eBike', 'Helios Scooter'],
    'Category': ['All categories', 'Geometry', 'Tolerance', 'Material', 'Tooling', 'Assembly', 'Process'],
    'Severity': ['All severities', 'Critical', 'High', 'Medium', 'Low'],
    'Status': ['All statuses', 'Planning', 'Active · DFM', 'On hold', 'DFM Approved']
  };
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.contains(e.target) && !openMenu._btn.contains(e.target)) closeMenu(); });

  ready(function () {
    var st = document.createElement('style');
    st.textContent = '.mock-menu{position:fixed;z-index:9998;background:#fff;border:1px solid #e3e6e5;border-radius:9px;box-shadow:0 12px 32px rgba(20,20,20,.18);padding:5px;min-width:160px}.mock-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;font:inherit;font-size:13px;color:#1c1c1c;padding:7px 10px;border-radius:6px;cursor:pointer}.mock-menu button:hover{background:#f1f3f2}';
    document.head.appendChild(st);

    // 1) ▾ dropdown buttons → a small menu; picking an option updates the label
    document.querySelectorAll('button.btn').forEach(function (b) {
      if (!/▾$/.test(txt(b))) return;
      var base = txt(b).replace(/\s*▾$/, '').trim();
      var opts = MENUS[base] || ['All', base];
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (openMenu && openMenu._btn === b) { closeMenu(); return; }
        closeMenu();
        var m = document.createElement('div'); m.className = 'mock-menu'; m._btn = b;
        opts.forEach(function (o) {
          var it = document.createElement('button'); it.textContent = o;
          it.addEventListener('click', function () { b.textContent = o + ' ▾'; closeMenu(); document.dispatchEvent(new CustomEvent('mock:filter')); });
          m.appendChild(it);
        });
        document.body.appendChild(m);
        var r = b.getBoundingClientRect();
        m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
        m.style.top = (r.bottom + 5) + 'px';
        openMenu = m;
      });
    });

    // 2) filter chips → single-select within their row
    document.querySelectorAll('.filter-chips').forEach(function (row) {
      row.querySelectorAll('.fchip').forEach(function (c) {
        c.addEventListener('click', function () {
          row.querySelectorAll('.fchip').forEach(function (o) { o.classList.remove('on'); });
          c.classList.add('on');
          document.dispatchEvent(new CustomEvent('mock:filter'));
        });
      });
    });

    // 3) pagers → move the current-page highlight
    document.querySelectorAll('.pager').forEach(function (p) {
      p.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          p.querySelectorAll('.cur').forEach(function (s) { s.classList.remove('cur'); });
          a.classList.add('cur');
        });
      });
    });

    // 4) Copy buttons → copy the nearby input, flash confirmation
    document.querySelectorAll('button').forEach(function (b) {
      if (txt(b) !== 'Copy') return;
      b.addEventListener('click', function () {
        var inp = (b.parentElement && b.parentElement.querySelector('input')) || (b.closest('.field,.input-group,div') || document).querySelector('input');
        try { if (inp) { inp.select && inp.select(); navigator.clipboard && navigator.clipboard.writeText(inp.value); } } catch (x) {}
        flash(b, 'Copied ✓');
      });
    });

    // 5) composer submit (Comment / Post / Send / Reply) → clear + confirm
    document.querySelectorAll('.composer a, .composer button').forEach(function (b) {
      if (!/^(Comment|Post|Send|Reply)$/.test(txt(b))) return;
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var c = b.closest('.composer'), ta = c && c.querySelector('textarea');
        var val = ta ? ta.value.trim() : '';
        if (!val) { flash(b, 'Type a comment…'); return; }
        var d = document.createElement('div'); d.className = 'cmt';
        d.innerHTML = '<span class="av av-mk">MK</span><div class="grow"><div class="top"><span class="nm">Mathieu Kury</span><span class="tm">just now</span></div><div class="body"></div></div>';
        d.querySelector('.body').textContent = val;
        c.parentNode.insertBefore(d, c);
        ta.value = '';
        flash(b, 'Posted ✓');
      });
    });

    // 6) a few specific action buttons that otherwise dead-end
    document.querySelectorAll('button.btn').forEach(function (b) {
      var t = txt(b);
      if (t === 'Still open') b.addEventListener('click', function () { flash(b, 'Kept open'); });
      else if (/Propose a sign-off/.test(t)) b.addEventListener('click', function () { flash(b, 'Proposed ✓'); });
    });

    // 7) remaining dead "#" links → no jump; confirm export/download-style actions
    document.querySelectorAll('a[href="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (/export|download|csv/i.test(txt(a))) flash(a, 'Done ✓');
      });
    });

    // 8) universal "eventful" fallback — every remaining unwired button does something visible
    var pst = document.createElement('style'); pst.textContent = 'button:active{transform:scale(.97)}'; document.head.appendChild(pst);
    function pulse(el) { el.style.opacity = '.55'; setTimeout(function () { el.style.opacity = ''; }, 150); }
    document.querySelectorAll('button').forEach(function (b) {
      var t = txt(b);
      if (b.hasAttribute('onclick') || b.disabled || !t) return;          // already wired, or icon-only
      if (/▾$/.test(t) || t === 'Copy' || t === 'Still open' || /Propose a sign-off/.test(t)) return;
      if (b.closest('.composer') || b.closest('.mock-menu')) return;
      b.addEventListener('click', function () {
        var row = b.closest('tr, .prow, .row, .member, .card, li');
        if (/^(revoke|disable)\b/i.test(t)) { if (row) { row.style.transition = 'opacity .2s'; row.style.opacity = '.4'; } flash(b, 'Revoked'); b.disabled = true; b.style.opacity = '.6'; return; }
        if (/^(remove|delete)\b/i.test(t) || t === '×') { if (row) { row.style.transition = 'opacity .2s'; row.style.opacity = '0'; setTimeout(function () { row.remove(); }, 200); } return; }
        if (/\b(save|update|apply)\b/i.test(t)) return flash(b, 'Saved ✓');
        if (/\b(invite|add)\b/i.test(t)) return flash(b, 'Sent ✓');
        if (/\b(extend|renew|re-?issue|resend|regenerate)\b/i.test(t)) return flash(b, 'Done ✓');
        if (/\b(send|generate|submit|create|publish|approve|confirm)\b/i.test(t)) return flash(b, 'Done ✓');
        if (/\b(export|download)\b/i.test(t)) return flash(b, 'Exported ✓');
        pulse(b);
      });
    });
  });
})();
