// Runs inside the opaque-origin iframe. Only the parent's sanitized content may update it.
(() => {
  const script = document.currentScript;
  const token = script.dataset.token;
  const patch = script.dataset.patch === 'true';
  const fit = script.dataset.fit === 'true';
  const authorStyle = document.head.querySelector('[data-author-style]');
  script.remove();

  const key = (node) =>
    node.nodeType === Node.ELEMENT_NODE
      ? node.id ||
        (node.getAttribute('data-risu-trigger') &&
          node.tagName + ':' + node.getAttribute('data-risu-trigger'))
      : null;
  const sameType = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

  // Keep matching nodes (including focused controls, open details and panel scroll positions).
  // Attribute changes still apply authored radio selections and other Lua-controlled values.
  function updateChildren(target, source) {
    const keyed = new Map(
      Array.from(target.childNodes)
        .filter(key)
        .map((n) => [key(n), n]),
    );
    Array.from(source.childNodes).forEach((incoming, index) => {
      const current = target.childNodes[index];
      const wantedKey = key(incoming);
      const existing = wantedKey ? keyed.get(wantedKey) : current && !key(current) ? current : null;
      if (!existing || !sameType(existing, incoming)) {
        target.insertBefore(incoming.cloneNode(true), current ?? null);
        return;
      }
      if (wantedKey) keyed.delete(wantedKey);
      if (existing !== current) target.insertBefore(existing, current ?? null);
      if (existing.nodeType === Node.TEXT_NODE || existing.nodeType === Node.COMMENT_NODE) {
        if (existing.nodeValue !== incoming.nodeValue) existing.nodeValue = incoming.nodeValue;
        return;
      }
      if (existing.isEqualNode(incoming)) return;
      const checkedChanged = existing.hasAttribute('checked') !== incoming.hasAttribute('checked');
      const valueChanged = existing.getAttribute('value') !== incoming.getAttribute('value');
      const selectedChanged =
        existing.hasAttribute('selected') !== incoming.hasAttribute('selected');
      const textChanged = existing.textContent !== incoming.textContent;
      for (const attr of Array.from(existing.attributes)) {
        if (
          !incoming.hasAttribute(attr.name) &&
          !(existing.tagName === 'DETAILS' && attr.name === 'open')
        )
          existing.removeAttribute(attr.name);
      }
      for (const attr of Array.from(incoming.attributes)) {
        if (existing.getAttribute(attr.name) !== attr.value)
          existing.setAttribute(attr.name, attr.value);
      }
      updateChildren(existing, incoming);
      if (existing instanceof HTMLInputElement) {
        if (checkedChanged) existing.checked = incoming.hasAttribute('checked');
        if (valueChanged && existing.type !== 'file') existing.value = incoming.value;
      } else if (existing instanceof HTMLOptionElement && selectedChanged) {
        existing.selected = incoming.selected;
      } else if (existing instanceof HTMLTextAreaElement && textChanged) {
        existing.value = incoming.value;
      }
    });
    while (target.childNodes.length > source.childNodes.length) target.lastChild.remove();
  }

  let scheduled = false;
  const measure = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // Body is a flow root in fit mode; unlike document.scrollHeight its height can shrink.
      const height = Math.ceil(document.body.getBoundingClientRect().height) + (fit ? 1 : 0);
      parent.postMessage({ type: 'xeno-html-height', token, height }, '*');
    });
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-risu-trigger]');
    if (button) {
      event.preventDefault();
      parent.postMessage(
        { type: 'xeno-risu-button', token, value: button.getAttribute('data-risu-trigger') },
        '*',
      );
    }
  });
  if (patch)
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (
        event.source !== parent ||
        message?.token !== token ||
        message.type !== 'xeno-html-update' ||
        typeof message.markup !== 'string' ||
        typeof message.styles !== 'string'
      )
        return;
      const template = document.createElement('template');
      template.innerHTML = message.markup;
      if (authorStyle.textContent !== message.styles) authorStyle.textContent = message.styles;
      updateChildren(document.body, template.content);
      measure();
    });
  new ResizeObserver(measure).observe(document.body);
  document.addEventListener('load', measure, true);
  measure();
})();
