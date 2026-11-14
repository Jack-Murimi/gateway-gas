export const BRANCH_COLORS: Record<string, string> = {
  'b1111111-1111-1111-1111-111111111111': '#ea580c', // Nextgen - orange
  'b2222222-2222-2222-2222-222222222222': '#2563eb', // Lavington - blue
  'b3333333-3333-3333-3333-333333333333': '#059669', // Jamhuri - emerald
  'b4444444-4444-4444-4444-444444444444': '#7c3aed', // Kileleshwa - violet
};

export const FALLBACK_BRANCH_COLORS = ['#ea580c', '#2563eb', '#059669', '#7c3aed', '#0891b2', '#ca8a04'];

export function getBranchColor(branchId: string, index = 0): string {
  return BRANCH_COLORS[branchId] ?? FALLBACK_BRANCH_COLORS[index % FALLBACK_BRANCH_COLORS.length];
}

export const PRODUCT_COLORS = ['#0f766e', '#ea580c', '#2563eb', '#7c3aed', '#be185d', '#ca8a04', '#4b5563'];

export const CHART_GRID_COLOR = '#e2e8f0';
export const CHART_AXIS_COLOR = '#64748b';
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#0f172a',
};
