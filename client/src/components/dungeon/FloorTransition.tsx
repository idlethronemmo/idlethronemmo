import { useState, useEffect, useRef, memo } from "react";

interface FloorTransitionProps {
  currentFloor: number;
}

export const FloorTransition = memo(function FloorTransition({ currentFloor }: FloorTransitionProps) {
  const [show, setShow] = useState(false);
  const [displayFloor, setDisplayFloor] = useState(currentFloor);
  const prevFloor = useRef(currentFloor);

  useEffect(() => {
    if (currentFloor !== prevFloor.current && currentFloor > 1) {
      prevFloor.current = currentFloor;
      setDisplayFloor(currentFloor);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1200);
      return () => clearTimeout(timer);
    }
    prevFloor.current = currentFloor;
  }, [currentFloor]);

  if (!show) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
      data-testid="floor-transition"
    >
      <div
        className="text-center"
        style={{ animation: "floorBannerIn 1.2s ease-out forwards" }}
      >
        <div className="text-3xl sm:text-4xl font-black text-purple-200 tracking-widest uppercase drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]">
          FLOOR {displayFloor}
        </div>
        <div className="h-[2px] w-32 mx-auto mt-2 rounded-full bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
      </div>
      <style>{`
        @keyframes floorBannerIn {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.05); }
          40% { transform: scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </div>
  );
});
