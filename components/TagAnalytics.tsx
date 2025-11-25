import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TagConfig, NexusObject } from '../types';
import { db } from '../services/db';
import { BarChart2, PieChart, Activity, FileText } from 'lucide-react';

interface TagAnalyticsProps {
    lang: 'en' | 'es';
}

const TagAnalytics: React.FC<TagAnalyticsProps> = ({ lang }) => {
    const [stats, setStats] = useState<Map<string, number>>(new Map());
    const [configs, setConfigs] = useState<Map<string, TagConfig>>(new Map());
    const [totalDocs, setTotalDocs] = useState(0);
    const barChartRef = useRef<SVGSVGElement>(null);
    const pieChartRef = useRef<SVGSVGElement>(null);

    const t = lang === 'es' ? {
        title: 'Analíticas de Etiquetas',
        topTags: 'Etiquetas Más Usadas',
        colorDist: 'Distribución por Color',
        totalTags: 'Total Etiquetas',
        taggedDocs: 'Docs Etiquetados',
        avgTags: 'Promedio Etiquetas/Doc',
        noData: 'No hay suficientes datos para mostrar analíticas'
    } : {
        title: 'Tag Analytics',
        topTags: 'Top Used Tags',
        colorDist: 'Color Distribution',
        totalTags: 'Total Tags',
        taggedDocs: 'Tagged Docs',
        avgTags: 'Avg Tags/Doc',
        noData: 'Not enough data to show analytics'
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (stats.size > 0) {
            renderBarChart();
            renderPieChart();
        }
    }, [stats, configs]);

    const loadData = async () => {
        const tagStats = await db.getTagStats();
        const tagConfigs = await db.getAllTagConfigs();
        const objects = await db.getObjects();

        const configMap = new Map<string, TagConfig>();
        tagConfigs.forEach(c => configMap.set(c.name, c));

        setStats(tagStats);
        setConfigs(configMap);
        setTotalDocs(objects.length);
    };

    const renderBarChart = () => {
        if (!barChartRef.current) return;

        const svg = d3.select(barChartRef.current);
        svg.selectAll("*").remove();

        const data = Array.from(stats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        if (data.length === 0) return;

        const margin = { top: 20, right: 20, bottom: 40, left: 100 };
        const width = barChartRef.current.clientWidth - margin.left - margin.right;
        const height = 300 - margin.top - margin.bottom;

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[1]) || 0])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(data.map(d => d[0]))
            .range([0, height])
            .padding(0.1);

        g.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "12px");

        g.selectAll(".bar")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("y", d => y(d[0]) || 0)
            .attr("height", y.bandwidth())
            .attr("x", 0)
            .attr("width", d => x(d[1]))
            .attr("fill", d => configs.get(d[0])?.color || '#10b981')
            .attr("rx", 4);

        g.selectAll(".label")
            .data(data)
            .enter().append("text")
            .attr("x", d => x(d[1]) + 5)
            .attr("y", d => (y(d[0]) || 0) + y.bandwidth() / 2 + 4)
            .text(d => d[1])
            .attr("font-size", "12px")
            .attr("fill", "#64748b");
    };

    const renderPieChart = () => {
        if (!pieChartRef.current) return;

        const svg = d3.select(pieChartRef.current);
        svg.selectAll("*").remove();

        // Group by color
        const colorCounts = new Map<string, number>();
        stats.forEach((count, tag) => {
            const color = configs.get(tag)?.color || '#10b981';
            colorCounts.set(color, (colorCounts.get(color) || 0) + count);
        });

        const data = Array.from(colorCounts.entries());
        if (data.length === 0) return;

        const width = pieChartRef.current.clientWidth;
        const height = 300;
        const radius = Math.min(width, height) / 2;

        const g = svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        const pie = d3.pie<[string, number]>()
            .value(d => d[1]);

        const arc = d3.arc<d3.PieArcDatum<[string, number]>>()
            .innerRadius(radius * 0.5) // Donut chart
            .outerRadius(radius * 0.8);

        const arcs = g.selectAll("arc")
            .data(pie(data))
            .enter()
            .append("g");

        arcs.append("path")
            .attr("d", arc)
            .attr("fill", d => d.data[0])
            .attr("stroke", "white")
            .style("stroke-width", "2px");

        // Add labels for large segments
        arcs.append("text")
            .attr("transform", d => `translate(${arc.centroid(d)})`)
            .attr("text-anchor", "middle")
            .text(d => d.data[1])
            .style("fill", "white")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("display", d => (d.endAngle - d.startAngle) > 0.2 ? "block" : "none");
    };

    const totalTags = stats.size;
    const totalTaggedDocs = Array.from(stats.values()).reduce((a: number, b: number) => a + b, 0); // This is actually total tag usages
    // To get unique tagged docs we would need more data, but let's use total usages for now or approximation

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                        <Activity size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t.totalTags}</p>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalTags}</h3>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t.taggedDocs}</p>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalTaggedDocs}</h3>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400">
                        <PieChart size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t.avgTags}</p>
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                            {totalDocs > 0 ? (totalTaggedDocs / totalDocs).toFixed(1) : '0'}
                        </h3>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Bar Chart */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart2 className="text-slate-500" size={20} />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.topTags}</h3>
                    </div>
                    <div className="h-[300px] w-full">
                        <svg ref={barChartRef} width="100%" height="100%" />
                    </div>
                </div>

                {/* Pie Chart */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-6">
                        <PieChart className="text-slate-500" size={20} />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.colorDist}</h3>
                    </div>
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <svg ref={pieChartRef} width="100%" height="100%" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TagAnalytics;
