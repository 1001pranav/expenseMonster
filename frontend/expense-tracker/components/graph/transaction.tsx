import { TransactionTableProps } from "@/constant/interfaces";
import React from "react";

export default function TransactionTable(props: TransactionTableProps) {
    return (<div className="overflow-x-auto">
    <table className="table-auto w-full">
      <thead>
        <tr>
          <th className="px-4 py-2">Date</th>
          <th className="px-4 py-2">Category Name</th>
          <th className="px-4 py-2">Amount</th>
          <th className="px-4 py-2">Type</th>
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