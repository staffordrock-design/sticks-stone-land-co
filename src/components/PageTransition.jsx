import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";

// Slide-in transition for detail views (native screen-push feel).
// Keyed by pathname so the enter animation replays on every navigation.
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}