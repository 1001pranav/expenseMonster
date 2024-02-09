import { GRAPH_INTERFACE } from "./interfaces";

export const DETAILED_PIE : GRAPH_INTERFACE  = {
    // Labels for pie charts 
    label: ['Income Salary', 'Income Others', 'Expense others', 'Expense Credit Card', 'Expense Bills'],
    // Title for pie charts
    titleText: 'Detailed income-expense breakdown',
    // Background colors for the chart slices
    backgroundColor: [ 
        'rgba(51, 255, 51, 0.9)',
        'rgba(51, 255, 51, 0.7)',
        'rgba(255, 99, 132, 0.9)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(255, 99, 132, 0.5)',
    ],
    data: [],
    id: 'detailedPie'
};

export const INCOME_EXPENSE: GRAPH_INTERFACE = {
    label: ['Income', 'Expense'],
    titleText: 'Income and Expenses details',
    backgroundColor: [
        'rgba(51, 255, 51)',
        'rgba(255, 153, 153)',
    ],
    data: [],
    id: 'incomeExpenses'
};
