import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, NexusType } from '../types';
import { TYPE_CONFIG } from '../constants';

interface GraphVisualizationProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (nodeId: string) => void;
  isDarkMode?: boolean;
}

const GraphVisualization: React.FC<GraphVisualizationProps> = ({ nodes, links, onNodeClick, isDarkMode = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nodes.length || !svgRef.current || !wrapperRef.current) return;

    const width = wrapperRef.current.clientWidth;
    const height = wrapperRef.current.clientHeight;

    // Determine colors based on mode
    const strokeColor = isDarkMode ? '#1e293b' : '#fff'; // Node border (slate-800 vs white)
    const linkColor = isDarkMode ? '#475569' : '#999';   // Link color
    const textColor = isDarkMode ? '#ffffff' : '#000000'; // Text color (white vs black)

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    // Simulation setup
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(30));

    // Render links
    const link = svg.append("g")
      .attr("stroke", linkColor)
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5);

    // Render nodes
    const node = svg.append("g")
      .attr("stroke", strokeColor)
      .attr("stroke-width", 1.5)
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Node circles
    node.append("circle")
      .attr("r", 15)
      .attr("fill", d => TYPE_CONFIG[d.type]?.color || '#9ca3af')
      .on("click", (event, d) => onNodeClick(d.id))
      .attr("cursor", "pointer");

    // Node labels
    node.append("text")
      .text(d => d.title)
      .attr("x", 18)
      .attr("y", 5)
      .attr("font-size", "10px")
      .attr("fill", textColor)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as GraphNode).x!)
        .attr("y1", d => (d.source as GraphNode).y!)
        .attr("x2", d => (d.target as GraphNode).x!)
        .attr("y2", d => (d.target as GraphNode).y!);

      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links, onNodeClick, isDarkMode]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-slate-50 dark:bg-slate-900 overflow-hidden relative rounded-lg shadow-inner transition-colors">
      <div className="absolute top-4 left-4 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur p-2 rounded text-xs text-slate-500 dark:text-slate-400 border border-transparent dark:border-slate-700">
        <p className="font-semibold text-slate-700 dark:text-slate-200">Local Graph Index</p>
        <p>{nodes.length} Objects • {links.length} Relations</p>
      </div>
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};

export default GraphVisualization;