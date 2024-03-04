import { IncomeExpenseCard } from "@/constant/interfaces";
import { ReactNode } from "react";

export default function (props: IncomeExpenseCard): ReactNode{
    try {

        return <div className="flex m-auto justify-between flex-wrap p-3 container rounded-lg">
            <div className="left-0  bg-green-200 p-3 mx-5 w-1/5 rounded-lg">
                <div className="font-bold text-center text-lg">Income</div>
                <div className=" text-center ">{props.income.toLocaleString()}</div>
            </div>
            <div className="rounded-lg  bg-red-200 w-1/5 p-3 mx-5">
                <div className="font-bold text-center text-lg">Expense</div>
                <div className="text-center ">{props.expense.toLocaleString()}</div>
            </div>
            <div className="rounded-lg  bg-yellow-200 w-1/5 p-3 mx-5">
                <div className="font-bold text-center text-lg">Remaining</div>
                <div className="text-center ">{(props.income - props.expense).toLocaleString()}</div>
            </div>
            <div className="rounded-lg  bg-blue-200 w-1/5 p-3 mx-5 ">
                <div className="font-bold text-center text-lg">Total Amount Invested</div>
                <div className="text-center ">{props.investment.toLocaleString()}</div>
            </div>
        </div>
    } catch (error) {
        console.log("Error on Income Expense Card");
    }
}