import { Vega, VisualizationSpec } from 'react-vega';
import { LoaderIcon } from 'lucide-react';

interface VegaChartProps {
  data?: any[];
  schema?: Array<{
    name: string;
    columnType: string;
  }>;
  vegaSpec?: VisualizationSpec | string;
  isLoading?: boolean;
  height?: number;
  width?: number;
}

export function VegaChart({ 
  data, 
  schema, 
  vegaSpec, 
  isLoading = false, 
  height = 350, 
  width = 500 
}: VegaChartProps) {
  if (isLoading && (!data || data.length === 0)) {
    return (
      <div className="flex justify-center items-center h-[350px] bg-muted/20 rounded-lg">
        <LoaderIcon className="animate-spin w-6 h-6 text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading chart...</span>
      </div>
    );
  }

  if (!vegaSpec || !data || data.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-[350px] bg-muted/20 rounded-lg">
        <span className="text-lg font-medium text-muted-foreground">No chart data available</span>
        <span className="text-sm text-muted-foreground mt-1">The query returned no results.</span>
      </div>
    );
  }

  // Format data based on schema
  const formattedData = data.map((row) => {
    const obj: Record<string, any> = {};
    let shouldSkipRow = false;

    (schema || []).forEach((col, index) => {
      const value = row[index];
      
      if (col.columnType === 'number') {
        // Check if value is null/undefined/empty for number columns - skip entire row
        if (value === null || value === undefined || value === '' || value === 'null') {
          shouldSkipRow = true;
          return;
        }
        obj[col.name] = parseFloat(value);
      } else {
        obj[col.name] = value;
      }
    });

    return shouldSkipRow ? null : obj;
  }).filter((obj) => obj !== null);

  const originalSpec = typeof vegaSpec === 'string' ? JSON.parse(vegaSpec) : vegaSpec;

  const baseSpec: any = {
    ...originalSpec,
    data: { values: formattedData },
    width: width,
    height: height,
    title: originalSpec.title || null,
    config: {
      ...originalSpec.config,
      // Apply consistent styling
      background: 'transparent',
      axis: {
        ...originalSpec.config?.axis,
        labelColor: 'hsl(var(--muted-foreground))',
        titleColor: 'hsl(var(--foreground))',
        tickColor: 'hsl(var(--border))',
        gridColor: 'hsl(var(--border))',
      },
      legend: {
        ...originalSpec.config?.legend,
        labelColor: 'hsl(var(--muted-foreground))',
        titleColor: 'hsl(var(--foreground))',
      },
      title: {
        ...originalSpec.config?.title,
        color: 'hsl(var(--foreground))',
      }
    }
  };

  const vegaSpecWithData: VisualizationSpec = baseSpec;

  return (
    <div className="relative bg-background rounded-lg border p-4 my-4">
      <Vega
        spec={vegaSpecWithData}
        actions={false}
        style={{ width: '100%', height: '100%' }}
        tooltip={!isLoading}
        renderer="svg"
      />
    </div>
  );
}