import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string;
  change: number;
  icon: ReactNode;
}

export const MetricCard = ({ title, value, change, icon }: MetricCardProps) => {
  const isPositive = change > 0;

  return (
    <Card className="p-6 card-gradient border-border hover:shadow-md transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="rounded-lg bg-primary/10 p-2">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-success' : 'text-destructive'}`}>
          {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {isPositive ? "+" : ""}{change}%
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Card>
  );
};
