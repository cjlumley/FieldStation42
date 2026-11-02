// Minimal in-browser renderer for the Snow Day .dc.html templates.
// Supports what the templates use: {{holes}}, <sc-if>, <sc-for>, <dc-import>, data-props defaults, renderVals().
(() => {
  class DCLogic { constructor(props) { this.props = props; } }
  const HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;
  const ONLY_HOLE = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/;
  const cache = {};

  function load(sources, name) {
    if (cache[name]) return cache[name];
    const src = sources[name];
    if (!src) throw new Error('Missing template: ' + name);
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const xdc = doc.querySelector('x-dc');
    const helmet = xdc.querySelector('helmet');
    const root = [...xdc.children].find(el => el.tagName.toLowerCase() !== 'helmet');
    const script = doc.querySelector('script[data-dc-script]');
    const schema = JSON.parse(script.getAttribute('data-props') || '{}');
    const Cls = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
    return (cache[name] = { name, helmet, root, schema, Cls });
  }

  const get = (scope, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const fill = (str, scope) => str.replace(HOLE, (_, p) => { const v = get(scope, p); return v == null ? '' : String(v); });
  const raw = (str, scope) => { const m = str.match(ONLY_HOLE); return m ? get(scope, m[1]) : fill(str, scope); };

  function coerce(schema, props) {
    const out = {};
    for (const [k, def] of Object.entries(schema)) {
      if (k.startsWith('$')) continue;
      let v = props[k] !== undefined ? props[k] : def.default;
      if (def.editor === 'int' || def.editor === 'number') v = Number(v);
      if (def.editor === 'boolean') v = v === true || v === 'true';
      out[k] = v;
    }
    for (const [k, v] of Object.entries(props)) if (!(k in out)) out[k] = v;
    return out;
  }

  const usedHelmets = new Set();
  function render(sources, name, props) {
    const c = load(sources, name);
    if (!usedHelmets.has(name)) {
      usedHelmets.add(name);
      for (const el of c.helmet.children) {
        if (el.tagName === 'LINK' && /fonts\.googleapis/.test(el.href)) continue; // fonts are bundled locally
        document.head.appendChild(el.cloneNode(true));
      }
    }
    const vals = new c.Cls(coerce(c.schema, props)).renderVals();
    return process(c.root.cloneNode(true), vals, sources);
  }

  function process(node, scope, sources) {
    if (node.nodeType === 3) { node.nodeValue = fill(node.nodeValue, scope); return node; }
    if (node.nodeType !== 1) return node;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-if') {
      const frag = document.createDocumentFragment();
      if (raw(node.getAttribute('value') || '', scope)) for (const ch of [...node.childNodes]) frag.appendChild(process(ch, scope, sources));
      return frag;
    }
    if (tag === 'sc-for') {
      const frag = document.createDocumentFragment();
      const list = raw(node.getAttribute('list') || '', scope) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((item, i) => {
        const s = { ...scope, [as]: item, index: i };
        for (const ch of node.childNodes) frag.appendChild(process(ch.cloneNode(true), s, sources));
      });
      return frag;
    }
    if (tag === 'dc-import') {
      const props = {};
      for (const a of node.attributes) {
        if (a.name === 'name' || a.name.startsWith('hint-')) continue;
        props[a.name] = raw(a.value, scope);
      }
      return render(sources, node.getAttribute('name'), props);
    }
    for (const a of [...node.attributes]) if (a.value.includes('{{')) node.setAttribute(a.name, fill(a.value, scope));
    for (const ch of [...node.childNodes]) { const r = process(ch, scope, sources); if (r !== ch) node.replaceChild(r, ch); }
    return node;
  }

  // Shrink [data-fit="N"] text until it fits its box in N lines.
  function fitText() {
    for (const el of document.querySelectorAll('[data-fit]')) {
      const lines = Number(el.dataset.fit) || 1;
      let size = parseFloat(getComputedStyle(el).fontSize);
      const lh = () => { const v = parseFloat(getComputedStyle(el).lineHeight); return isNaN(v) ? size * 1.2 : v; };
      // offsetHeight = laid-out height (ignores transforms and glyph overhang), so it counts real lines.
      const over = () => el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > lh() * lines + 2;
      while (over() && size > 18) { size -= 1; el.style.fontSize = size + 'px'; }
    }
  }

  window.SD = {
    mount(sources, name, props) {
      document.body.innerHTML = '';
      document.body.appendChild(render(sources, name, props || {}));
    },
    fitText,
  };
})();
