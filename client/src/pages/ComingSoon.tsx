import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { useLocation } from "wouter";

export default function ComingSoon() {
  const [location] = useLocation();
  
  // Extract the page name from the path (e.g., "/inventory" -> "Inventory")
  const pageName = location.substring(1).charAt(0).toUpperCase() + location.substring(2);

  return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Card className="w-full max-w-md bg-card/50 backdrop-blur-md border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl font-display text-primary">
              <Construction className="w-8 h-8" />
              {pageName || "Coming Soon"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground font-ui text-lg">
              This area is currently under development by the guild's architects. Check back later, adventurer!
            </p>
          </CardContent>
        </Card>
      </div>
  );
}
