import React from 'react';
type RiskHeatMapProps = {
  compact?: boolean;
  data?: Array<{ likelihood: number; consequence: number; count: number; level: string }>;
};
const levelColors: Record<string, string> = {
  critical: 'bg-critical',
  high: 'bg-orange-500',
  medium: 'bg-warning',
  low: 'bg-success',
  minimal: 'bg-success-600'
};
const levelLabels: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  minimal: 'Minimal'
};
export function RiskHeatMap({ compact = false, data = [] }: RiskHeatMapProps) {
  const getCell = (likelihood: number, consequence: number) => {
    return data.find(
      (d) => d.likelihood === likelihood && d.consequence === consequence
    );
  };
  const cellSize = compact ? 'w-8 h-8 text-xs' : 'w-12 h-12 text-sm';
  const labelSize = compact ? 'text-xs' : 'text-sm';
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
      <h3 className="text-base font-semibold text-charcoal mb-4">
        Risk Heat Map
      </h3>

      <div className="flex gap-4">
        {/* Matrix */}
        <div className="flex-1">
          <div className="flex">
            {/* Y-axis label */}
            <div className="flex flex-col justify-center items-center mr-2">
              <span
                className={`${labelSize} font-medium text-charcoal-500 transform -rotate-90 whitespace-nowrap`}>

                Likelihood →
              </span>
            </div>

            <div>
              {/* Grid */}
              <div className="flex flex-col-reverse">
                {[1, 2, 3, 4, 5].map((likelihood) =>
                <div key={likelihood} className="flex items-center">
                    <span className={`${labelSize} w-4 text-charcoal-400 mr-1`}>
                      {likelihood}
                    </span>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((consequence) => {
                      const cell = getCell(likelihood, consequence);
                      return (
                        <div
                          key={`${likelihood}-${consequence}`}
                          className={`${cellSize} ${levelColors[cell?.level || 'minimal']} 
                              flex items-center justify-center text-white font-medium 
                              border border-white/20 rounded-sm m-0.5
                              transition-transform hover:scale-110 cursor-pointer`}
                          title={`Likelihood: ${likelihood}, Consequence: ${consequence}, Count: ${cell?.count || 0}`}>

                            {cell?.count || 0}
                          </div>);

                    })}
                    </div>
                  </div>
                )}
              </div>

              {/* X-axis labels */}
              <div className="flex mt-1 ml-5">
                {[1, 2, 3, 4, 5].map((num) =>
                <div
                  key={num}
                  className={`${cellSize} flex items-center justify-center`}>

                    <span className={`${labelSize} text-charcoal-400`}>
                      {num}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-center mt-1 ml-5">
                <span className={`${labelSize} font-medium text-charcoal-500`}>
                  Consequence →
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5">
          <span className={`${labelSize} font-medium text-charcoal-500 mb-1`}>
            Risk Level
          </span>
          {Object.entries(levelColors).map(([level, color]) =>
          <div key={level} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${color}`} />
              <span className={`${labelSize} text-charcoal-500 capitalize`}>
                {levelLabels[level]}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>);

}