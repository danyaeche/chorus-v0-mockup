// Shared sidebar navigation for every brand page.
// v0 IA: Workspace → Project → RFQ → Parts → Revisions → (Comments + Quotes)
// Usage: <aside class="sidebar" data-active="projects|rfqs|parts|activity"></aside>
//        <script src="sidebar.js"></script>
(function () {
  var aside = document.querySelector('aside.sidebar[data-active]');
  if (!aside) return;
  var active = aside.getAttribute('data-active');
  var nav = [
    ['overview', 'overview.html', 'Dashboard', '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/>'],
    ['projects', 'projects.html', 'Projects', '<path d="M4 8a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'],
    ['parts', 'parts-list.html', 'Parts', '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" stroke="currentColor" stroke-width="1.6"/><path d="M4 7.5 12 12l8-4.5M12 12v9" stroke="currentColor" stroke-width="1.6"/>'],
    ['issues', 'issues-list.html', 'Issues', '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6"/>'],
    ['activity', 'activity.html', 'Activity', '<path d="M4 12a8 8 0 1 0 8-8" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
  ];
  var admin = [
    ['team', 'team.html', 'Team', '<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 6.5a3 3 0 0 1 0 5.8M17.5 19a5.5 5.5 0 0 0-2-4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
    ['magiclinks', 'magic-links.html', 'Magic links', '<path d="M9 12a4 4 0 0 1 4-4h3a4 4 0 0 1 0 8h-1M15 12a4 4 0 0 1-4 4H8a4 4 0 0 1 0-8h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
    ['settings', 'settings.html', 'Settings', '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
  ];

  function renderNav(items) {
    return items.map(function (n) {
      return '<a href="' + n[1] + '"' + (n[0] === active ? ' class="active"' : '') +
        '><svg viewBox="0 0 24 24" fill="none">' + n[3] + '</svg>' + n[2] + '</a>';
    }).join('');
  }
  var navHtml = renderNav(nav);
  var adminHtml = renderNav(admin);

  aside.innerHTML =
    '<a class="brand brand--light" href="overview.html">' +
      '<img src="logo.png" class="mark" alt="Chorus" /> chorus</a>' +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<div class="spacer"></div>' +
    '<div class="nav-sep"></div>' +
    '<nav class="nav nav--admin">' + adminHtml + '</nav>' +
    '<div class="user">' +
      '<div class="avatar">MK</div>' +
      '<div class="meta"><div class="n">Mathieu Kury</div><div class="e">mkury@simplyops.com</div></div>' +
      '<a href="login.html" class="signout" title="Sign out"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" stroke="#9a9a9a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
    '</div>';

})();
