import ActionLog from "@/components/game/ActionLog";
import ActiveTask from "@/components/game/ActiveTask";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Backpack, Gem, Scroll } from "lucide-react";
import { useMobile } from "@/hooks/useMobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function GameDashboard() {
  const { isMobile } = useMobile();
  const [logExpanded, setLogExpanded] = useState(false);

  if (isMobile) {
    return (
        <div className="flex flex-col gap-4 pb-24" data-testid="mobile-dashboard">
          {/* Active Task - Full Width */}
          <div className="min-h-[200px]">
            <ActiveTask />
          </div>

          {/* Quick Stats Cards */}
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="text-xs font-ui uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Backpack className="w-3.5 h-3.5" /> Quick Inventory
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="grid grid-cols-6 gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((slot) => (
                  <div 
                    key={slot} 
                    className="aspect-square bg-black/20 rounded border border-white/5 flex items-center justify-center"
                    data-testid={`quick-inv-slot-${slot}`}
                  >
                    {slot === 1 && <Gem className="w-4 h-4 text-purple-400" />}
                    {slot === 2 && <Scroll className="w-4 h-4 text-amber-200" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardHeader className="pb-2 px-4 pt-3">
              <CardTitle className="text-xs font-ui uppercase tracking-widest text-muted-foreground">
                Active Effects
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 text-[10px] px-1.5 py-0">Buff</Badge>
                  <span className="font-ui text-xs">Experience Boost</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">14m</span>
              </div>
            </CardContent>
          </Card>

          {/* Collapsible Action Log */}
          <Collapsible open={logExpanded} onOpenChange={setLogExpanded}>
            <CollapsibleTrigger className="w-full">
              <div className="bg-card/50 backdrop-blur-sm border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="font-display font-bold text-sm">Adventure Log</span>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  logExpanded && "rotate-180"
                )} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 h-[200px]">
                <ActionLog />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
    );
  }

  // Desktop Layout
  return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
        
        {/* Main Action Area - 2 Cols Wide */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex-1 min-h-[300px]">
            <ActiveTask />
          </div>
          
          {/* Quick Inventory / Stats Grid */}
          <div className="h-1/3 grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="bg-card/50 backdrop-blur-sm border-border">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-ui uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <Backpack className="w-4 h-4" /> Quick Inventory
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="grid grid-cols-4 gap-2">
                   {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => (
                     <div key={slot} className="aspect-square bg-black/20 rounded border border-white/5 hover:border-primary/50 cursor-pointer transition-colors flex items-center justify-center group">
                        {slot === 1 && <Gem className="w-5 h-5 text-purple-400 drop-shadow-[0_0_5px_rgba(192,132,252,0.5)] group-hover:scale-110 transition-transform" />}
                        {slot === 2 && <Scroll className="w-5 h-5 text-amber-200 drop-shadow-[0_0_5px_rgba(253,230,138,0.5)] group-hover:scale-110 transition-transform" />}
                     </div>
                   ))}
                 </div>
               </CardContent>
             </Card>

             <Card className="bg-card/50 backdrop-blur-sm border-border">
               <CardHeader className="pb-2">
                 <CardTitle className="text-sm font-ui uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   Active Effects
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-2">
                 <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                   <div className="flex items-center gap-2">
                     <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 hover:bg-blue-900/30">Buff</Badge>
                     <span className="font-ui text-sm">Experience Boost</span>
                   </div>
                   <span className="text-xs font-mono text-muted-foreground">14m</span>
                 </div>
                 <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                   <div className="flex items-center gap-2">
                     <Badge variant="secondary" className="bg-red-900/30 text-red-300 hover:bg-red-900/30">Debuff</Badge>
                     <span className="font-ui text-sm">Poisoned</span>
                   </div>
                   <span className="text-xs font-mono text-muted-foreground">45s</span>
                 </div>
               </CardContent>
             </Card>
          </div>
        </div>

        {/* Right Sidebar - Action Log */}
        <div className="lg:col-span-1 h-full min-h-[400px]">
          <ActionLog />
        </div>

      </div>
  );
}
