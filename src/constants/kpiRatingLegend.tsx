import React from 'react';

export const KPI_RATING_LEGEND = (
  <ul className="list-none space-y-1">
    <li><strong>1</strong> = Unsatisfactory overall</li>
    <li><strong>2</strong> = Improvement needed overall</li>
    <li><strong>3</strong> = Successfully meets expectations (Acceptable overall)</li>
    <li><strong>4</strong> = Exceeds expectations (Consistent high standard overall)</li>
    <li><strong>5</strong> = Exceptional (High Performer / potential - Overall excellence)</li>
  </ul>
);

export const KPI_RATING_LEGEND_TEXT: Record<number, string> = {
  1: 'Unsatisfactory overall',
  2: 'Improvement needed overall',
  3: 'Successfully meets expectations (Acceptable overall)',
  4: 'Exceeds expectations (Consistent high standard overall)',
  5: 'Exceptional (High Performer / potential - Overall excellence)'
};
