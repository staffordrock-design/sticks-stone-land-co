import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (hash) {
      const id = getHashId(hash);
      const timers = [50, 400, 1000].map((delay, index) => window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: index === 0 ? "smooth" : "auto",
          block: "start",
        });
      }, delay));
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    if (navigationType === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
