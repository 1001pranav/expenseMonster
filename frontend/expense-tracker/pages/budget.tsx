import {AddIncomeExpense, UpdateCategory} from '@/components/popupForms';

import { ReactNode, useEffect, useState } from "react";

export default function Expense(): ReactNode{
    const [isIncomeExpensePopupOpen, setIsAddPopupOpen] = useState(false);
    const [isCategoryUpdatePopupOpen, setIsCategoryUpdatePopupOpen] = useState(false);
    
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
                    className="text-black rounded-md hover:font-bold "
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
            </div>
            <AddIncomeExpense isOpen={isIncomeExpensePopupOpen} onClose={() => setIsAddPopupOpen(false) } />
            <UpdateCategory isOpen={isCategoryUpdatePopupOpen} onClose={() => setIsCategoryUpdatePopupOpen(false)} />
        </div>
    )
}