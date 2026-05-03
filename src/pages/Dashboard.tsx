import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { Users, Activity, TrendingDown, DollarSign } from "lucide-react";

type Prediction = {
  id: string;
  user_id: string;
  inputs: any;
  churn_probability: number;
  lifetime_value: number;
  created_at: string;
};

const Dashboard = () => {
  const { user, isAdmin, loading } = useAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [latestShap, setLatestShap] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: preds } = await supabase.from("predictions").select("*").order("created_at", { ascending: false }).limit(500);
      setPredictions((preds as Prediction[]) ?? []);
      const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      setProfiles(profs ?? []);
      const { data: shap } = await supabase.from("predictions").select("shap_image").not("shap_image", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setLatestShap(shap?.shap_image ?? null);
    })();
  }, [isAdmin]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const total = predictions.length;
  const avgChurn = total ? (predictions.reduce((s, p) => s + Number(p.churn_probability), 0) / total) : 0;
  const totalLTV = predictions.reduce((s, p) => s + Number(p.lifetime_value), 0);
  const highRisk = predictions.filter((p) => p.churn_probability >= 0.5).length;

  // Risk distribution
  const buckets = [
    { name: "Low (0-25%)", value: predictions.filter(p => p.churn_probability < 0.25).length, fill: "hsl(var(--success))" },
    { name: "Medium (25-50%)", value: predictions.filter(p => p.churn_probability >= 0.25 && p.churn_probability < 0.5).length, fill: "hsl(var(--primary))" },
    { name: "High (50-75%)", value: predictions.filter(p => p.churn_probability >= 0.5 && p.churn_probability < 0.75).length, fill: "hsl(var(--warning))" },
    { name: "Extreme (75-100%)", value: predictions.filter(p => p.churn_probability >= 0.75).length, fill: "hsl(var(--danger))" },
  ];

  // Aggregate feature importance: count how often a flag is true among high-risk customers
  const flags = ["SeniorCitizen", "Partner", "Dependents", "PaperlessBilling", "PhoneService", "MultipleLines", "OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies"];
  const featureAgg = flags.map((f) => {
    const highRiskWith = predictions.filter(p => p.churn_probability >= 0.5 && p.inputs?.[f]).length;
    return { feature: f, count: highRiskWith };
  }).sort((a, b) => b.count - a.count);

  // Predictions over time (by day)
  const byDay = predictions.reduce<Record<string, { date: string; count: number; avg: number; sum: number }>>((acc, p) => {
    const d = new Date(p.created_at).toISOString().slice(0, 10);
    acc[d] ??= { date: d, count: 0, avg: 0, sum: 0 };
    acc[d].count++;
    acc[d].sum += Number(p.churn_probability);
    acc[d].avg = acc[d].sum / acc[d].count;
    return acc;
  }, {});
  const timeline = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

  const stats = [
    { label: "Total Predictions", value: total, icon: Activity, color: "text-primary" },
    { label: "Active Users", value: profiles.length, icon: Users, color: "text-accent" },
    { label: "Avg Churn Risk", value: `${(avgChurn * 100).toFixed(1)}%`, icon: TrendingDown, color: "text-warning" },
    { label: "Total LTV", value: `$${totalLTV.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: DollarSign, color: "text-success" },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-10 space-y-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">SHAP analytics, predictions and platform metrics</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="card-elevated p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-3xl font-bold mt-2">{s.value}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="shap">SHAP Analysis</TabsTrigger>
            <TabsTrigger value="predictions">Predictions</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="card-elevated p-6">
                <h3 className="font-semibold mb-4">Risk Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={buckets} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {buckets.map((b, i) => <Cell key={i} fill={b.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card className="card-elevated p-6">
                <h3 className="font-semibold mb-4">Predictions Over Time</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="shap" className="space-y-4 mt-4">
            <Card className="card-elevated p-6">
              <h3 className="font-semibold mb-4">Top features driving high-risk predictions</h3>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={featureAgg} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="feature" width={140} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            {latestShap && (
              <Card className="card-elevated p-4">
                <h3 className="font-semibold mb-2">Latest SHAP explanation</h3>
                <img src={`data:image/png;base64,${latestShap}`} alt="SHAP" className="w-full rounded bg-white" />
              </Card>
            )}
            <Card className="card-elevated p-4">
              <p className="text-sm text-muted-foreground">High-risk customers in dataset: <span className="text-foreground font-semibold">{highRisk}</span></p>
            </Card>
          </TabsContent>

          <TabsContent value="predictions" className="mt-4">
            <Card className="card-elevated p-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Monthly</TableHead>
                    <TableHead>Churn</TableHead>
                    <TableHead>LTV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {predictions.slice(0, 100).map((p) => {
                    const pct = Math.round(Number(p.churn_probability) * 100);
                    const variant = pct >= 75 ? "destructive" : pct >= 50 ? "default" : "secondary";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-mono">{p.user_id.slice(0, 8)}…</TableCell>
                        <TableCell>{p.inputs?.Tenure}</TableCell>
                        <TableCell>${p.inputs?.MonthlyCharges}</TableCell>
                        <TableCell><Badge variant={variant as any}>{pct}%</Badge></TableCell>
                        <TableCell>${Number(p.lifetime_value).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!predictions.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No predictions yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card className="card-elevated p-4 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>{p.full_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
