// Importing necessary modules and components
import { GRAPH_INTERFACE } from '@/constant/interfaces';
import Chart, { ChartConfiguration } from 'chart.js/auto';
import React, { useRef, useEffect, LegacyRef, forwardRef } from 'react';

const PieChart = forwardRef<HTMLCanvasElement, GRAPH_INTERFACE>((props, ref) => {
   // Creating a reference for the canvas element
    const canvas: LegacyRef<HTMLCanvasElement> = useRef<HTMLCanvasElement>(null);

    // useEffect hook to create the chart when the component mounts
    useEffect(() => {
        // Getting the 2D rendering context of the canvas
        const ctx: CanvasRenderingContext2D | null | undefined = canvas.current?.getContext('2d');

        let chartStatus: Chart | undefined = Chart.getChart(props.id);
        
        // Destroying the existing chart if it exists
        if (chartStatus !== undefined) {
            chartStatus.destroy();
        }

        // Returning early if the context is not available
        if (!ctx) return;

        // Configuring the chart
        const chartConfig: ChartConfiguration = {
            type: props.graphType, // Setting the chart type to pie
            data: {
                labels: props.label, // Labels for the chart slices
                datasets: [
                    {
                        data: props.data, // Data values for the chart slices
                        backgroundColor: props.backgroundColor,
                        borderWidth: 2, // Border width for the chart slices
                    }
                ],
            },
            options: {
                responsive: true, // Making the chart responsive
                plugins: {
                    legend: { // Configuring the legend
                        position: 'bottom', // Positioning the legend at the top
                    },
                    title: { // Configuring the chart title
                        display: true, // Displaying the title
                        text: props.titleText, // Setting the title text
                    },
                },
            },
        };

        // Creating the chart using the configuration
        new Chart(ctx, chartConfig);
    }, []); // Empty dependency array, so the effect runs only once on mount

    // Returning the JSX for the PieChart component
    return (
        <div className=''>
            <canvas id={props.id} ref={canvas}></canvas>
        </div>
    );
});

// Exporting the PieChart component for use in other modules
export default PieChart;