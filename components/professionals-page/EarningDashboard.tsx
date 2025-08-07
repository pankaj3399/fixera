'use client'
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { earningsData } from '@/data/content';

const EarningsDashboard = () => {
  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-purple-100 text-purple-800 px-4 py-2 border-purple-200">
            Earnings Potential
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Visualize Your Growth
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our platform provides the tools and opportunities to significantly boost your income. See the potential based on average top-performing professionals.
          </p>
        </div>
        <Card className="shadow-2xl border-gray-200">
          <CardHeader>
            <CardTitle>Potential Monthly Earnings (€)</CardTitle>
            <CardDescription>Estimated earnings growth over 9 months on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={earningsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" stroke="#555" />
                  <YAxis stroke="#555" />
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '0.5rem',
                    }}
                    formatter={(value: number) => `€${value.toLocaleString()}`}
                  />
                  <Area type="monotone" dataKey="earnings" stroke="#8884d8" fillOpacity={1} fill="url(#colorEarnings)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default EarningsDashboard;