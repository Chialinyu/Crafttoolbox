/**
 * ============================================================================
 * SKELETON GRAPH ANALYSIS - Graph-based skeleton processing
 * ============================================================================
 * 
 * Converts skeleton pixels into a graph structure:
 * - Nodes: endpoints (degree=1) and junctions (degree>2)
 * - Edges: pixel chains connecting nodes
 * 
 * Enables intelligent pruning, main trunk identification, and branch removal
 */

export interface SkeletonNode {
  id: number;
  x: number;
  y: number;
  type: 'endpoint' | 'junction';
  degree: number; // Number of connected edges
}

export interface SkeletonEdge {
  id: number;
  from: number; // Node ID
  to: number;   // Node ID
  pixels: Array<{ x: number; y: number }>;
  length: number;
  avgWidth: number; // Average distance transform value (line thickness)
}

export interface SkeletonGraph {
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
}

/**
 * Build skeleton graph from binary skeleton image
 */
export function buildSkeletonGraph(
  skeleton: Uint8Array,
  width: number,
  height: number,
  distanceMap?: Uint8Array
): SkeletonGraph {
  // Step 1: Identify nodes (endpoints and junctions)
  const nodes: SkeletonNode[] = [];
  const nodeMap = new Map<number, number>(); // pixel idx -> node id
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (skeleton[idx] === 0) continue;
      
      const cn = getCrossingNumber(skeleton, width, height, x, y);
      const neighbors = countNeighbors(skeleton, width, height, x, y);
      
      // Endpoint (CN = 1) or Junction (CN ≥ 3)
      // Special case: X-crossing (CN = 2 but 4 neighbors) is also a junction
      const isJunction = cn >= 3 || (cn === 2 && neighbors === 4);
      
      if (cn === 1 || isJunction) {
        const nodeId = nodes.length;
        nodes.push({
          id: nodeId,
          x,
          y,
          type: cn === 1 ? 'endpoint' : 'junction',
          degree: cn,
        });
        nodeMap.set(idx, nodeId);
      }
    }
  }
  
  // Step 2: Trace edges between nodes
  const edges: SkeletonEdge[] = [];
  const visitedEdges = new Set<string>();
  
  for (const startNode of nodes) {
    // Explore from each neighbor
    const startIdx = startNode.y * width + startNode.x;
    const neighbors = getNeighborPixels(skeleton, width, height, startNode.x, startNode.y);
    
    for (const neighbor of neighbors) {
      const edgeKey = `${Math.min(startNode.id, neighbor.nodeId || -1)}-${Math.max(startNode.id, neighbor.nodeId || -1)}`;
      if (visitedEdges.has(edgeKey)) continue;
      
      // Trace edge from startNode
      const edgePixels = traceEdge(
        skeleton,
        width,
        height,
        neighbor.x,
        neighbor.y,
        startNode.x,
        startNode.y,
        nodeMap
      );
      
      if (edgePixels.endNodeId !== undefined && edgePixels.endNodeId !== startNode.id) {
        // Calculate average width
        let avgWidth = 2; // Default
        if (distanceMap) {
          let widthSum = 0;
          for (const p of edgePixels.pixels) {
            const idx = p.y * width + p.x;
            widthSum += distanceMap[idx];
          }
          avgWidth = (widthSum / edgePixels.pixels.length) * 2; // Diameter
        }
        
        edges.push({
          id: edges.length,
          from: startNode.id,
          to: edgePixels.endNodeId,
          pixels: edgePixels.pixels,
          length: edgePixels.pixels.length,
          avgWidth,
        });
        
        visitedEdges.add(edgeKey);
      }
    }
  }
  
  return { nodes, edges };
}

/**
 * Prune skeleton graph - remove short spurs while preserving main trunk
 */
export function pruneSkeletonGraph(
  graph: SkeletonGraph,
  minSpurLength: number = 15,
  angleThreshold: number = 30 // degrees
): SkeletonGraph {
  const { nodes, edges } = graph;
  const keptEdges = new Set<number>(edges.map(e => e.id));
  let changed = true;
  let iteration = 0;
  
  while (changed && iteration < 10) {
    changed = false;
    iteration++;
    
    // Build adjacency list from kept edges
    const adjacency = new Map<number, number[]>();
    for (const edgeId of keptEdges) {
      const edge = edges[edgeId];
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
      adjacency.get(edge.from)!.push(edgeId);
      adjacency.get(edge.to)!.push(edgeId);
    }
    
    // 🎯 Find and remove short spurs using professional rule: L < α * avgWidth
    for (const node of nodes) {
      const connectedEdges = adjacency.get(node.id) || [];
      
      // Only 1 connected edge = spur endpoint
      if (connectedEdges.length === 1) {
        const edgeId = connectedEdges[0];
        const edge = edges[edgeId];
        
        // 🎯 VERY conservative: only remove tiny noise (α = 2.0)
        const alpha = 2.0;
        const threshold = Math.max(minSpurLength, alpha * edge.avgWidth);
        
        if (edge.length < threshold) {
          keptEdges.delete(edgeId);
          changed = true;
        }
      }
    }
  }
  
  // Build pruned graph
  const prunedEdges = edges.filter(e => keptEdges.has(e.id));
  const usedNodes = new Set<number>();
  for (const edge of prunedEdges) {
    usedNodes.add(edge.from);
    usedNodes.add(edge.to);
  }
  const prunedNodes = nodes.filter(n => usedNodes.has(n.id));
  
  return {
    nodes: prunedNodes,
    edges: prunedEdges,
  };
}

/**
 * Convert skeleton graph back to binary skeleton
 */
export function graphToSkeleton(
  graph: SkeletonGraph,
  width: number,
  height: number
): Uint8Array {
  const skeleton = new Uint8Array(width * height);
  
  // Draw all edges
  for (const edge of graph.edges) {
    for (const p of edge.pixels) {
      const idx = p.y * width + p.x;
      skeleton[idx] = 255;
    }
  }
  
  // Draw all nodes
  for (const node of graph.nodes) {
    const idx = node.y * width + node.x;
    skeleton[idx] = 255;
  }
  
  return skeleton;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Count 8-connected neighbors
 */
function countNeighbors(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  let count = 0;
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (skeleton[nidx] > 0) count++;
      }
    }
  }
  
  return count;
}

/**
 * Calculate Crossing Number (CN) - topological method to detect branch points
 * 
 * CN = (number of 0→1 transitions in 8-neighborhood) / 2
 * 
 * Results:
 * - CN = 0: isolated point
 * - CN = 1: endpoint
 * - CN = 2: continuation (normal line pixel, including zigzags!)
 * - CN ≥ 3: junction/branch point
 * 
 * This correctly distinguishes zigzags (CN=2) from true junctions (CN≥3)
 */
function getCrossingNumber(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  // 8-neighborhood in clockwise order: N, NE, E, SE, S, SW, W, NW
  const offsets = [
    [0, -1],  // N
    [1, -1],  // NE
    [1, 0],   // E
    [1, 1],   // SE
    [0, 1],   // S
    [-1, 1],  // SW
    [-1, 0],  // W
    [-1, -1], // NW
  ];
  
  // Get 8 neighbors (+ wrap to first for circular)
  const values: number[] = [];
  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      const nidx = ny * width + nx;
      values.push(skeleton[nidx] > 0 ? 1 : 0);
    } else {
      values.push(0); // Out of bounds = background
    }
  }
  
  // Count 0→1 transitions
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    const current = values[i];
    const next = values[(i + 1) % 8]; // Wrap around
    if (current === 0 && next === 1) {
      transitions++;
    }
  }
  
  return Math.floor(transitions / 2);
}

/**
 * Get neighbor pixels
 */
function getNeighborPixels(
  skeleton: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): Array<{ x: number; y: number; nodeId?: number }> {
  const neighbors: Array<{ x: number; y: number; nodeId?: number }> = [];
  
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (skeleton[nidx] > 0) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  return neighbors;
}

/**
 * Trace edge from one node to another
 */
function traceEdge(
  skeleton: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  prevX: number,
  prevY: number,
  nodeMap: Map<number, number>
): { pixels: Array<{ x: number; y: number }>; endNodeId?: number } {
  const pixels: Array<{ x: number; y: number }> = [];
  const visited = new Set<number>(); // 🔥 Track visited pixels to prevent infinite loops
  
  let x = startX;
  let y = startY;
  let px = prevX;
  let py = prevY;
  
  while (true) {
    const idx = y * width + x;
    
    // 🔥 Check if we're in a loop
    if (visited.has(idx)) {
      console.warn('⚠️ Edge trace detected loop, stopping');
      return { pixels };
    }
    
    pixels.push({ x, y });
    visited.add(idx);
    
    // Check if we reached a node
    if (nodeMap.has(idx)) {
      return { pixels, endNodeId: nodeMap.get(idx) };
    }
    
    // Find next neighbor (not previous)
    const neighbors = getNeighborPixels(skeleton, width, height, x, y);
    let nextX = -1;
    let nextY = -1;
    
    for (const n of neighbors) {
      if (n.x === px && n.y === py) continue; // Skip previous
      const nidx = n.y * width + n.x;
      if (visited.has(nidx)) continue; // 🔥 Skip already visited pixels
      nextX = n.x;
      nextY = n.y;
      break;
    }
    
    if (nextX < 0) {
      // Dead end or loop closed
      return { pixels };
    }
    
    // Move to next pixel
    px = x;
    py = y;
    x = nextX;
    y = nextY;
    
    // Safety check (should never hit this now)
    if (pixels.length > 10000) {
      console.warn('⚠️ Edge trace exceeded 10000 pixels, stopping');
      return { pixels };
    }
  }
}