import { CategoryTransactionProps, TransactionTableProps } from "@/constant/interfaces";
import React, { ReactNode } from "react";

export default function TransactionTable(props: TransactionTableProps): ReactNode {
    return (<div className="overflow-x-auto">
    <table className="table-auto w-full">
      <thead>
        <tr>
          <th className="border bg-grey-400 px-4 py-2">Date</th>
          <th className="border bg-grey-400 px-4 py-2">Category Name</th>
          <th className="border bg-grey-400 px-4 py-2">Amount</th>
          <th className="border bg-grey-400 px-4 py-2">Type</th>
        </tr>
      </thead>
      <tbody>
        {props.Transactions.map((transaction, index) => (
          <tr
            key={index}
            className={transaction.type === 'expense' ? 'bg-red-200' : 'bg-green-200'}
          >
            <td className="border px-4 py-2"> {transaction.date}</td>
            <td className="border px-4 py-2">{transaction.category}</td>
            <td className="border px-4 py-2">{transaction.amount}</td>
            <td className="border px-4 py-2">{transaction.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>)
} 

export function CategoryTransaction(props: CategoryTransactionProps): ReactNode {
  try {
    return (
      <div className="overflow-x-auto overflow-y-auto">
        <table className="table-auto lg:w-1/2 md:w-full sm:w-full">
          <thead>
            <tr>
              <th className="border bg-grey-400 px-4 py-2">#</th>
              <th className="border bg-grey-400 px-4 py-2">Category Name</th>
              <th className="border bg-grey-400 px-4 py-2">Income</th>
              <th className="border bg-grey-400 px-4 py-2">Expense</th>
            </tr>
          </thead>
          <tbody>
            {props.categories.map((transaction, index)=> <tr key={index} className=""> 
              <td className="px-4 py-2"> {index + 1}</td> 
              <td className="px-4 py-2"> {transaction.categoryName}</td>
              <td className="px-4 py-2"> {transaction.income}</td>
              <td className="px-4 py-2"> {transaction.expense}</td>
            </tr> )}
          </tbody>
        </table>
      </div>
    )
  } catch (error) {
    console.log("Error: on categoryTransaction", error);
    return;
  }
}