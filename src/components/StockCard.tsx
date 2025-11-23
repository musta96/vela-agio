import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StockCardProps {
  stock: {
    symbol: string;
    name: string;
    price: number;
    change: number;
    volume: string;
  };
}

export const StockCard = ({ stock }: StockCardProps) => {
  const isPositive = stock.change > 0;

  return (
    <Card className="p-4 card-gradient border-border hover:shadow-md transition-all duration-300 cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {stock.symbol}
          </h3>
          <p className="text-sm text-muted-foreground">{stock.name}</p>
        </div>
        {isPositive ? (
          <TrendingUp className="h-5 w-5 text-success" />
        ) : (
          <TrendingDown className="h-5 w-5 text-destructive" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">€{stock.price.toFixed(2)}</span>
          <Badge
            variant={isPositive ? "default" : "destructive"}
            className={isPositive ? "bg-success/10 text-success hover:bg-success/20" : ""}
          >
            {isPositive ? "+" : ""}{stock.change}%
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Volume: {stock.volume}
        </div>
      </div>
    </Card>
  );
};
