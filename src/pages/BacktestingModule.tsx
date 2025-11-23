import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, TrendingUp, TrendingDown, Play, RotateCcw, Calendar, Target, Shield, DollarSign, BarChart3 } from "lucide-react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { NavLink } from "@/components/NavLink";

// Mock backtesting results data
const equityCurveData = [
  { date: "Jan", portfolio: 100000, benchmark: 100000 },
  { date: "Feb", portfolio: 103500, benchmark: 101200 },
  { date: "Mar", portfolio: 108200, benchmark: 102800 },
  { date: "Apr", portfolio: 106800, benchmark: 104100 },
  { date: "May", portfolio: 112400, benchmark: 105500 },
  { date: "Jun", portfolio: 118900, benchmark: 107200 },
  { date: "Jul", portfolio: 115600, benchmark: 108800 },
  { date: "Aug", portfolio: 122300, benchmark: 110100 },
  { date: "Sep", portfolio: 128700, benchmark: 111900 },
  { date: "Oct", portfolio: 125400, benchmark: 113200 },
  { date: "Nov", portfolio: 132100, benchmark: 115000 },
  { date: "Dec", portfolio: 138500, benchmark: 116500 },
];

const drawdownData = [
  { date: "Jan", drawdown: 0 },
  { date: "Feb", drawdown: -2.1 },
  { date: "Mar", drawdown: 0 },
  { date: "Apr", drawdown: -1.3 },
  { date: "May", drawdown: 0 },
  { date: "Jun", drawdown: 0 },
  { date: "Jul", drawdown: -2.8 },
  { date: "Aug", drawdown: 0 },
  { date: "Sep", drawdown: 0 },
  { date: "Oct", drawdown: -2.6 },
  { date: "Nov", drawdown: 0 },
  { date: "Dec", drawdown: 0 },
];

const monthlyReturnsData = [
  { month: "Jan", returns: 0 },
  { month: "Feb", returns: 3.5 },
  { month: "Mar", returns: 4.5 },
  { month: "Apr", returns: -1.3 },
  { month: "May", returns: 5.2 },
  { month: "Jun", returns: 5.8 },
  { month: "Jul", returns: -2.8 },
  { month: "Aug", returns: 5.8 },
  { month: "Sep", returns: 5.2 },
  { month: "Oct", returns: -2.6 },
  { month: "Nov", returns: 5.3 },
  { month: "Dec", returns: 4.8 },
];

const tradeHistory = [
  { id: 1, symbol: "ENEL.MI", entry: "€6.20", exit: "€6.54", profit: "+€3,400", return: "+5.48%", date: "2024-12-15", type: "Long" },
  { id: 2, symbol: "ISP.MI", entry: "€3.30", exit: "€3.52", profit: "+€4,400", return: "+6.67%", date: "2024-12-10", type: "Long" },
  { id: 3, symbol: "UCG.MI", entry: "€37.80", exit: "€38.92", profit: "+€2,240", return: "+2.96%", date: "2024-12-05", type: "Long" },
  { id: 4, symbol: "ENI.MI", entry: "€14.50", exit: "€14.28", profit: "-€880", return: "-1.52%", date: "2024-11-28", type: "Long" },
  { id: 5, symbol: "STM.MI", entry: "€42.10", exit: "€45.80", profit: "+€5,550", return: "+8.79%", date: "2024-11-22", type: "Long" },
];

const BacktestingModule = () => {
  const [isRunning, setIsRunning] = useState(false);

  const handleRunBacktest = () => {
    setIsRunning(true);
    // Simulate backtest running
    setTimeout(() => setIsRunning(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-gradient">FTSE MIB Analytics</span>
            </div>
            <div className="flex items-center space-x-6">
              <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Sentiment
              </NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-foreground transition-colors" activeClassName="text-primary">
                Backtest
              </NavLink>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Backtesting Module</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Test trading strategies with historical data and comprehensive performance analytics
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Strategy Configuration */}
          <Card className="lg:col-span-1 card-gradient border-border">
            <CardHeader>
              <CardTitle>Strategy Configuration</CardTitle>
              <CardDescription>Set parameters for your backtest</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Strategy Type</Label>
                <Select defaultValue="fundamental">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundamental">Fundamental Analysis</SelectItem>
                    <SelectItem value="technical">Technical Analysis</SelectItem>
                    <SelectItem value="sentiment">Sentiment-Based</SelectItem>
                    <SelectItem value="hybrid">Hybrid Strategy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time Period</Label>
                <Select defaultValue="1y">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3m">3 Months</SelectItem>
                    <SelectItem value="6m">6 Months</SelectItem>
                    <SelectItem value="1y">1 Year</SelectItem>
                    <SelectItem value="3y">3 Years</SelectItem>
                    <SelectItem value="5y">5 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Initial Capital</Label>
                <Input type="number" defaultValue="100000" placeholder="100000" />
              </div>

              <div className="space-y-2">
                <Label>Position Size (%)</Label>
                <Input type="number" defaultValue="20" placeholder="20" />
              </div>

              <div className="space-y-2">
                <Label>Stop Loss (%)</Label>
                <Input type="number" defaultValue="5" placeholder="5" />
              </div>

              <div className="space-y-2">
                <Label>Take Profit (%)</Label>
                <Input type="number" defaultValue="15" placeholder="15" />
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleRunBacktest} disabled={isRunning} className="flex-1 gap-2">
                  <Play className="h-4 w-4" />
                  {isRunning ? "Running..." : "Run Backtest"}
                </Button>
                <Button variant="outline" size="icon">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="card-gradient border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Return</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-chart-1">+38.5%</div>
                      <p className="text-sm text-muted-foreground mt-1">vs Benchmark: +16.5%</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-chart-1" />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Sharpe Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold">1.82</div>
                      <p className="text-sm text-chart-1 mt-1">Excellent risk-adjusted return</p>
                    </div>
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Max Drawdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-chart-2">-2.8%</div>
                      <p className="text-sm text-muted-foreground mt-1">Risk well controlled</p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-chart-2" />
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold">78.3%</div>
                      <p className="text-sm text-muted-foreground mt-1">47 wins / 60 trades</p>
                    </div>
                    <Target className="h-8 w-8 text-secondary" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <Card className="card-gradient border-border">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">€138,500</div>
                    <p className="text-xs text-muted-foreground mt-1">Final Portfolio Value</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">60</div>
                    <p className="text-xs text-muted-foreground mt-1">Total Trades</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-1">+€38,500</div>
                    <p className="text-xs text-muted-foreground mt-1">Total Profit</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">12.8</div>
                    <p className="text-xs text-muted-foreground mt-1">Profit Factor</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <Tabs defaultValue="equity" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="equity">Equity Curve</TabsTrigger>
            <TabsTrigger value="drawdown">Drawdown</TabsTrigger>
            <TabsTrigger value="returns">Monthly Returns</TabsTrigger>
            <TabsTrigger value="trades">Trade History</TabsTrigger>
          </TabsList>

          <TabsContent value="equity">
            <Card className="card-gradient border-border">
              <CardHeader>
                <CardTitle>Portfolio Equity Curve</CardTitle>
                <CardDescription>Portfolio value vs benchmark over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={equityCurveData}>
                    <defs>
                      <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorBenchmark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => `€${value.toLocaleString()}`}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="portfolio"
                      stroke="hsl(var(--chart-1))"
                      fillOpacity={1}
                      fill="url(#colorPortfolio)"
                      strokeWidth={3}
                      name="Portfolio"
                    />
                    <Area
                      type="monotone"
                      dataKey="benchmark"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorBenchmark)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Benchmark"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drawdown">
            <Card className="card-gradient border-border">
              <CardHeader>
                <CardTitle>Drawdown Analysis</CardTitle>
                <CardDescription>Portfolio drawdown over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={drawdownData}>
                    <defs>
                      <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => `${value}%`}
                    />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      stroke="hsl(var(--chart-2))"
                      fillOpacity={1}
                      fill="url(#colorDrawdown)"
                      strokeWidth={2}
                      name="Drawdown"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="returns">
            <Card className="card-gradient border-border">
              <CardHeader>
                <CardTitle>Monthly Returns Distribution</CardTitle>
                <CardDescription>Monthly performance breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyReturnsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => `${value}%`}
                    />
                    <Bar
                      dataKey="returns"
                      fill="hsl(var(--chart-1))"
                      radius={[4, 4, 0, 0]}
                      name="Monthly Return"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trades">
            <Card className="card-gradient border-border">
              <CardHeader>
                <CardTitle>Trade History</CardTitle>
                <CardDescription>Complete list of executed trades</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tradeHistory.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{trade.symbol}</span>
                            <Badge variant="outline" className="text-xs">
                              {trade.type}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{trade.date}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Entry</div>
                          <div className="font-semibold">{trade.entry}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Exit</div>
                          <div className="font-semibold">{trade.exit}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Profit</div>
                          <div
                            className={`font-semibold ${
                              trade.profit.startsWith("+") ? "text-chart-1" : "text-chart-2"
                            }`}
                          >
                            {trade.profit}
                          </div>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="text-sm text-muted-foreground">Return</div>
                          <div
                            className={`font-semibold ${
                              trade.return.startsWith("+") ? "text-chart-1" : "text-chart-2"
                            }`}
                          >
                            {trade.return}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BacktestingModule;
