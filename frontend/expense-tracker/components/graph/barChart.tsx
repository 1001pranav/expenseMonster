import { useEffect, LegacyRef, useRef, ForwardedRef, forwardRef } from "react";
import Chart, { ChartConfiguration } from 'chart.js/auto';
import { BAR_GRAPH_INTERFACE } from "@/constant/interfaces";

const BarChart = forwardRef<HTMLCanvasElement, BAR_GRAPH_INTERFACE>((props) => {
    const canvas: LegacyRef<HTMLCanvasElement> = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const ctx: CanvasRenderingContext2D | null | undefined = canvas.current?.getContext('2d');

        let chartStatus: Chart | undefined = Chart.getChart(props.id);
        // Destroying the existing chart if it exists
        if (chartStatus !== undefined) {
            chartStatus.destroy();
        }
        if (!ctx) return;
        const chartConfig : ChartConfiguration = {
            type: 'bar',
            data: {
                labels: props.label,
                datasets: [{
                    label: 'Income',
                    data: props.incomeData,
                    backgroundColor: props.incomeBGColor
                },
                {
                    label: 'Expenses',
                    data: props.expenseData,                    
                    backgroundColor: props.expenseBGColor
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: ''
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        }
        new Chart(ctx, chartConfig);
    }, []);

    // Returning the JSX for the PieChart component
    return (
        <div className=''>
            <canvas id={props.id} ref={canvas}></canvas>
        </div>
    );
});


export default BarChart;