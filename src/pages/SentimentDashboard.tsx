import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, TrendingUp, TrendingDown, Newspaper, Twitter, MessageSquare, BarChart3, LineChart } from "lucide-react";
import { LineChart as RechartsLine, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";

// Mock data - will be replaced with real API data
const sentimentTrendData = [
  { date: "Mon", positive: 65, negative: 25, neutral: 10 },
  { date: "Tue", positive: 70, negative: 20, neutral: 10 },
  { date: "Wed", positive: 60, negative: 30, neutral: 10 },
  { date: "Thu", positive: 75, negative: 18, neutral: 7 },
  { date: "Fri", positive: 68, negative: 22, neutral: 10 },
  { date: "Sat", positive: 72, negative: 20, neutral: 8 },
  { date: "Sun", positive: 71, negative: 21, neutral: 8 },
];

const stockSentiment = [
  { symbol: "ENEL.MI", name: "Enel", score: 78, trend: "up", mentions: 1240, change: 5.2 },
  { symbol: "ENI.MI", name: "Eni", score: 45, trend: "down", mentions: 890, change: -3.8 },
  { symbol: "ISP.MI", name: "Intesa Sanpaolo", score: 82, trend: "up", mentions: 2100, change: 8.1 },
  { symbol: "UCG.MI", name: "UniCredit", score: 71, trend: "up", mentions: 1560, change: 4.3 },
  { symbol: "TIT.MI", name: "Telecom Italia", score: 38, trend: "down", mentions: 750, change: -6.2 },
  { symbol: "STM.MI", name: "STMicroelectronics", score: 85, trend: "up", mentions: 980, change: 9.5 },
];

const newsArticles = [
  {
    id: 1,
    title: "Intesa Sanpaolo Reports Strong Q4 Earnings, Exceeds Expectations",
    source: "Bloomberg",
    time: "2 hours ago",
    sentiment: "positive",
    score: 0.87,
    relevance: 95,
  },
  {
    id: 2,
    title: "Eni Faces Challenges in Renewable Energy Transition",
    source: "Reuters",
    time: "4 hours ago",
    sentiment: "negative",
    score: 0.42,
    relevance: 88,
  },
  {
    id: 3,
    title: "UniCredit CEO Discusses Expansion Plans for 2025",
    source: "Financial Times",
    time: "6 hours ago",
    sentiment: "positive",
    score: 0.72,
    relevance: 82,
  },
  {
    id: 4,
    title: "STMicroelectronics Announces New Chip Manufacturing Partnership",
    source: "The Wall Street Journal",
    time: "8 hours ago",
    sentiment: "positive",
    score: 0.91,
    relevance: 93,
  },
  {
    id: 5,
    title: "Telecom Italia Struggles with Debt Reduction Targets",
    source: "Sole 24 Ore",
    time: "10 hours ago",
    sentiment: "negative",
    score: 0.35,
    relevance: 79,
  },
];

const sentimentDistribution = [
  { name: "Positive", value: 68, color: "hsl(var(--chart-1))" },
  { name: "Neutral", value: 10, color: "hsl(var(--chart-3))" },
  { name: "Negative", value: 22, color: "hsl(var(--chart-2))" },
];

const SentimentDashboard = () => {
  const navigate = useNavigate();

  const getSentimentColor = (score: number) => {
    if (score >= 70) return "text-chart-1";
    if (score >= 50) return "text-chart-3";
    return "text-chart-2";
  };

  const getSentimentBadge = (sentiment: string) => {
    if (sentiment === "positive") {
      return <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20">Positive</Badge>;
    }
    if (sentiment === "negative") {
      return <Badge className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20">Negative</Badge>;
    }
    return <Badge className="bg-chart-3/10 text-chart-3 hover:bg-chart-3/20">Neutral</Badge>;
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
              <NavLink to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:text-primary transition-colors">
                Dashboard
              </NavLink>
              <NavLink to="/sentiment" className="text-sm font-medium text-foreground transition-colors hover:text-primary" activeClassName="text-primary">
                Sentiment
              </NavLink>
              <NavLink to="/backtest" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:text-primary transition-colors">
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
            <MessageSquare className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Sentiment Dashboard</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Real-time sentiment analysis from news, social media, and financial reports
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <Card className="card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overall Sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-chart-1">68%</div>
                  <p className="text-xs text-muted-foreground mt-1">Positive</p>
                </div>
                <TrendingUp className="h-8 w-8 text-chart-1" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Mentions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">8.5K</div>
                  <p className="text-xs text-chart-1 mt-1">+12.4% today</p>
                </div>
                <Newspaper className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">News Articles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">142</div>
                  <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
                </div>
                <BarChart3 className="h-8 w-8 text-secondary" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Social Signals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">3.2K</div>
                  <p className="text-xs text-chart-1 mt-1">+8.7% today</p>
                </div>
                <Twitter className="h-8 w-8 text-accent" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Sentiment Trend Chart */}
          <Card className="lg:col-span-2 card-gradient border-border">
            <CardHeader>
              <CardTitle>Sentiment Trends</CardTitle>
              <CardDescription>7-day sentiment evolution across all FTSE MIB stocks</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={sentimentTrendData}>
                  <defs>
                    <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
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
                  />
                  <Area
                    type="monotone"
                    dataKey="positive"
                    stroke="hsl(var(--chart-1))"
                    fillOpacity={1}
                    fill="url(#colorPositive)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="negative"
                    stroke="hsl(var(--chart-2))"
                    fillOpacity={1}
                    fill="url(#colorNegative)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sentiment Distribution */}
          <Card className="card-gradient border-border">
            <CardHeader>
              <CardTitle>Sentiment Distribution</CardTitle>
              <CardDescription>Current sentiment breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sentimentDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sentimentDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Stock Sentiment Table */}
        <Card className="mb-8 card-gradient border-border">
          <CardHeader>
            <CardTitle>Stock Sentiment Rankings</CardTitle>
            <CardDescription>Real-time sentiment scores for FTSE MIB components</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stockSentiment.map((stock) => (
                <div
                  key={stock.symbol}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/10 hover:border-primary/50 transition-all duration-300 cursor-pointer hover-scale group"
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1">
                      <div className="font-semibold group-hover:text-primary transition-colors">{stock.name}</div>
                      <div className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{stock.symbol}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${getSentimentColor(stock.score)}`}>
                        {stock.score}
                      </div>
                      <div className="text-xs text-muted-foreground">Sentiment Score</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{stock.mentions.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Mentions</div>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <div
                        className={`flex items-center gap-1 justify-end font-semibold ${
                          stock.change > 0 ? "text-chart-1" : "text-chart-2"
                        }`}
                      >
                        {stock.change > 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {Math.abs(stock.change)}%
                      </div>
                      <div className="text-xs text-muted-foreground">24h Change</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* News Feed */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle>Latest News & Analysis</CardTitle>
            <CardDescription>Real-time news aggregation with sentiment scoring</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All News</TabsTrigger>
                <TabsTrigger value="positive">Positive</TabsTrigger>
                <TabsTrigger value="neutral">Neutral</TabsTrigger>
                <TabsTrigger value="negative">Negative</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="space-y-4 mt-6">
                {newsArticles.map((article) => (
                  <div
                    key={article.id}
                    className="p-4 rounded-lg border border-border hover:bg-accent/10 hover:border-primary/30 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getSentimentBadge(article.sentiment)}
                          <span className="text-xs text-muted-foreground">{article.source}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{article.time}</span>
                        </div>
                        <h4 className="font-semibold mb-2 group-hover:text-primary transition-colors">
                          {article.title}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span>Sentiment Score:</span>
                            <span
                              className={`font-semibold ${getSentimentColor(article.score * 100)}`}
                            >
                              {(article.score * 100).toFixed(0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span>Relevance:</span>
                            <span className="font-semibold">{article.relevance}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <LineChart className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="positive" className="text-center py-8 text-muted-foreground">
                Filtered view: Positive sentiment articles only
              </TabsContent>
              <TabsContent value="neutral" className="text-center py-8 text-muted-foreground">
                Filtered view: Neutral sentiment articles only
              </TabsContent>
              <TabsContent value="negative" className="text-center py-8 text-muted-foreground">
                Filtered view: Negative sentiment articles only
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SentimentDashboard;
