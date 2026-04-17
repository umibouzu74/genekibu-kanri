export const DAY_COLOR = {
  月: "#3d7a4a", 火: "#c05030", 水: "#2e6a9e",
  木: "#9e8a2e", 金: "#6a3d8e", 土: "#8e3d3d",
};

export const DAY_BG = {
  月: "#e8f2ea", 火: "#fce8e4", 水: "#e4ecf6",
  木: "#f6f2e4", 金: "#ece4f2", 土: "#f2e4e4",
};

export const DEPT_COLOR = {
  中学部: { b: "#d4e8d4", f: "#2a5a2a", accent: "#4a9a4a" },
  高校部: { b: "#f0e0c8", f: "#7a5a1a", accent: "#c08a2a" },
  予備校部: { b: "#cce0f0", f: "#1a4a6a", accent: "#3a8abe" },
};

export function gradeColor(g) {
  if (g.includes("附中")) return { b: "#e8d5b7", f: "#6b4c2a" };
  if (g.includes("中1")) return { b: "#d4e8d4", f: "#2a5a2a" };
  if (g.includes("中2")) return { b: "#cce0f0", f: "#1a4a6a" };
  if (g.includes("中3")) return { b: "#e0d4f0", f: "#4a2a7a" };
  if (g.includes("高1")) return { b: "#f0e0c8", f: "#7a5a1a" };
  if (g.includes("高2")) return { b: "#f0ccc8", f: "#7a2a1a" };
  if (g.includes("高3")) return { b: "#c8c8f0", f: "#1a1a7a" };
  return { b: "#e8e8e8", f: "#444" };
}
