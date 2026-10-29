// happy-dom's Web Animations reject `finished` on cancel even when nothing reads it, which shows up
// as unhandled rejections. Without `element.animate`, Motion uses its JavaScript engine instead.
delete (Element.prototype as { animate?: unknown }).animate;
