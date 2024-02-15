import { CategoryTransaction } from '@/components/graph/transaction';
import IncomeExpenseHorizontalBars from '@/components/horizontal';
import {AddIncomeExpense, UpdateCategory} from '@/components/popupForms';
import { CategoryPercentage } from '@/constant/interfaces';

import { ReactNode, useEffect, useState } from "react";

export default function Expense(): ReactNode{
    const [isIncomeExpensePopupOpen, setIsAddPopupOpen] = useState(false);
    const [isCategoryUpdatePopupOpen, setIsCategoryUpdatePopupOpen] = useState(false);
    
    const [categories, setIsCategory] = useState<CategoryPercentage[]>([
        {name: "Food", percentage: 25},
        {name: "Bills", percentage: 50 },
        {name: "Entertainment", percentage: 10 },
    ]);

    // If esc is clicked then then close all the popups
    useEffect(()=> {
        const handleKeyDown = (event: any) => {
            if (event.keyCode === 27) {
                setIsAddPopupOpen(false);
                setIsCategoryUpdatePopupOpen(false);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, []);

    
    return (
        <div className='max-w-7xl mx-auto'>
            <div className="h-auto w-auto flex flex-row p-1 m-1 bg-gray-100">
                <button
                    className="text-black rounded-md hover:font-bold focus:font-bold "
                    onClick={()=> setIsAddPopupOpen(true)}
                >
                    Add Income or Expense
                </button>
                <span className='px-1 font-bold'>/</span>
                <button
                    className="text-black rounded-md hover:font-bold"
                    onClick={()=> setIsCategoryUpdatePopupOpen(true)}
                >
                    Update Category
                </button>
                <span className='px-1 font-bold'>/</span>
                
            </div>
            <AddIncomeExpense isOpen={isIncomeExpensePopupOpen} onClose={() => setIsAddPopupOpen(false) } />
            <UpdateCategory isOpen={isCategoryUpdatePopupOpen} onClose={() => setIsCategoryUpdatePopupOpen(false)} />
            <IncomeExpenseHorizontalBars income={100} categories={categories} />
            <div className="flex flex-wrap my-4">
                <div className='flex flex-wrap'>
                    <CategoryTransaction categories={[{
                        categoryName: "Food",
                        income: 500,
                        expense: 100
                    }, {
                        categoryName: "Entertainment",
                        income: 250,
                        expense: 100
                    }]}/>
                </div>
            </div>
        </div>
    )
}