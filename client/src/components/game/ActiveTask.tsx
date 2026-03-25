import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Timer, Skull, Sword, PlayCircle, PauseCircle } from "lucide-react";
const heroBg = "https://pub-87034a8f89f94b3d9149a9af7048ee14.r2.dev/generated_images/dark_fantasy_atmospheric_background.webp";
import { useGame } from "@/context/GameContext";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Calculate initial progress based on activeTask
function calculateProgress(activeTask: { startTime: number; duration: number } | null): number {
  if (!activeTask) return 0;
  const elapsed = Date.now() - activeTask.startTime;
  return Math.max(0, Math.min((elapsed / activeTask.duration) * 100, 100));
}

export default function ActiveTask() {
  const { activeTask, stopTask } = useGame();
  // Initialize with calculated progress to avoid reset on mount
  const [progress, setProgress] = useState(() => calculateProgress(activeTask));

  useEffect(() => {
    let animationFrame: number;
    
    const animate = () => {
      if (activeTask) {
        const elapsed = Date.now() - activeTask.startTime;
        const p = Math.max(0, Math.min((elapsed / activeTask.duration) * 100, 100));
        setProgress(p);
      } else {
        setProgress(0);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
    return () => cancelAnimationFrame(animationFrame);
  }, [activeTask]);

  if (!activeTask) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-border group h-full min-h-[300px] flex flex-col items-center justify-center bg-card/50 backdrop-blur-md">
        <div className="text-center space-y-4 p-6">
          <div className="p-4 bg-primary/10 rounded-full inline-block">
            <Timer className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold">No Active Task</h2>
          <p className="text-muted-foreground max-w-sm">
            Visit the Skills or Combat page to start an adventure. Your character is currently idle at the camp.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-border group h-full min-h-[300px] flex flex-col">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="Background" 
          className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col h-full justify-between">
        <div>
          <div className="flex justify-between items-start mb-4">
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/50 backdrop-blur-md px-3 py-1 font-ui tracking-widest uppercase">
              <Sword className="w-3 h-3 mr-2" /> {activeTask.skillId}
            </Badge>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-black/40 px-2 py-1 rounded">
              <Timer className="w-3 h-3" /> 
              {((activeTask.duration - (activeTask.duration * (progress / 100))) / 1000).toFixed(1)}s left
            </div>
          </div>

          <h1 className="text-3xl font-display font-black text-white drop-shadow-lg mb-1 tracking-tight">
            {activeTask.name}
          </h1>
          <p className="text-muted-foreground font-ui text-lg mb-6 max-w-md">
            Gaining {activeTask.xpReward} XP every {(activeTask.duration / 1000).toFixed(1)} seconds.
          </p>

          {/* Progress Card */}
          <div className="bg-black/40 border border-white/10 backdrop-blur-md rounded-lg p-4 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-white flex items-center gap-2 font-display">
                Working...
              </span>
              <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">{progress.toFixed(0)}%</span>
            </div>
            <div className="space-y-1">
              <Progress value={progress} className="h-2 bg-white/10" indicatorClassName="bg-primary" />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <Button 
            size="lg" 
            onClick={() => stopTask()}
            className="bg-destructive hover:bg-destructive/90 text-white font-display font-bold shadow-[0_0_20px_rgba(239,68,68,0.2)]"
          >
            <PauseCircle className="mr-2 h-5 w-5" /> Stop Action
          </Button>
        </div>
      </div>
    </div>
  );
}
