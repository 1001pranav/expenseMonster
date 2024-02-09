import { DETAILED_PIE, INCOME_EXPENSE } from "@/constant/graph.constant";
import PieChart from "./graph/pieChart";
import BarChart from "./graph/barChart";
import TransactionTable from "./graph/transaction";
import { Transaction } from "@/constant/interfaces";

export default function Dashboard() {
    const barChartBillsLabel: string[]= ["foods", "health", "utils","Entertainment", "bills"];
    const expenseData: number[] = [25000, 13000, 12000, 13000, 15000];
    const incomeData: number[] = [50000, 45000, 15000, 16000, 15000];
    const transactions: Transaction[] = [
        { date:"10/12/2023", category: 'Food', amount: 50, type: 'expense' },
        { date: "5/12/2023", category: 'Salary', amount: 80, type: 'income' },
        { date: "9/12/2023", category: 'Transportation', amount: 900, type: 'expense' },
    ]
    return (
        <div>
            <div className="flex flex-wrap">
                <div className="w-full sm:w-1/2 md:w-1/4 lg:w-1/4 xl:w-1/4 p-4">
                    <PieChart
                        label={INCOME_EXPENSE.label}
                        titleText={INCOME_EXPENSE.titleText}
                        backgroundColor={INCOME_EXPENSE.backgroundColor}
                        data={[50, 60]}
                        id={INCOME_EXPENSE.id}
                    />
                </div>
                <div className="w-full sm:w-1/2 md:w-1/4 lg:w-1/4 xl:w-1/4 p-4">
                    <PieChart
                        label={DETAILED_PIE.label}
                        titleText={DETAILED_PIE.titleText}
                        backgroundColor={DETAILED_PIE.backgroundColor}
                        data={[40, 30, 60, 70, 80]}
                        id={DETAILED_PIE.id}
                    />
                </div>
                <div className="w-full sm:w-1/2 md:w-1/2 lg:w-1/2 xl:w-1/2 p-4">
                    <BarChart
                        label={barChartBillsLabel}
                        titleText="Income and Expense Categories"
                        backgroundColor={[]}
                        data={[]}
                        expenseData={expenseData}
                        incomeData={incomeData}
                        id="barGraph"
                    />
                </div>
            </div>
            <div className="flex flex-wrap">
            <div className="container mx-auto p-4">
                
                <h1 className="text-2xl font-bold mb-4 text-center">Transactions</h1>
                <TransactionTable Transactions={transactions} />
                </div>
            </div>
        </div>
    );
}