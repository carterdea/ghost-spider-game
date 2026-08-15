/** The two-line DOM builder every HUD module writes its skeleton with. */
export type Add = <K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  className: string,
  text?: string,
) => HTMLElementTagNameMap[K];

export const adder =
  (doc: Document): Add =>
  (parent, tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    parent.append(node);
    return node;
  };

export const SVG_NS = "http://www.w3.org/2000/svg";
