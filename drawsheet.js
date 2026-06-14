// Engineering drawing-sheet generator (CADGenBench-style).
// window.DrawSheet.svg(opts) -> SVG string for a full landscape drawing sheet:
// crop marks + border, notes block, orthographic views with dimensions, an
// isometric pictorial, and a title block. Used by the Parts gallery and the
// Part-detail 2D view. Auto-fills any element carrying a data-sheet="{...}" attr.
(function () {
  var INK = '#33454d', DIM = '#8a979d', LN = '#c7cfd2', ACC = '#009571', FILL = '#fbfdfe';
  var F = "ui-monospace,'SF Mono',Menlo,monospace", FH = "'Space Grotesk',sans-serif";

  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function crop() {
    function m(x, y, dx, dy) { return '<path d="M' + x + ' ' + y + 'h' + dx + 'M' + x + ' ' + y + 'v' + dy + '" stroke="' + INK + '" stroke-width="2.4" fill="none"/>'; }
    return m(12, 12, 20, 20) + m(988, 12, -20, 20) + m(12, 688, 20, -20) + m(988, 688, -20, -20);
  }
  function border() { return '<rect x="24" y="24" width="952" height="652" fill="none" stroke="' + LN + '"/>'; }

  function notes(lines) {
    var x = 44, y = 60, s = '<text x="' + x + '" y="' + (y - 14) + '" font-size="11" font-weight="600" fill="' + INK + '" font-family="' + FH + '">NOTES</text><g font-size="9.5" fill="#5a656c">';
    for (var i = 0; i < lines.length; i++) s += '<text x="' + x + '" y="' + (y + i * 15) + '">' + e(lines[i]) + '</text>';
    return s + '</g>';
  }
  function defaultNotes(o) {
    if ((o.process || '') === 'Die Cast') return ['ALL UNITS MM', 'DRAFT 1.0° MIN ALL FACES', 'MATL ADC12 ALUMINUM', 'UNLESS OTHERWISE NOTED'];
    return ['ALL UNITS MM', 'DRAFT PER NOTE — TEXTURED WALLS', 'NOM WALL 2.50 ±0.10', 'MATL ' + (o.material || 'PC-ABS')];
  }

  // decorative dimension/leader fan (the dense left-side look)
  function fan(x, y, n, len) {
    var s = '<g stroke="' + DIM + '" stroke-width="0.7">';
    for (var i = 0; i < n; i++) { var yy = y + i * 8; s += '<line x1="' + x + '" y1="' + yy + '" x2="' + (x + len - (i % 5) * 7) + '" y2="' + yy + '"/><circle cx="' + x + '" cy="' + yy + '" r="1.1" fill="' + DIM + '" stroke="none"/>'; }
    return s + '</g>';
  }

  function dimH(x1, x2, y, label) {
    var mx = (x1 + x2) / 2;
    return '<g font-family="' + F + '" font-size="10" fill="' + INK + '">'
      + '<line x1="' + x1 + '" y1="' + (y - 5) + '" x2="' + x1 + '" y2="' + (y + 5) + '" stroke="' + DIM + '"/>'
      + '<line x1="' + x2 + '" y1="' + (y - 5) + '" x2="' + x2 + '" y2="' + (y + 5) + '" stroke="' + DIM + '"/>'
      + '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + DIM + '" marker-start="url(#a)" marker-end="url(#a)"/>'
      + '<rect x="' + (mx - 17) + '" y="' + (y - 8) + '" width="34" height="13" fill="#fff"/>'
      + '<text x="' + mx + '" y="' + (y + 1) + '" text-anchor="middle">' + e(label) + '</text></g>';
  }
  function dimV(y1, y2, x, label) {
    var my = (y1 + y2) / 2;
    return '<g font-family="' + F + '" font-size="10" fill="' + INK + '">'
      + '<line x1="' + (x - 5) + '" y1="' + y1 + '" x2="' + (x + 5) + '" y2="' + y1 + '" stroke="' + DIM + '"/>'
      + '<line x1="' + (x - 5) + '" y1="' + y2 + '" x2="' + (x + 5) + '" y2="' + y2 + '" stroke="' + DIM + '"/>'
      + '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + DIM + '" marker-start="url(#a)" marker-end="url(#a)"/>'
      + '<rect x="' + (x - 17) + '" y="' + (my - 7) + '" width="34" height="13" fill="#fff" transform="rotate(-90 ' + x + ' ' + my + ')"/>'
      + '<text x="' + x + '" y="' + (my + 1) + '" text-anchor="middle" transform="rotate(-90 ' + x + ' ' + my + ')">' + e(label) + '</text></g>';
  }

  function ortho(shape, d) {
    var tvx = 196, tvy = 168, W = 210, D = 132, s = '';
    var round = (shape === 'cap' || shape === 'lens');
    if (round) {
      s += '<ellipse cx="' + (tvx + W / 2) + '" cy="' + (tvy + D / 2) + '" rx="' + (W / 2) + '" ry="' + (D / 2) + '" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.6"/>';
      s += '<ellipse cx="' + (tvx + W / 2) + '" cy="' + (tvy + D / 2) + '" rx="' + (W / 2 - 18) + '" ry="' + (D / 2 - 18) + '" fill="none" stroke="' + LN + '"/>';
    } else {
      s += '<rect x="' + tvx + '" y="' + tvy + '" width="' + W + '" height="' + D + '" rx="10" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.6"/>';
      if (shape === 'bezel') s += '<rect x="' + (tvx + 32) + '" y="' + (tvy + 26) + '" width="' + (W - 64) + '" height="' + (D - 52) + '" fill="#fff" stroke="' + INK + '" stroke-width="1.3"/>';
      else if (shape === 'tray') { s += '<g stroke="' + INK + '" stroke-width="1">'; for (var k = 1; k < 4; k++) s += '<line x1="' + (tvx + k * W / 4) + '" y1="' + (tvy + 8) + '" x2="' + (tvx + k * W / 4) + '" y2="' + (tvy + D - 8) + '"/>'; s += '</g>'; }
      else { s += '<g fill="#eef2f3" stroke="' + INK + '" stroke-width="1.2">';[[tvx + 36, tvy + 30], [tvx + W - 36, tvy + 30], [tvx + 36, tvy + D - 30], [tvx + W - 36, tvy + D - 30]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="8"/>'; }); s += '</g>'; }
    }
    s += '<line x1="' + (tvx - 16) + '" y1="' + (tvy + D / 2) + '" x2="' + (tvx + W + 16) + '" y2="' + (tvy + D / 2) + '" stroke="' + LN + '" stroke-dasharray="7 4"/>';
    s += '<line x1="' + (tvx + W / 2) + '" y1="' + (tvy - 16) + '" x2="' + (tvx + W / 2) + '" y2="' + (tvy + D + 16) + '" stroke="' + LN + '" stroke-dasharray="7 4"/>';
    s += dimH(tvx, tvx + W, tvy - 24, (round ? 'Ø' : '') + d.w);
    s += dimV(tvy, tvy + D, tvx - 26, d.d);
    s += '<text x="' + tvx + '" y="' + (tvy - 40) + '" font-size="10.5" font-weight="600" fill="' + INK + '" font-family="' + FH + '">TOP VIEW</text>';
    // front view
    var fvy = tvy + D + 78, H = 76;
    s += '<rect x="' + tvx + '" y="' + fvy + '" width="' + W + '" height="' + H + '" rx="' + (round ? 6 : 3) + '" fill="' + FILL + '" stroke="' + INK + '" stroke-width="1.6"/>';
    if (shape === 'enclosure' || shape === 'tray') s += '<line x1="' + tvx + '" y1="' + (fvy + 14) + '" x2="' + (tvx + W) + '" y2="' + (fvy + 14) + '" stroke="' + LN + '"/>';
    s += dimV(fvy, fvy + H, tvx - 26, d.h);
    s += '<text x="' + tvx + '" y="' + (fvy - 12) + '" font-size="10.5" font-weight="600" fill="' + INK + '" font-family="' + FH + '">FRONT VIEW</text>';
    return s;
  }

  function iso(shape) {
    var cx = 812, cyT = 176, S = 44;
    var head = '<text x="752" y="116" font-size="10.5" font-weight="600" fill="' + INK + '" font-family="' + FH + '">ISO VIEW</text>';
    if (shape === 'cap' || shape === 'lens') {
      var rx = 1.2 * S, ry = 0.52 * S, s = head;
      if (shape === 'lens') {
        s += '<path d="M' + (cx - rx) + ' ' + cyT + ' A ' + rx + ' ' + (1.35 * S) + ' 0 0 1 ' + (cx + rx) + ' ' + cyT + '" fill="#eef2f3" stroke="' + INK + '" stroke-width="1.3"/>';
        s += '<ellipse cx="' + cx + '" cy="' + cyT + '" rx="' + rx + '" ry="' + ry + '" fill="#f6f8f9" stroke="' + INK + '" stroke-width="1.3"/>';
        return s;
      }
      var cyB = cyT + 1.3 * S;
      s += '<path d="M' + (cx - rx) + ' ' + cyT + ' V ' + cyB + ' A ' + rx + ' ' + ry + ' 0 0 0 ' + (cx + rx) + ' ' + cyB + ' V ' + cyT + '" fill="#eef2f3" stroke="' + INK + '" stroke-width="1.3"/>';
      s += '<ellipse cx="' + cx + '" cy="' + cyT + '" rx="' + rx + '" ry="' + ry + '" fill="#f6f8f9" stroke="' + INK + '" stroke-width="1.3"/>';
      return s;
    }
    function P(x, y, z) { return [cx + (x - z) * 0.866 * S - 46, cyT + 92 - y * S + (x + z) * 0.5 * S]; }
    function pt(x, y, z) { var a = P(x, y, z); return a[0].toFixed(1) + ',' + a[1].toFixed(1); }
    function face(p, f) { return '<path d="M' + p.map(function (q) { return pt(q[0], q[1], q[2]); }).join('L') + 'Z" fill="' + f + '" stroke="' + INK + '" stroke-width="1.3" stroke-linejoin="round"/>'; }
    var W = 1.85, H = (shape === 'frame' ? 0.72 : 0.55), D = 1.2, s = head;
    s += face([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]], '#eef2f3');
    s += face([[W, 0, 0], [W, 0, D], [W, H, D], [W, H, 0]], '#e2e7e9');
    s += face([[0, H, 0], [W, H, 0], [W, H, D], [0, H, D]], '#f6f8f9');
    if (shape === 'bezel') s += face([[0.32, H, 0.26], [W - 0.32, H, 0.26], [W - 0.32, H, D - 0.26], [0.32, H, D - 0.26]], '#fff');
    if (shape === 'housing') { for (var i = 1; i < 4; i++) { var a = P(i * W / 4, H, 0), b = P(i * W / 4, H, D); s += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="' + INK + '" stroke-width="0.9"/>'; } }
    if (shape === 'tray') { for (var j = 1; j < 4; j++) { var c = P(j * W / 4, H, 0.1), e2 = P(j * W / 4, H, D - 0.1); s += '<line x1="' + c[0].toFixed(1) + '" y1="' + c[1].toFixed(1) + '" x2="' + e2[0].toFixed(1) + '" y2="' + e2[1].toFixed(1) + '" stroke="' + INK + '" stroke-width="0.9"/>'; } }
    return s;
  }

  function titleBlock(o) {
    var x = 648, y = 556, w = 328, h = 120, midx = x + w * 0.6;
    function fld(tx, ty, k, v, id) { return '<text x="' + tx + '" y="' + ty + '" font-size="7.5" fill="' + DIM + '">' + e(k) + '</text><text x="' + tx + '" y="' + (ty + 13) + '" font-size="11" fill="' + INK + '"' + (id ? ' id="' + id + '"' : '') + '>' + e(v) + '</text>'; }
    return '<g font-family="' + F + '">'
      + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + FILL + '" stroke="' + INK + '"/>'
      + '<line x1="' + x + '" y1="' + (y + 34) + '" x2="' + (x + w) + '" y2="' + (y + 34) + '" stroke="' + INK + '"/>'
      + '<line x1="' + midx + '" y1="' + (y + 34) + '" x2="' + midx + '" y2="' + (y + h) + '" stroke="' + LN + '"/>'
      + '<line x1="' + x + '" y1="' + (y + 64) + '" x2="' + (x + w) + '" y2="' + (y + 64) + '" stroke="' + LN + '"/>'
      + '<line x1="' + x + '" y1="' + (y + 92) + '" x2="' + (x + w) + '" y2="' + (y + 92) + '" stroke="' + LN + '"/>'
      + '<text x="' + (x + 12) + '" y="' + (y + 23) + '" font-size="16" font-weight="700" fill="' + INK + '" font-family="' + FH + '">chorus</text>'
      + '<text x="' + (x + w - 12) + '" y="' + (y + 22) + '" font-size="9.5" fill="' + DIM + '" text-anchor="end">DFM DRAWING</text>'
      + fld(x + 10, y + 46, 'TITLE', o.title || '')
      + fld(x + 10, y + 76, 'PART NO', o.number || '')
      + fld(x + 10, y + 104, 'MATERIAL', o.material || '')
      + fld(midx + 10, y + 46, 'PROCESS', o.process || '')
      + fld(midx + 10, y + 76, 'REV', o.rev || '', o.revId)
      + fld(midx + 10, y + 104, 'SCALE', o.scale || '1:2 · mm')
      + '</g>';
  }

  function svg(o) {
    o = o || {};
    var d = o.dims || { w: '180.0', d: '120.0', h: '42.0' }, shape = o.shape || 'enclosure';
    return '<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" font-family="' + F + '">'
      + '<defs><marker id="a" markerWidth="10" markerHeight="8" refX="8" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0L8 3.5L0 7Z" fill="' + DIM + '"/></marker></defs>'
      + '<rect x="0" y="0" width="1000" height="700" fill="#fff"/>'
      + crop() + border()
      + notes(o.notes || defaultNotes(o))
      + fan(70, 168, 13, 96)
      + ortho(shape, d)
      + iso(shape)
      + (o.extras || '')
      + titleBlock(o)
      + '</svg>';
  }

  function render(root) {
    var els = (root || document).querySelectorAll('[data-sheet]');
    for (var i = 0; i < els.length; i++) {
      try { els[i].innerHTML = svg(JSON.parse(els[i].getAttribute('data-sheet'))); } catch (x) {}
    }
  }

  window.DrawSheet = { svg: svg, render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); });
  else render();
})();
