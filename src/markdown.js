// A deliberately small Markdown renderer for tutor replies: headings, lists,
// quotes, bold/italic/code. All text is HTML-escaped first.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
}

export function renderMarkdown(src) {
  let html = '';
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) html += `<p>${para.map(inline).join('<br>')}</p>`;
    para = [];
  };
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  const open = (tag) => {
    if (list !== tag) {
      close();
      html += `<${tag}>`;
      list = tag;
    }
  };
  const depth = (indent) => Math.min(3, Math.floor(indent.replace(/\t/g, '  ').length / 2));

  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) {
      flush();
      close();
    } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      flush();
      close();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      close();
      html += '<hr>';
    } else if ((m = line.match(/^(\s*)[-*•・]\s+(.*)$/))) {
      flush();
      open('ul');
      html += `<li class="d${depth(m[1])}">${inline(m[2])}</li>`;
    } else if ((m = line.match(/^(\s*)(\d+)[.)、]\s+(.*)$/))) {
      flush();
      open('ol');
      html += `<li class="d${depth(m[1])}" value="${m[2]}">${inline(m[3])}</li>`;
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flush();
      close();
      html += `<blockquote>${inline(m[1])}</blockquote>`;
    } else {
      close();
      para.push(line.trim());
    }
  }
  flush();
  close();
  return html;
}
