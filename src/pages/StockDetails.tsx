import { useParams, Link } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Target, AlertCircle, CheckCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// Mock data - will be replaced with real data later
const stockDetails = {
  ENEL: {
    symbol: "ENEL",
    name: "Enel S.p.A",
    price: 6.45,
    change: 2.3,
    metrics: {
      valuation: {
        pe: 12.5,
        pb: 1.8,
        priceToFCF: 8.2,
        priceToEPS: 11.8,
        evToEbitda: 6.5,
        dividendYield: 4.2,
      },
      profitability: {
        roe: 14.5,
        roa: 3.2,
        roi: 8.7,
        operatingMargin: 18.5,
        ebitda: 15200,
        nopat: 4500,
      },
      financialHealth: {
        debtToEquity: 1.45,
        currentRatio: 1.2,
        quickRatio: 0.95,
        interestCoverage: 5.8,
        debtToEbitda: 3.2,
        netDebt: 45000,
      },
      growth: {
        eps: 0.52,
        epsGrowth: 8.5,
        revenueGrowth: 5.2,
        fcfGrowth: 12.3,
      },
      cashFlow: {
        fcf: 3500,
        fcff: 3200,
        fcfe: 2800,
        capex: 5600,
        changeInNowc: -450,
      },
      valuationModels: {
        ddm: 7.20,
        dcf: 7.80,
        capm: 8.5,
        wacc: 6.2,
        intrinsicValue: 7.50,
      },
    },
  },
  // Add more stocks as needed
};

interface MetricItemProps {
  label: string;
  value: string | number;
  suffix?: string;
}

const MetricItem = ({ label, value, suffix = "" }: MetricItemProps) => (
  <div className="flex justify-between items-center py-3 border-b border-border/50 last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold text-foreground">
      {typeof value === "number" ? value.toLocaleString() : value}
      {suffix}
    </span>
  </div>
);

const StockDetails = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const stock = stockDetails[symbol as keyof typeof stockDetails];

  if (!stock) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-foreground">Stock not found</h1>
          </div>
        </div>
      </div>
    );
  }

  const isPositive = stock.change > 0;
  
  // Intrinsic value calculations
  const intrinsicValue = stock.metrics.valuationModels.intrinsicValue;
  const ddmValue = stock.metrics.valuationModels.ddm;
  const dcfValue = stock.metrics.valuationModels.dcf;
  const currentPrice = stock.price;
  
  const valuationDifference = ((intrinsicValue - currentPrice) / currentPrice) * 100;
  const isUndervalued = currentPrice < intrinsicValue;
  const marginOfSafety = isUndervalued ? valuationDifference : 0;
  
  // Calculate valuation gauge (0-100 scale where 50 is fair value)
  const gaugeValue = Math.min(100, Math.max(0, 50 + (valuationDifference / 2)));
  
  const getValuationStatus = () => {
    if (Math.abs(valuationDifference) < 5) return { status: "Fair Value", color: "text-chart-3", bgColor: "bg-chart-3/10", icon: CheckCircle };
    if (isUndervalued) return { status: "Undervalued", color: "text-chart-1", bgColor: "bg-chart-1/10", icon: TrendingDown };
    return { status: "Overvalued", color: "text-chart-2", bgColor: "bg-chart-2/10", icon: TrendingUp };
  };
  
  const valuationStatus = getValuationStatus();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{stock.symbol}</h1>
              <p className="text-lg text-muted-foreground">{stock.name}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-foreground mb-2">€{stock.price.toFixed(2)}</div>
              <div className={`flex items-center gap-2 justify-end ${isPositive ? 'text-success' : 'text-destructive'}`}>
                {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <span className="text-lg font-semibold">
                  {isPositive ? "+" : ""}{stock.change}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Intrinsic Value Analysis */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <Card className="card-gradient border-border mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-primary/5 to-secondary/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Target className="h-8 w-8 text-primary" />
              <div>
                <h2 className="text-2xl font-bold">Intrinsic Value Analysis</h2>
                <p className="text-muted-foreground">Comprehensive valuation assessment</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Current Price Card */}
              <Card className="border-border">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Current Market Price</div>
                    <div className="text-4xl font-bold text-foreground mb-2">€{currentPrice.toFixed(2)}</div>
                    <DollarSign className="h-6 w-6 text-muted-foreground mx-auto" />
                  </div>
                </CardContent>
              </Card>

              {/* Intrinsic Value Card */}
              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Calculated Intrinsic Value</div>
                    <div className="text-4xl font-bold text-primary mb-2">€{intrinsicValue.toFixed(2)}</div>
                    <div className="flex items-center justify-center gap-1">
                      <valuationStatus.icon className={`h-5 w-5 ${valuationStatus.color}`} />
                      <span className={`text-sm font-semibold ${valuationStatus.color}`}>
                        {valuationStatus.status}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Valuation Status Card */}
              <Card className={`border-border ${valuationStatus.bgColor}`}>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Valuation Difference</div>
                    <div className={`text-4xl font-bold mb-2 ${valuationStatus.color}`}>
                      {valuationDifference > 0 ? "+" : ""}{valuationDifference.toFixed(1)}%
                    </div>
                    {isUndervalued && marginOfSafety > 0 && (
                      <Badge className="bg-chart-1/20 text-chart-1 hover:bg-chart-1/30">
                        Margin of Safety: {marginOfSafety.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Valuation Gauge */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-chart-2">Overvalued</span>
                <span className="text-sm font-medium text-chart-3">Fair Value</span>
                <span className="text-sm font-medium text-chart-1">Undervalued</span>
              </div>
              <Progress value={gaugeValue} className="h-3" />
              <div className="flex justify-center mt-2">
                <Badge variant="outline" className="text-xs">
                  Current Position: {gaugeValue.toFixed(0)}/100
                </Badge>
              </div>
            </div>
          </div>

          {/* Multiple Valuation Methods */}
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Valuation Methods Breakdown</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {/* DCF Valuation */}
              <div className="p-4 rounded-lg border border-border hover:bg-accent/5 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">DCF Model</span>
                  {currentPrice < dcfValue ? (
                    <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20 text-xs">
                      Undervalued
                    </Badge>
                  ) : (
                    <Badge className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 text-xs">
                      Overvalued
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">€{dcfValue.toFixed(2)}</span>
                  <span className={`text-sm ${currentPrice < dcfValue ? 'text-chart-1' : 'text-chart-2'}`}>
                    {((dcfValue - currentPrice) / currentPrice * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on future cash flow projections
                </p>
              </div>

              {/* DDM Valuation */}
              <div className="p-4 rounded-lg border border-border hover:bg-accent/5 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">DDM Model</span>
                  {currentPrice < ddmValue ? (
                    <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20 text-xs">
                      Undervalued
                    </Badge>
                  ) : (
                    <Badge className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 text-xs">
                      Overvalued
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">€{ddmValue.toFixed(2)}</span>
                  <span className={`text-sm ${currentPrice < ddmValue ? 'text-chart-1' : 'text-chart-2'}`}>
                    {((ddmValue - currentPrice) / currentPrice * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on dividend discount model
                </p>
              </div>

              {/* P/E Based Valuation */}
              <div className="p-4 rounded-lg border border-border hover:bg-accent/5 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">P/E Based</span>
                  {stock.metrics.valuation.pe < 15 ? (
                    <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20 text-xs">
                      Attractive
                    </Badge>
                  ) : (
                    <Badge className="bg-chart-3/10 text-chart-3 hover:bg-chart-3/20 text-xs">
                      Average
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stock.metrics.valuation.pe.toFixed(1)}x</span>
                  <span className="text-sm text-muted-foreground">P/E Ratio</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Relative to earnings multiple
                </p>
              </div>
            </div>

            {/* Investment Recommendation */}
            <div className="mt-6 p-4 rounded-lg bg-accent/5 border border-border">
              <div className="flex items-start gap-3">
                <AlertCircle className={`h-5 w-5 mt-0.5 ${valuationStatus.color}`} />
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">Investment Assessment</h4>
                  <p className="text-sm text-muted-foreground">
                    {isUndervalued && marginOfSafety > 10 && (
                      <>Strong buy opportunity. The stock is trading significantly below its intrinsic value with a margin of safety of {marginOfSafety.toFixed(1)}%. Multiple valuation models suggest upside potential.</>
                    )}
                    {isUndervalued && marginOfSafety <= 10 && marginOfSafety > 5 && (
                      <>Moderate buy opportunity. The stock appears slightly undervalued with a {marginOfSafety.toFixed(1)}% margin of safety. Consider accumulating on further weakness.</>
                    )}
                    {Math.abs(valuationDifference) < 5 && (
                      <>Fairly valued. The stock is trading close to its intrinsic value. Current price reflects fundamental value reasonably well.</>
                    )}
                    {!isUndervalued && Math.abs(valuationDifference) > 5 && (
                      <>The stock appears overvalued by {Math.abs(valuationDifference).toFixed(1)}%. Consider waiting for a better entry point or taking profits if holding.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="valuation" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-8">
            <TabsTrigger value="valuation">Valuation</TabsTrigger>
            <TabsTrigger value="profitability">Profitability</TabsTrigger>
            <TabsTrigger value="financial">Financial Health</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
            <TabsTrigger value="models">Valuation Models</TabsTrigger>
          </TabsList>

          <TabsContent value="valuation">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Valuation Ratios</CardTitle>
                  <CardDescription>Key valuation metrics for price analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="P/E Ratio" value={stock.metrics.valuation.pe} />
                  <MetricItem label="P/B Ratio" value={stock.metrics.valuation.pb} />
                  <MetricItem label="Price-to-FCF" value={stock.metrics.valuation.priceToFCF} />
                  <MetricItem label="Price-to-EPS" value={stock.metrics.valuation.priceToEPS} />
                  <MetricItem label="EV/EBITDA" value={stock.metrics.valuation.evToEbitda} />
                  <MetricItem label="Dividend Yield" value={stock.metrics.valuation.dividendYield} suffix="%" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="profitability">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Profitability Metrics</CardTitle>
                  <CardDescription>Return and margin analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="ROE (Return on Equity)" value={stock.metrics.profitability.roe} suffix="%" />
                  <MetricItem label="ROA (Return on Assets)" value={stock.metrics.profitability.roa} suffix="%" />
                  <MetricItem label="ROI (Return on Investment)" value={stock.metrics.profitability.roi} suffix="%" />
                  <MetricItem label="Operating Margin" value={stock.metrics.profitability.operatingMargin} suffix="%" />
                  <MetricItem label="EBITDA (M€)" value={stock.metrics.profitability.ebitda} />
                  <MetricItem label="NOPAT (M€)" value={stock.metrics.profitability.nopat} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="financial">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Financial Health</CardTitle>
                  <CardDescription>Debt and liquidity metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="Debt-to-Equity" value={stock.metrics.financialHealth.debtToEquity} />
                  <MetricItem label="Current Ratio" value={stock.metrics.financialHealth.currentRatio} />
                  <MetricItem label="Quick Ratio" value={stock.metrics.financialHealth.quickRatio} />
                  <MetricItem label="Interest Coverage" value={stock.metrics.financialHealth.interestCoverage} />
                  <MetricItem label="Debt-to-EBITDA" value={stock.metrics.financialHealth.debtToEbitda} />
                  <MetricItem label="Net Debt (M€)" value={stock.metrics.financialHealth.netDebt} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="growth">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Growth Metrics</CardTitle>
                  <CardDescription>Year-over-year growth rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="EPS" value={stock.metrics.growth.eps} suffix="€" />
                  <MetricItem label="EPS Growth" value={stock.metrics.growth.epsGrowth} suffix="%" />
                  <MetricItem label="Revenue Growth" value={stock.metrics.growth.revenueGrowth} suffix="%" />
                  <MetricItem label="FCF Growth" value={stock.metrics.growth.fcfGrowth} suffix="%" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cashflow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Cash Flow Analysis</CardTitle>
                  <CardDescription>Free cash flow and capital metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="Free Cash Flow (M€)" value={stock.metrics.cashFlow.fcf} />
                  <MetricItem label="FCFF (M€)" value={stock.metrics.cashFlow.fcff} />
                  <MetricItem label="FCFE (M€)" value={stock.metrics.cashFlow.fcfe} />
                  <MetricItem label="CAPEX (M€)" value={stock.metrics.cashFlow.capex} />
                  <MetricItem label="Change in NOWC (M€)" value={stock.metrics.cashFlow.changeInNowc} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="models">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Valuation Models</CardTitle>
                  <CardDescription>Intrinsic value estimates</CardDescription>
                </CardHeader>
                <CardContent>
                  <MetricItem label="DDM (Dividend Discount Model)" value={stock.metrics.valuationModels.ddm} suffix="€" />
                  <MetricItem label="DCF (Discounted Cash Flow)" value={stock.metrics.valuationModels.dcf} suffix="€" />
                  <MetricItem label="CAPM Expected Return" value={stock.metrics.valuationModels.capm} suffix="%" />
                  <MetricItem label="WACC" value={stock.metrics.valuationModels.wacc} suffix="%" />
                  <MetricItem label="Intrinsic Value" value={stock.metrics.valuationModels.intrinsicValue} suffix="€" />
                </CardContent>
              </Card>

              <Card className="card-gradient border-border">
                <CardHeader>
                  <CardTitle>Valuation Summary</CardTitle>
                  <CardDescription>Current vs. Intrinsic Value</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Price</span>
                      <span className="text-2xl font-bold text-foreground">€{stock.price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Intrinsic Value</span>
                      <span className="text-2xl font-bold text-primary">€{stock.metrics.valuationModels.intrinsicValue.toFixed(2)}</span>
                    </div>
                    <div className="pt-4 border-t border-border">
                      {stock.price < stock.metrics.valuationModels.intrinsicValue ? (
                        <Badge className="bg-success/10 text-success hover:bg-success/20 text-base px-4 py-2">
                          Undervalued by {(((stock.metrics.valuationModels.intrinsicValue - stock.price) / stock.price) * 100).toFixed(1)}%
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-base px-4 py-2">
                          Overvalued by {(((stock.price - stock.metrics.valuationModels.intrinsicValue) / stock.metrics.valuationModels.intrinsicValue) * 100).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default StockDetails;
