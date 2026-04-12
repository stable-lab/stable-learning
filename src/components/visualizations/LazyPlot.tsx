import { lazy, Suspense } from 'react';

const Plot = lazy(async () => {
  const createPlotlyComponent = (await import('react-plotly.js')).default;
  return { default: createPlotlyComponent };
});

export default function LazyPlot(props: any) {
  return (
    <Suspense fallback={<div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading chart...</div>}>
      <Plot {...props} />
    </Suspense>
  );
}
