import { memo, useMemo } from "react";

interface DungeonBackgroundProps {
  currentFloor: number;
  maxFloors?: number;
}

export const DungeonBackground = memo(function DungeonBackground({ currentFloor, maxFloors = 100 }: DungeonBackgroundProps) {
  const style = useMemo(() => {
    const progress = Math.min(1, currentFloor / maxFloors);
    const hue = 270 - progress * 40;
    const saturation = 20 + progress * 15;
    const redTint = progress * 0.15;
    return {
      background: `radial-gradient(ellipse at center, hsla(${hue}, ${saturation}%, 8%, 1) 0%, hsla(${hue}, ${saturation - 5}%, 5%, 1) 50%, hsl(0, 0%, 0%) 100%)`,
      "--fog-opacity": `${0.03 + progress * 0.05}`,
      "--vignette-strength": `${0.7 + progress * 0.15}`,
      "--red-tint": `${redTint}`,
    } as React.CSSProperties;
  }, [currentFloor, maxFloors]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={style}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,var(--vignette-strength, 0.7)) 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, transparent 0%, rgba(139,92,246,var(--fog-opacity, 0.03)) 40%, transparent 60%, rgba(139,92,246,var(--fog-opacity, 0.03)) 100%)`,
          animation: "fogDrift 12s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 100%, rgba(220,38,38,var(--red-tint, 0)) 0%, transparent 50%)`,
        }}
      />
      <style>{`
        @keyframes fogDrift {
          0% { transform: translateY(0) scaleX(1); }
          100% { transform: translateY(-8px) scaleX(1.02); }
        }
      `}</style>
    </div>
  );
});
