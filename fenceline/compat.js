// Small fill-ins for older browsers and Android WebViews (before Chrome 86 / Safari 14), loaded first.
if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
  const fill = function (...nodes) { while (this.lastChild) this.removeChild(this.lastChild); this.append(...nodes); };
  Element.prototype.replaceChildren = fill;
  if (typeof DocumentFragment !== 'undefined') DocumentFragment.prototype.replaceChildren = fill;
}
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (a, b) { return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b); };
}
