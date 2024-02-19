import { BillsTransaction, CategoryTransaction } from '@/components/transaction';
import IncomeExpenseHorizontalBars from '@/components/horizontal';
import {AddIncomeExpense, UpdateBills, UpdateCategory} from '@/components/popupForms';
import { CategoryPercentage } from '@/constant/interfaces';

import { ReactNode, useEffect, useState, useRef } from "react";

export default function Expense(): ReactNode {
    const [isIncomeExpensePopupOpen, setIsAddPopupOpen] = useState(false);
    const [isCategoryUpdatePopupOpen, setIsCategoryUpdatePopupOpen] = useState(false);
    const [isBillsUpdatePopupOpen, setIsBillsUpdatePopupOpen] = useState(false);
    
    const incomeExpenseFormRef = useRef<HTMLDivElement>(null);
    const updateCategoryFormRef = useRef<HTMLDivElement>(null);
    const addBillsFormRef = useRef<HTMLDivElement>(null);

    const [categories, setIsCategory] = useState<CategoryPercentage[]>([
        {name: "Food", percentage: 25},
        {name: "Bills", percentage: 50 },
        {name: "Entertainment", percentage: 10 },
    ]);

    const handleClickOutside = (event: MouseEvent) => {
        console.log(incomeExpenseFormRef.current, updateCategoryFormRef.current, addBillsFormRef.current);
        if (incomeExpenseFormRef.current && !incomeExpenseFormRef.current.contains(event.target as Node)) {
            setIsAddPopupOpen(false);
        }
        if (updateCategoryFormRef.current && !updateCategoryFormRef.current.contains(event.target as Node)) {
            setIsCategoryUpdatePopupOpen(false);
        }

        if (addBillsFormRef.current && !addBillsFormRef.current.contains(event.target as Node)) {
            setIsBillsUpdatePopupOpen(false);
        }
    }

    // If esc is clicked then then close all the popups
    useEffect(()=> {
        const handleKeyDown = (event: any) => {
            if (event.keyCode === 27) {
                setIsAddPopupOpen(false);
                setIsCategoryUpdatePopupOpen(false);
                setIsBillsUpdatePopupOpen(false);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, []);

    useEffect(()=> {
        const doc = document;
        doc.addEventListener('mousedown', handleClickOutside);
        return () => doc.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (
        <div className='max-w-7xl mx-auto'>
            <div className="h-auto w-auto flex flex-row p-1 m-1 bg-gray-100">
                <button
                    className="text-black rounded-md hover:font-bold focus:font-bold focus:text-blue-700"
                    onClick={()=> setIsAddPopupOpen(true)}
                >
                    Add Income or Expense
                </button>
                <span className='px-1 font-bold'>/</span>
                <button
                    className="text-black rounded-md hover:font-bold focus:font-bold focus:text-blue-700"
                    onClick={()=> setIsCategoryUpdatePopupOpen(true)}
                >
                    Update Category
                </button>
                <span className='px-1 font-bold'>/</span>
                <button
                    className="text-black rounded-md hover:font-bold focus:font-bold focu   s:text-blue-700"
                    onClick={()=> setIsBillsUpdatePopupOpen(true)}
                >
                    Add or Update Bills
                </button>
                <span className='px-1 font-bold'>/</span>
            </div>
            <AddIncomeExpense isOpen={isIncomeExpensePopupOpen} onClose={() => setIsAddPopupOpen(false) } refObj={incomeExpenseFormRef}/>
            <UpdateCategory isOpen={isCategoryUpdatePopupOpen} onClose={() => setIsCategoryUpdatePopupOpen(false)} refObj={updateCategoryFormRef} />
            <UpdateBills isOpen={isBillsUpdatePopupOpen} onClose={() => setIsBillsUpdatePopupOpen(false)} refObj={addBillsFormRef}/>

            <div className='my-auto py-auto'>
                <IncomeExpenseHorizontalBars income={100} categories={categories} />
            </div>
            <div className="flex flex-wrap my-4 py-4">
                    <CategoryTransaction 
                        categories={[{
                            categoryName: "Food",
                            income: 500,
                            expense: 100
                        }, {
                            categoryName: "Entertainment",
                            income: 250,
                            expense: 100
                        }]}
                        tableHead='Income and expenses of All Categories'
                    />

                    <BillsTransaction 
                        bills={[
                            {
                                billsID: 0,
                                name: "Home Rent",
                                frequencies: 'MONTH',
                                amount: 10000,
                                description: "Monthly rent"
                            },
                            {
                                billsID: 1,
                                name: "Electricity",
                                frequencies: 'MONTH',
                                amount: 1000,
                                description: "Monthly electricity bills"
                            },
                        ]}
                        caption='Total Bills amounts'
                    />
            </div>
        </div>
    )
}