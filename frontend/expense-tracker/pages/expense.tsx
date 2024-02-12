import IncomeExpenseInput from '@/components/popupForms';

import { ReactNode, useState } from "react";

export default function Expense(): ReactNode{
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const openPopup: () => void = () => {
        setIsPopupOpen(true);
    };

    const closePopup: () => void = () => {
        setIsPopupOpen(false);
    };
    
    return (
        <div>
            <div>
                <div className="min-h-screen flex flex-col w-1/6">
                    <button
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                        onClick={openPopup}
                    >
                        Add Income/Expense
                    </button>
                    <IncomeExpenseInput isOpen={isPopupOpen} onClose={closePopup} />
                    </div>
            </div>
        </div>
    )
}