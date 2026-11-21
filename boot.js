/* Запуск скачанной игры на том же происхождении через blob URL. */
function launchGameFromParts(parts) {
  const cssUrl = URL.createObjectURL(new Blob([parts.css], { type: "text/css" }));
  const jsUrl = URL.createObjectURL(new Blob([parts.js], { type: "text/javascript;charset=utf-8" }));
  let html = parts.html;
  if (/href=["']style\.css["']/.test(html)) {
    html = html.replace(/href=["']style\.css["']/, 'href="' + cssUrl + '"');
  } else {
    html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="' + cssUrl + '"></head>');
  }
  if (/src=["']game\.js["']/.test(html)) {
    html = html.replace(/src=["']game\.js["']/, 'src="' + jsUrl + '"');
  } else {
    html = html.replace(/<\/body>/i, '<script src="' + jsUrl + '"><\/script></body>');
  }
  document.open();
  document.write(html);
  document.close();
}
