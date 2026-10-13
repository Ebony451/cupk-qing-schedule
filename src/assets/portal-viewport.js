/* Display-only helper. Does not inspect accounts, courses, forms or network. */
(function (root) {
 'use strict';
 if (root.QingPortalViewport) return;
 var original = null, created = null;
 function setDesktop(desktop) {
  var doc = root.document;
  if (!doc || !doc.head) return;
  if (desktop) {
   if (original === null) original = Array.from(doc.querySelectorAll('meta[name="viewport"]')).map(function (el) { return {el:el, content:el.getAttribute('content')}; });
   if (!original.length && !created) { created=doc.createElement('meta'); created.name='viewport'; doc.head.appendChild(created); }
   (original.length ? original.map(function (item) {return item.el;}) : [created]).forEach(function (el) {el.setAttribute('content','width=1280');});
  } else if (original !== null) {
   original.forEach(function (item) {if(item.content===null)item.el.removeAttribute('content');else item.el.setAttribute('content',item.content);});
   if(created){created.remove();created=null;}
   original=null;
  }
 }
 root.QingPortalViewport={setDesktop:setDesktop};
})(window);
