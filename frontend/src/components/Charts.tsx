import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Line Chart Component
interface LineChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  // Add these new props
  labelColor?: string;
  axisTitleColor?: string;
  tickColor?: string;
}

export const LineChart: React.FC<LineChartProps> = ({ 
  data, 
  xKey, 
  yKey, 
  color = '#4CAF50',
  height = 300,
  // Set default colors
  labelColor = '#333',
  axisTitleColor = '#555',
  tickColor = '#666'
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis 
          dataKey={xKey} 
          tick={{ fill: tickColor }}
          label={{ 
            value: xKey, 
            position: 'insideBottomRight', 
            offset: -5,
            fill: axisTitleColor
          }}
        />
        <YAxis
          tick={{ fill: tickColor }}
          label={{
            value: yKey,
            angle: -90,
            position: 'insideLeft',
            style: { textAnchor: 'middle' },
            fill: axisTitleColor
          }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
            color: labelColor
          }}
          labelStyle={{ color: labelColor, fontWeight: 'bold' }}
        />
        <Line 
          type="monotone" 
          dataKey={yKey} 
          stroke={color} 
          activeDot={{ r: 6, fill: color, stroke: '#fff' }} 
          strokeWidth={2}
          name={yKey}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
};

// Bar Chart Component
interface BarChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  axisTitleColor?: string;
}

export const BarChart: React.FC<BarChartProps> = ({ 
  data, 
  xKey, 
  yKey, 
  color = '#2196F3',
  height = 300,
  axisTitleColor = '#555',
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey={xKey} tick={{ fill: axisTitleColor }} />
        <YAxis tick={{ fill: axisTitleColor }} />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'rgba(86, 86, 86, 0.9)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
          }} 
        />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
};

// Pie Chart Component
interface PieChartProps {
  data: Array<{
    name: string;
    value: number;
    color?: string;
  }>;
  height?: number;
}

export const PieChart: React.FC<PieChartProps> = ({ 
  data,
  height = 300
}) => {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color || COLORS[index % COLORS.length]} 
            />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
          }} 
        />
        <Legend />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
};