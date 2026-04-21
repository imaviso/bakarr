import { useCallback, useRef, useState } from "react";

export function useContainerWidth() {
  const [width, setWidth] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!node) return;

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(node);
    roRef.current = ro;
    setWidth(Math.round(node.getBoundingClientRect().width));
  }, []);

  return [ref, width, nodeRef] as const;
}
