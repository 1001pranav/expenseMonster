import { Bills, CategoryTransactionProps, TransactionTableProps } from "@/constant/interfaces";
import React, { ReactNode, useState } from "react";

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

// export function Table({TableRows, TableData, TableCaption}: {TableRows: string[], TableData: [], TableCaption: string}) {
//   try {
//     <div className="overflow-x-auto overflow-y-auto">
//     <table className="table-auto lg:w-1/2 md:w-full sm:w-full">
//       <caption className="bg-gray-200 text-gray-700 text-center py-2">
//         {TableCaption}
//       </caption>
//       <thead>
//         <tr>
//           <th className="border bg-grey-400 px-4 py-2">#</th>
//           {TableRows.map((data) => <th className="border bg-grey-400 px-4 py-2">{data}</th>)}
//         </tr>
        
//       </thead>
//       <tbody>
        
//         {TableData.map((transaction, index) => <tr key={index} className=""> 
//           <td className="px-4 py-2"> {index + 1}</td> 
//           {
            
//               for( colName in )
            
//           }
//           <td className="px-4 py-2"> {transaction.categoryName}</td>
//           <td className="px-4 py-2"> {transaction.income}</td>
//           <td className="px-4 py-2"> {transaction.expense}</td>
//         </tr> )}
//       </tbody>
//     </table>
//   </div>
//   } catch (error) {
//     console.error("Error: onTable")
//   }
// }

export function CategoryTransaction(props: CategoryTransactionProps): ReactNode {
  try {
    let totalIncomeExpenses = {
      totalIncome: 0,
      totalExpense: 0
    }
    // const [totalIncomeExpense, setTotalIncomeExpense] = useState<TotalIncomeExpense>({
    //   totalIncome: 0,
    //   totalExpense: 0
    // });

    return (
      <div className="overflow-x-auto overflow-y-auto ">
        <table className="table-auto lg:w-1/3 md:w-full sm:w-full">
          <caption className="bg-gray-200 text-gray-700 text-center py-2 font-bold">
            {props.tableHead}
          </caption>
          <thead>
            
            <tr>
              <th className="border bg-grey-400 px-4 py-2">#</th>
              <th className="border bg-grey-400 px-4 py-2">Category Name</th>
              <th className="border bg-grey-400 px-4 py-2">Income</th>
              <th className="border bg-grey-400 px-4 py-2">Expense</th>
            </tr>
            
          </thead>
          <tbody>
            {props.categories.map((transaction, index)=> {
              {
                totalIncomeExpenses = {
                  totalIncome: totalIncomeExpenses.totalIncome + transaction.income,
                  totalExpense: totalIncomeExpenses.totalExpense + transaction.expense
                };
              }
              return <tr key={index} className=""> 
                <td className="px-4 py-2"> {index + 1}</td> 
                <td className="px-4 py-2"> {transaction.categoryName}</td>
                <td className="px-4 py-2"> {transaction.income}</td>
                <td className="px-4 py-2"> {transaction.expense}</td>
              </tr> 
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>
                
              </td>
              <td className="border px-4 py-2">
                Total
              </td>
              <td className="border px-4 py-2">
                {totalIncomeExpenses.totalIncome}
              </td>
              <td className="border px-4 py-2">
                {totalIncomeExpenses.totalExpense}
              </td>
            </tr>
            
          </tfoot>
        </table>
      </div>
    )
  } catch (error) {
    console.log("Error: on categoryTransaction", error);
    return;
  }
}

export function BillsTransaction({bills, caption}: {bills: Bills[], caption: string}): ReactNode {
  try {
    let totalExpenses:number = 0;
  
    return (
      <table className="table-auto lg:w-2/3 md:w-full sm:w-full">
          <caption className="bg-gray-200 text-gray-700 text-center py-2 font-bold">
            {caption}
          </caption>
          <thead>
            <tr>
              <th className="border bg-grey-400 px-4 py-2">#</th>
              <th className="border bg-grey-400 px-4 py-2">Name</th>
              <th className="border bg-grey-400 px-4 py-2">Frequency</th>
              <th className="border bg-grey-400 px-4 py-2">Amount</th>
              <th className="border bg-grey-400 px-4 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((transaction, index)=>{ 
              totalExpenses += transaction.amount;
              return  <tr key={index} className=""> 
              <td className="px-4 py-2"> {index + 1}</td> 
              <td className="px-4 py-2"> {transaction.name}</td>
              <td className="px-4 py-2"> {transaction.frequencies}</td>
              <td className="px-4 py-2"> {transaction.amount}</td>
              <td className="px-4 py-2"> {transaction.description}</td>
            </tr>
            } )}
          </tbody>
          <tfoot>
            <tr>
            <td></td>
            <td></td>
            <td className="border px-4 py-2">Total: </td>
            <td className="border px-4 py-2">{totalExpenses}</td>
            </tr>
          </tfoot>
        </table>
    )
  } catch (error) {
    console.error("Error: onBillsTransaction", error);
    return;
  }
}

export function DisplayExpenses(): ReactNode {
  try {

    return (
      <div>
        <table className="table-auto">
          <caption className="bg-gray-200 text-gray-700 text-center py-2 font-bold">
            All the expenses
          </caption>
          
          <thead>
            <tr className="px-4 py-2">Date of expense</tr>
            <tr className="px-4 py-2">Expense type</tr>
            <tr className="px-4 py-2">Expense type</tr>

          </thead>
        </table>
      </div>
    );
  } catch (error) {
    console.log("Error: onDisplayBills", error);
    return;
  }
}