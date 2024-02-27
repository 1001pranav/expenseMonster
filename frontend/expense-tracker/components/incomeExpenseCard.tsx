import { IncomeExpenseCard } from "@/constant/interfaces";
import { ReactNode } from "react";

export default function (props: IncomeExpenseCard): ReactNode{
    try {

        return <div className="flex justify-center max-w-7xl flex-wrap p-3 rounded-lg">
            <div className="left-0  bg-green-200 p-3 mx-3 w-1/5 rounded-lg">
                <div className="font-bold text-center text-lg">Income</div>
                <div className=" text-center ">{props.income.toLocaleString()}</div>
            </div>
            <div className="rounded-lg  bg-red-200 w-1/5 p-3 mx-3">
                <div className="font-bold text-center text-lg">Expense</div>
                <div className="text-center ">{props.expense.toLocaleString()}</div>
            </div>
            <div className="rounded-lg  bg-yellow-200 w-1/5 p-3 mx-3">
                <div className="font-bold text-center text-lg">Total</div>
                <div className="text-center ">{(props.income - props.expense).toLocaleString()}</div>
            </div>
        </div>
    } catch (error) {
        console.log("Error on Income Expense Card");
    }
}