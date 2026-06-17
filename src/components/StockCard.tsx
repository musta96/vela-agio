import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Star } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";

interface StockCardProps {
  stock: {
    symbol: string;
    name: string;
    price: number;
    change: number;
    volume?: string;
    currency?: string;
    market?: string;
  };
}

export const StockCard = ({ stock }: StockCardProps) => {
  const isPositive = stock.change > 0;
  const { isWatched, toggle } = useWatchlist();
  const { toast } = useToast();
  const watched = isWatched(stock.symbol);

  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const added = toggle(stock.symbol, stock.name);
    toast({
      title: added ? "Added to watchlist" : "Removed from watchlist",
      description: `${stock.symbol} - ${stock.name}`,
    });
  };

  const currencyPrefix = stock.currency === "USD" ? "$" : stock.currency === "GBp" ? "" : stock.currency === "GBP" ? "£" : "€";
  const currencySuffix = stock.currency === "GBp" ? "p" : "";

  return (
    <Link to={`/stock/${encodeURIComponent(stock.symbol)}`} className="block">
      <Card className="p-4 card-gradient border-border hover:shadow-xl hover:border-primary/50 transition-all duration-300 cursor-pointer group hover-scale">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {stock.symbol}
              </h3>
              {stock.market && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal text-muted-foreground">
                  {stock.market}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate">{stock.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStar}
              aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
              className="rounded-md p-1 hover:bg-muted transition-colors"
            >
              <Star
                className={`h-4 w-4 transition-colors ${
                  watched ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              />
            </button>
            {isPositive ? (
              <TrendingUp className="h-5 w-5 text-success group-hover:scale-110 transition-transform" />
            ) : (
              <TrendingDown className="h-5 w-5 text-destructive group-hover:scale-110 transition-transform" />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold group-hover:text-primary transition-colors">
              {currencyPrefix}{stock.price.toFixed(2)}{currencySuffix}
            </span>
            <Badge
              variant={isPositive ? "default" : "destructive"}
              className={isPositive ? "bg-success/10 text-success hover:bg-success/20" : ""}
            >
              {isPositive ? "+" : ""}{stock.change}%
            </Badge>
          </div>
          {stock.volume && (
            <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Volume: {stock.volume}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
};
