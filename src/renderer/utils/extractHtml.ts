/**
 * Extracts an HTML document from a model's markdown response. Prefers a
 * fenced ```html block (the restaurant template asks for it explicitly);
 * falls back to sniffing a raw <!DOCTYPE html> / <html> tag when the model
 * forgets the fence, per the acceptance criteria in the spec.
 */
export function extractHtmlBlock(content: string): string | null {
  const fenced = content.match(/```html\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const genericFence = content.match(/```\s*(<!DOCTYPE html[\s\S]*?|<html[\s\S]*?)```/i);
  if (genericFence) return genericFence[1].trim();

  const docTypeIndex = content.search(/<!DOCTYPE html/i);
  if (docTypeIndex !== -1) return content.slice(docTypeIndex).trim();

  const htmlIndex = content.search(/<html[\s>]/i);
  if (htmlIndex !== -1) return content.slice(htmlIndex).trim();

  return null;
}
