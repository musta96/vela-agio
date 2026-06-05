import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  stagger?: boolean;
};

export default function Reveal({ children, className = "", delay = 0, y = 40, stagger = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.set(stagger ? el.children : el, { opacity: 1, y: 0, filter: "blur(0px)" });
      return;
    }
    const targets = stagger ? el.children : el;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          ease: "power3.out",
          delay,
          stagger: stagger ? 0.08 : 0,
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, el);
    return () => ctx.revert();
  }, [delay, y, stagger]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}